package com.taskmanager.mobile.ui.viewmodel

import android.content.Context
import android.net.Uri
import android.util.Log
import androidx.biometric.BiometricManager
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.messaging.FirebaseMessaging
import java.time.ZoneId
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import java.io.IOException
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import retrofit2.HttpException
import com.taskmanager.mobile.data.api.ApiClient
import com.taskmanager.mobile.data.api.dto.BoardDto
import com.taskmanager.mobile.data.api.dto.ChecklistItemDto
import com.taskmanager.mobile.data.api.dto.ColumnDto
import com.taskmanager.mobile.data.api.dto.CommentDto
import com.taskmanager.mobile.data.api.dto.CreateCardRequest
import com.taskmanager.mobile.data.api.dto.NotificationPreferenceDto
import com.taskmanager.mobile.data.api.dto.NotificationProfileDto
import com.taskmanager.mobile.data.model.BoardUser
import com.taskmanager.mobile.data.model.KanbanBoard
import com.taskmanager.mobile.data.model.KanbanColumn
import com.taskmanager.mobile.data.model.KanbanTask
import com.taskmanager.mobile.data.model.TaskPriority
import com.taskmanager.mobile.data.repository.KanbanRepository
import com.taskmanager.mobile.data.repository.TodayCardsResult
import com.taskmanager.mobile.notifications.TaskManagerFcmProfileSync
import com.taskmanager.mobile.security.clearToken
import com.taskmanager.mobile.security.clearPin
import com.taskmanager.mobile.security.isBiometricEnabled
import com.taskmanager.mobile.security.isPinEnabled
import com.taskmanager.mobile.security.readSavedThemeMode
import com.taskmanager.mobile.security.savePin
import com.taskmanager.mobile.security.saveThemeMode
import com.taskmanager.mobile.security.setBiometricEnabled
import com.taskmanager.mobile.ui.components.normalizeTimeZoneId
import com.taskmanager.mobile.ui.theme.ThemeMode
import com.taskmanager.mobile.util.DEFAULT_TIME_ZONE
import com.taskmanager.mobile.util.PUSH_DEBUG_TAG
import com.taskmanager.mobile.util.currentIsoTimestamp
import com.taskmanager.mobile.util.normalizeBaseUrl
import com.taskmanager.mobile.util.sortTasksNewestFirst

class KanbanViewModel : ViewModel() {
    private val repository = KanbanRepository()
    private val notificationEventTypes = listOf(
        "board.created", "board.updated", "board.deleted",
        "column.created", "column.updated", "column.deleted",
        "card.created", "card.updated", "card.deleted",
        "card.moved", "card.deadline_reminder"
    )

    private val _session = MutableStateFlow(SessionUiState())
    val session: StateFlow<SessionUiState> = _session.asStateFlow()

    private val _boardState = MutableStateFlow<BoardUiState>(BoardUiState.Loading)
    val boardState: StateFlow<BoardUiState> = _boardState.asStateFlow()

    private val _taskDetailState = MutableStateFlow<TaskDetailState?>(null)
    val taskDetailState: StateFlow<TaskDetailState?> = _taskDetailState.asStateFlow()

    private val _boardUsers = MutableStateFlow<List<BoardUser>>(emptyList())
    val boardUsers: StateFlow<List<BoardUser>> = _boardUsers.asStateFlow()

    private val _todayState = MutableStateFlow<TodayUiState>(TodayUiState.Loading)
    val todayState: StateFlow<TodayUiState> = _todayState.asStateFlow()

    private val _searchState = MutableStateFlow<SearchUiState>(SearchUiState.Idle)
    val searchState: StateFlow<SearchUiState> = _searchState.asStateFlow()

    private val _boardFilterAssignee = MutableStateFlow<Int?>(null)
    val boardFilterAssignee: StateFlow<Int?> = _boardFilterAssignee.asStateFlow()

    private val _authEvents = MutableSharedFlow<AuthEvent>(extraBufferCapacity = 1, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    val authEvents = _authEvents.asSharedFlow()

    private val _securitySettings = MutableStateFlow(SecuritySettings())
    val securitySettings: StateFlow<SecuritySettings> = _securitySettings.asStateFlow()

    // ---- WebSocket real-time sync ----
    private val wsClient = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.SECONDS) // no read timeout for WebSocket
        .build()
    private var activeWebSocket: WebSocket? = null
    private var wsReconnectJob: kotlinx.coroutines.Job? = null
    private var searchJob: kotlinx.coroutines.Job? = null

    private val wsJson = Json { ignoreUnknownKeys = true; explicitNulls = false; coerceInputValues = true }

    init {
        ApiClient.setUnauthorizedHandler {
            viewModelScope.launch {
                handleUnauthorized()
            }
        }
    }

    private fun startWebSocket(domain: String, token: String, boardId: Int) {
        stopWebSocket()
        val proto = if (domain.startsWith("https")) "wss" else "ws"
        val host = domain.removePrefix("https://").removePrefix("http://").trimEnd('/')
        val url = "$proto://$host/ws/boards/$boardId/?token=$token"
        val request = Request.Builder().url(url).build()

        activeWebSocket = wsClient.newWebSocket(request, object : WebSocketListener() {
            override fun onMessage(webSocket: WebSocket, text: String) {
                handleWsMessage(text)
            }
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                scheduleWsReconnect(domain, token, boardId)
            }
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                if (code != 1000) scheduleWsReconnect(domain, token, boardId)
            }
        })
    }

    private fun stopWebSocket() {
        wsReconnectJob?.cancel()
        wsReconnectJob = null
        activeWebSocket?.close(1000, "logout")
        activeWebSocket = null
    }

    private fun scheduleWsReconnect(domain: String, token: String, boardId: Int) {
        wsReconnectJob?.cancel()
        wsReconnectJob = viewModelScope.launch {
            delay(3000L)
            startWebSocket(domain, token, boardId)
        }
    }

    private fun handleWsMessage(text: String) {
        try {
            val obj = wsJson.parseToJsonElement(text)
            val map = (obj as? kotlinx.serialization.json.JsonObject) ?: return
            val type = (map["type"] as? kotlinx.serialization.json.JsonPrimitive)?.content ?: return

            val current = _boardState.value as? BoardUiState.Content ?: return

            when (type) {
                "card.created", "card.updated", "card.moved" -> {
                    val task = repository.taskFromJsonElement(map["card"] ?: return)
                    val updatedBoards = current.boards.map { board ->
                        board.copy(columns = board.columns.map { col ->
                            if (col.id == task.columnId) {
                                val tasks = col.tasks.filterNot {
                                    it.id == task.id ||
                                        (type == "card.created" && it.id < 0 && it.columnId == task.columnId && it.title == task.title)
                                } + task
                                col.copy(tasks = sortTasksNewestFirst(tasks))
                            } else {
                                col.copy(tasks = col.tasks.filter { it.id != task.id })
                            }
                        })
                    }
                    _boardState.value = current.copy(boards = updatedBoards)
                }
                "card.deleted" -> {
                    val cardId = (map["card_id"] as? kotlinx.serialization.json.JsonPrimitive)?.content?.toIntOrNull() ?: return
                    val updatedBoards = current.boards.map { board ->
                        board.copy(columns = board.columns.map { col ->
                            col.copy(tasks = col.tasks.filter { it.id != cardId })
                        })
                    }
                    _boardState.value = current.copy(boards = updatedBoards)
                }
                "column.created" -> {
                    val colDto = wsJson.decodeFromJsonElement(ColumnDto.serializer(), map["column"] ?: return)
                    val updatedBoards = current.boards.map { board ->
                        if (board.id == colDto.board) {
                            val newCol = KanbanColumn(id = colDto.id, boardId = colDto.board, title = colDto.name, icon = colDto.icon.orEmpty(), tasks = emptyList())
                            if (board.columns.any { it.id == colDto.id }) board
                            else board.copy(columns = board.columns + newCol)
                        } else board
                    }
                    _boardState.value = current.copy(boards = updatedBoards)
                }
                "column.updated" -> {
                    val colDto = wsJson.decodeFromJsonElement(ColumnDto.serializer(), map["column"] ?: return)
                    val updatedBoards = current.boards.map { board ->
                        board.copy(columns = board.columns.map { col ->
                            if (col.id == colDto.id) col.copy(title = colDto.name, icon = colDto.icon.orEmpty()) else col
                        })
                    }
                    _boardState.value = current.copy(boards = updatedBoards)
                }
                "column.deleted" -> {
                    val colId = (map["column_id"] as? kotlinx.serialization.json.JsonPrimitive)?.content?.toIntOrNull() ?: return
                    val updatedBoards = current.boards.map { board ->
                        board.copy(columns = board.columns.filter { it.id != colId })
                    }
                    _boardState.value = current.copy(boards = updatedBoards)
                }
                "board.updated" -> {
                    val boardDto = wsJson.decodeFromJsonElement(BoardDto.serializer(), map["board"] ?: return)
                    val updatedBoards = current.boards.map { board ->
                        if (board.id == boardDto.id) board.copy(title = boardDto.name) else board
                    }
                    _boardState.value = current.copy(boards = updatedBoards)
                }
                "board.deleted" -> {
                    val boardId = (map["board_id"] as? kotlinx.serialization.json.JsonPrimitive)?.content?.toIntOrNull() ?: return
                    val updatedBoards = current.boards.filter { it.id != boardId }
                    _boardState.value = current.copy(boards = updatedBoards, selectedBoardId = updatedBoards.firstOrNull()?.id)
                }
            }
        } catch (_: Exception) {}
    }

    override fun onCleared() {
        super.onCleared()
        stopWebSocket()
        ApiClient.setUnauthorizedHandler(null)
    }

    fun bootstrap(context: Context, domain: String, token: String, timeZone: String = DEFAULT_TIME_ZONE) {
        val normalizedDomain = normalizeBaseUrl(domain)
        _session.update {
            it.copy(
                domain = normalizedDomain,
                token = token,
                timeZone = normalizeTimeZoneId(timeZone),
                themeMode = readSavedThemeMode(context),
                isAuthenticated = token.isNotBlank(),
                isBusy = false
            )
        }
        if (token.isNotBlank()) refresh()
    }

    private suspend fun handleUnauthorized() {
        stopWebSocket()
        ApiClient.clearCache()
        _session.value = SessionUiState(domain = session.value.domain)
        _boardState.value = BoardUiState.Loading
        _todayState.value = TodayUiState.Loading
        _searchState.value = SearchUiState.Idle
        _boardFilterAssignee.value = null
        _authEvents.emit(AuthEvent.Unauthorized)
    }

    private fun errorMessage(error: Throwable, fallback: String): String {
        return when (error) {
            is IOException -> "Нет подключения к сети"
            is HttpException -> if (error.code() >= 500) "Ошибка сервера" else (error.message ?: fallback)
            else -> error.message ?: fallback
        }
    }

    private suspend fun loadNotificationProfile(baseUrl: String, apiToken: String): NotificationProfileDto {
        val profile = repository.getNotificationProfile(baseUrl = baseUrl, apiToken = apiToken)
        if (profile.timezoneConfigured) {
            return profile.copy(timezone = normalizeTimeZoneId(profile.timezone))
        }

        val deviceTimeZone = normalizeTimeZoneId(ZoneId.systemDefault().id)
        val updatedProfile = runCatching {
            repository.updateNotificationProfile(baseUrl = baseUrl, apiToken = apiToken, timeZone = deviceTimeZone)
        }.getOrNull()

        val effective = updatedProfile ?: profile.copy(timezone = deviceTimeZone)
        return effective.copy(timezone = normalizeTimeZoneId(effective.timezone))
    }

    fun onDomainChanged(value: String) = _session.update { it.copy(domain = value) }
    fun onUsernameChanged(value: String) = _session.update { it.copy(username = value) }
    fun onPasswordChanged(value: String) = _session.update { it.copy(password = value) }
    fun onThemeModeChanged(context: Context, value: ThemeMode) {
        saveThemeMode(context, value)
        _session.update { it.copy(themeMode = value) }
    }
    fun setBoardAssigneeFilter(assigneeId: Int?) { _boardFilterAssignee.value = assigneeId }

    fun login(onSuccess: (String) -> Unit) {
        val domain = normalizeBaseUrl(session.value.domain)
        if (domain.isBlank()) {
            _session.update { it.copy(errorMessage = "Введите домен backend") }
            return
        }
        if (session.value.username.isBlank() || session.value.password.isBlank()) {
            _session.update { it.copy(errorMessage = "Введите логин и пароль") }
            return
        }

        viewModelScope.launch {
            _session.update { it.copy(isBusy = true, errorMessage = null, domain = domain) }
            runCatching {
                repository.login(domain, session.value.username, session.value.password)
            }.onSuccess { token ->
                onSuccess(token)
                _session.update {
                    it.copy(token = token, isAuthenticated = true, isBusy = false, errorMessage = null, password = "", fcmRegistered = false)
                }
                refresh()
            }.onFailure { error ->
                _session.update { it.copy(isBusy = false, errorMessage = errorMessage(error, "Ошибка входа")) }
            }
        }
    }

    fun logout(context: Context) {
        stopWebSocket()
        val s = session.value
        viewModelScope.launch(Dispatchers.IO) {
            TaskManagerFcmProfileSync.clearToken(context.applicationContext, s.domain, s.token)
            clearToken(context.applicationContext)
        }
        _session.value = SessionUiState(domain = session.value.domain)
        _boardState.value = BoardUiState.Loading
        _todayState.value = TodayUiState.Loading
        _searchState.value = SearchUiState.Idle
        _boardFilterAssignee.value = null
    }

    fun terminateSessions(context: Context) {
        val s = session.value
        viewModelScope.launch(Dispatchers.IO) {
            TaskManagerFcmProfileSync.clearToken(context.applicationContext, s.domain, s.token)
            runCatching { repository.terminateSessions(s.domain, s.token) }
            clearToken(context.applicationContext)
        }
        stopWebSocket()
        _session.value = SessionUiState(domain = session.value.domain)
        _boardState.value = BoardUiState.Loading
        _todayState.value = TodayUiState.Loading
        _searchState.value = SearchUiState.Idle
        _boardFilterAssignee.value = null
    }

    fun refresh() {
        val s = session.value
        if (!s.isAuthenticated || s.token.isBlank()) return

        viewModelScope.launch {
            val prev = _boardState.value
            if (prev !is BoardUiState.Content) {
                _boardState.value = BoardUiState.Loading
            } else {
                _boardState.value = prev.copy(isRefreshing = true)
            }
            // Load boards and users in parallel
            val boardsDeferred = async { runCatching { repository.fetchBoards(baseUrl = s.domain, apiToken = s.token) } }
            val usersDeferred = async { runCatching { repository.fetchUsers(baseUrl = s.domain, apiToken = s.token) } }
            val profileDeferred = async { runCatching { loadNotificationProfile(baseUrl = s.domain, apiToken = s.token) } }
            val meDeferred = async { runCatching { repository.fetchMe(baseUrl = s.domain, apiToken = s.token) } }
            val boardsResult = boardsDeferred.await()
            val usersResult = usersDeferred.await()
            val profileResult = profileDeferred.await()
            val meResult = meDeferred.await()

            usersResult.onSuccess { users -> _boardUsers.value = users }
            profileResult.onSuccess { profile ->
                _session.update { it.copy(timeZone = profile.timezone, fcmToken = profile.fcmToken, email = profile.email) }
            }
            meResult.onSuccess { me ->
                _session.update { it.copy(username = me.username) }
            }

            boardsResult.onSuccess { boards ->
                val selectedId = (prev as? BoardUiState.Content)?.selectedBoardId
                    ?.takeIf { candidate -> boards.any { it.id == candidate } }
                    ?: boards.firstOrNull()?.id
                _boardState.value = BoardUiState.Content(
                    boards = boards,
                    selectedBoardId = selectedId,
                    isRefreshing = false
                )
                if (selectedId != null) {
                    startWebSocket(domain = s.domain, token = s.token, boardId = selectedId)
                }
                loadTodayCards()
            }.onFailure { error ->
                if (prev !is BoardUiState.Content) {
                    _boardState.value = BoardUiState.Error(errorMessage(error, "Ошибка загрузки"))
                } else {
                    _boardState.value = prev.copy(isRefreshing = false)
                }
            }
        }
    }

    fun selectBoard(boardId: Int) {
        val current = _boardState.value as? BoardUiState.Content ?: return
        _boardState.value = current.copy(selectedBoardId = boardId)
        val s = session.value
        if (s.isAuthenticated && s.token.isNotBlank()) {
            startWebSocket(domain = s.domain, token = s.token, boardId = boardId)
        }
    }

    fun createTask(title: String, columnId: Int) {
        if (title.isBlank()) return
        val s = session.value

        // Optimistic update: add a placeholder task to UI immediately
        val current = _boardState.value as? BoardUiState.Content
        val tempId = -(System.nanoTime() % Int.MAX_VALUE).toInt() // negative temp ID
        if (current != null) {
            val placeholder = KanbanTask(
                id = tempId,
                title = title.trim(),
                description = "",
                columnId = columnId,
                dueDate = null,
                priority = TaskPriority.Medium,
                position = Float.MAX_VALUE,
                createdAt = currentIsoTimestamp()
            )
            val updatedBoards = current.boards.map { board ->
                board.copy(columns = board.columns.map { col ->
                    if (col.id == columnId) col.copy(tasks = sortTasksNewestFirst(col.tasks + placeholder))
                    else col
                })
            }
            _boardState.value = current.copy(boards = updatedBoards)
        }

        viewModelScope.launch {
            runCatching {
                repository.createCard(
                    baseUrl = s.domain,
                    apiToken = s.token,
                    request = CreateCardRequest(column = columnId, title = title.trim())
                )
            }.onSuccess { createdTask ->
                val state = _boardState.value as? BoardUiState.Content ?: return@onSuccess
                val updatedBoards = state.boards.map { board ->
                    board.copy(columns = board.columns.map { col ->
                        if (col.id == columnId) {
                            val deduplicated = col.tasks.filterNot { task ->
                                task.id == tempId || task.id == createdTask.id
                            }
                            col.copy(
                                tasks = sortTasksNewestFirst(deduplicated + createdTask)
                            )
                        } else {
                            col
                        }
                    })
                }
                _boardState.value = state.copy(boards = updatedBoards)
            }.onFailure {
                // Rollback: remove the placeholder on error
                val state = _boardState.value as? BoardUiState.Content ?: return@launch
                val rolledBack = state.boards.map { board ->
                    board.copy(columns = board.columns.map { col ->
                        col.copy(tasks = col.tasks.filter { it.id != tempId })
                    })
                }
                _boardState.value = state.copy(boards = rolledBack)
            }
            // No refresh() needed — WebSocket will deliver the real card
        }
    }

    fun moveTask(taskId: Int, toColumnId: Int) {
        val s = session.value

        // Optimistic update: move the task between columns immediately
        val current = _boardState.value as? BoardUiState.Content
        if (current != null) {
            // First, find the task across all boards/columns
            val movedTask = current.boards.flatMap { it.columns }.flatMap { it.tasks }.find { it.id == taskId }
            if (movedTask != null) {
                val relocated = movedTask.copy(columnId = toColumnId, position = Float.MAX_VALUE)
                val updatedBoards = current.boards.map { board ->
                    board.copy(columns = board.columns.map { col ->
                        when (col.id) {
                            toColumnId -> col.copy(tasks = sortTasksNewestFirst(col.tasks.filter { it.id != taskId } + relocated))
                            else -> col.copy(tasks = col.tasks.filter { it.id != taskId })
                        }
                    })
                }
                _boardState.value = current.copy(boards = updatedBoards)
            }
        }

        val snapshot = current // for rollback
        viewModelScope.launch {
            runCatching {
                repository.moveCard(baseUrl = s.domain, apiToken = s.token, cardId = taskId, toColumnId = toColumnId)
            }.onFailure {
                // Rollback to previous state on error
                if (snapshot != null) {
                    _boardState.value = snapshot
                }
            }
            // No refresh() needed — WebSocket will deliver the update
        }
    }

    fun archiveTask(taskId: Int) {
        val s = session.value
        val current = _boardState.value as? BoardUiState.Content ?: return
        val updatedBoards = current.boards.map { board ->
            board.copy(columns = board.columns.map { col ->
                col.copy(tasks = col.tasks.filter { it.id != taskId })
            })
        }
        _boardState.value = current.copy(boards = updatedBoards)

        viewModelScope.launch {
            runCatching {
                repository.deleteCard(baseUrl = s.domain, apiToken = s.token, cardId = taskId)
            }.onFailure {
                _boardState.value = current
            }
        }
    }

    fun loadTodayCards() {
        val s = session.value
        if (!s.isAuthenticated || s.token.isBlank()) return

        viewModelScope.launch {
            _todayState.value = TodayUiState.Loading
            runCatching {
                repository.fetchTodayCards(baseUrl = s.domain, apiToken = s.token)
            }.onSuccess { result ->
                _todayState.value = TodayUiState.Content(result)
            }.onFailure { error ->
                _todayState.value = TodayUiState.Error(errorMessage(error, "Ошибка загрузки"))
            }
        }
    }

    fun search(query: String) {
        val s = session.value
        if (!s.isAuthenticated || s.token.isBlank()) return

        val trimmed = query.trim()
        searchJob?.cancel()

        if (trimmed.length < 2) {
            _searchState.value = SearchUiState.Idle
            return
        }

        searchJob = viewModelScope.launch {
            delay(300)
            _searchState.value = SearchUiState.Loading(query = trimmed)
            runCatching {
                repository.searchCards(baseUrl = s.domain, apiToken = s.token, query = trimmed)
            }.onSuccess { cards ->
                _searchState.value = SearchUiState.Content(query = trimmed, results = cards)
            }.onFailure { error ->
                _searchState.value = SearchUiState.Error(query = trimmed, message = errorMessage(error, "Ошибка поиска"))
            }
        }
    }

    fun registerFcmPush(context: Context) {
        val s = session.value
        Log.d(PUSH_DEBUG_TAG, "registerFcmPush called: isAuth=${s.isAuthenticated} domain=${s.domain}")
        if (!s.isAuthenticated || s.token.isBlank() || s.domain.isBlank()) return
        if (s.fcmRegistered) return

        viewModelScope.launch {
            val pendingSynced = withContext(Dispatchers.IO) {
                TaskManagerFcmProfileSync.retryPendingToken(context.applicationContext, s.domain, s.token)
            }
            if (pendingSynced) {
                _session.update { it.copy(fcmRegistered = true) }
                ensurePushPreferences(s.domain, s.token)
            }

            FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
                if (!task.isSuccessful) {
                    Log.w(PUSH_DEBUG_TAG, "FCM token fetch failed", task.exception)
                    return@addOnCompleteListener
                }
                val fcmToken = task.result.orEmpty()
                if (fcmToken.isBlank()) return@addOnCompleteListener
                viewModelScope.launch {
                    val synced = withContext(Dispatchers.IO) {
                        TaskManagerFcmProfileSync.updateToken(context.applicationContext, s.domain, s.token, fcmToken)
                    }
                    if (synced) {
                        _session.update { it.copy(fcmToken = fcmToken, fcmRegistered = true) }
                        ensurePushPreferences(s.domain, s.token)
                    }
                }
            }
        }
    }

    private suspend fun ensurePushPreferences(domain: String, apiToken: String) {
        runCatching {
            repository.ensurePushNotificationPreferences(baseUrl = domain, apiToken = apiToken, eventTypes = notificationEventTypes)
        }.onFailure { error ->
            Log.w(PUSH_DEBUG_TAG, "Push preferences sync failed", error)
        }
    }

    fun loadTaskDetail(taskId: Int) {
        val s = session.value
        if (!s.isAuthenticated || s.token.isBlank()) return

        viewModelScope.launch {
            _taskDetailState.value = TaskDetailState.Loading
            runCatching {
                val taskDeferred = async { repository.getCard(baseUrl = s.domain, apiToken = s.token, cardId = taskId) }
                val usersDeferred = async { runCatching { repository.fetchUsers(baseUrl = s.domain, apiToken = s.token) }.getOrDefault(emptyList()) }
                val commentsDeferred = async { runCatching { repository.getComments(baseUrl = s.domain, apiToken = s.token, cardId = taskId) }.getOrDefault(emptyList()) }
                Triple(taskDeferred.await(), usersDeferred.await(), commentsDeferred.await())
            }.onSuccess { (task, users, comments) ->
                _taskDetailState.value = TaskDetailState.Content(task = task, users = users, comments = comments)
            }.onFailure { error ->
                _taskDetailState.value = TaskDetailState.Error(errorMessage(error, "Ошибка загрузки"))
            }
        }
    }

    fun saveCard(taskId: Int, draft: KanbanTask, onSuccess: () -> Unit, onError: (String) -> Unit) {
        val s = session.value
        if (!s.isAuthenticated || s.token.isBlank()) return
        val oldTask = (_taskDetailState.value as? TaskDetailState.Content)?.task ?: return

        viewModelScope.launch {
            runCatching {
                repository.updateCard(
                    baseUrl = s.domain,
                    apiToken = s.token,
                    cardId = taskId,
                    oldTask = oldTask,
                    newTask = draft
                )
            }.onSuccess { updatedTask ->
                val current = _taskDetailState.value as? TaskDetailState.Content
                _taskDetailState.value = TaskDetailState.Content(
                    task = updatedTask,
                    users = current?.users ?: emptyList(),
                    comments = current?.comments ?: emptyList()
                )
                refresh()
                onSuccess()
            }.onFailure { error ->
                onError(errorMessage(error, "Ошибка сохранения"))
            }
        }
    }

    fun postComment(cardId: Int, text: String, onSuccess: () -> Unit, onError: (String) -> Unit) {
        val s = session.value
        if (!s.isAuthenticated || s.token.isBlank()) return
        val trimmed = text.trim()
        if (trimmed.isBlank()) return

        viewModelScope.launch {
            runCatching {
                repository.postComment(baseUrl = s.domain, apiToken = s.token, cardId = cardId, text = trimmed)
            }.onSuccess { comment ->
                val current = _taskDetailState.value as? TaskDetailState.Content ?: return@onSuccess
                _taskDetailState.value = current.copy(comments = current.comments + comment)
                onSuccess()
            }.onFailure { error ->
                onError(errorMessage(error, "Ошибка отправки комментария"))
            }
        }
    }

    fun uploadAttachments(context: Context, cardId: Int, uris: List<Uri>, onSuccess: () -> Unit, onError: (String) -> Unit) {
        val s = session.value
        if (!s.isAuthenticated || s.token.isBlank() || uris.isEmpty()) return

        viewModelScope.launch {
            runCatching {
                repository.uploadAttachments(context = context.applicationContext, baseUrl = s.domain, apiToken = s.token, cardId = cardId, uris = uris)
            }.onSuccess { updatedTask ->
                val current = _taskDetailState.value as? TaskDetailState.Content
                _taskDetailState.value = TaskDetailState.Content(
                    task = updatedTask,
                    users = current?.users ?: emptyList(),
                    comments = current?.comments ?: emptyList()
                )
                refresh()
                onSuccess()
            }.onFailure { error ->
                onError(errorMessage(error, "Ошибка загрузки вложений"))
            }
        }
    }

    fun deleteAttachment(cardId: Int, attachmentId: String, onSuccess: () -> Unit, onError: (String) -> Unit) {
        val s = session.value
        if (!s.isAuthenticated || s.token.isBlank()) return

        viewModelScope.launch {
            runCatching {
                repository.deleteAttachment(baseUrl = s.domain, apiToken = s.token, cardId = cardId, attachmentId = attachmentId)
            }.onSuccess { updatedTask ->
                val current = _taskDetailState.value as? TaskDetailState.Content
                _taskDetailState.value = TaskDetailState.Content(
                    task = updatedTask,
                    users = current?.users ?: emptyList(),
                    comments = current?.comments ?: emptyList()
                )
                refresh()
                onSuccess()
            }.onFailure { error ->
                onError(errorMessage(error, "Ошибка удаления вложения"))
            }
        }
    }

    fun createAttachment(cardId: Int, name: String, type: String, url: String, onSuccess: () -> Unit, onError: (String) -> Unit) {
        val s = session.value
        if (!s.isAuthenticated || s.token.isBlank()) return

        viewModelScope.launch {
            runCatching {
                repository.createAttachment(
                    baseUrl = s.domain,
                    apiToken = s.token,
                    cardId = cardId,
                    name = name,
                    type = type,
                    url = url
                )
            }.onSuccess { updatedTask ->
                val current = _taskDetailState.value as? TaskDetailState.Content
                _taskDetailState.value = TaskDetailState.Content(
                    task = updatedTask,
                    users = current?.users ?: emptyList(),
                    comments = current?.comments ?: emptyList()
                )
                refresh()
                onSuccess()
            }.onFailure { error ->
                onError(errorMessage(error, "Ошибка создания вложения"))
            }
        }
    }

    fun saveTaskChecklist(taskId: Int, newChecklist: List<ChecklistItemDto>, onSuccess: () -> Unit, onError: (String) -> Unit) {
        val s = session.value
        if (!s.isAuthenticated || s.token.isBlank()) return

        // Snapshot old checklist for diff (needed to build change descriptions)
        val oldChecklist = (_taskDetailState.value as? TaskDetailState.Content)?.task?.checklist
            ?: emptyList()

        viewModelScope.launch {
            runCatching {
                repository.updateCardChecklist(
                    baseUrl = s.domain,
                    apiToken = s.token,
                    cardId = taskId,
                    oldChecklist = oldChecklist,
                    newChecklist = newChecklist
                )
            }.onSuccess { updatedTask ->
                // Update detail screen with server-confirmed state (including new version)
                val current = _taskDetailState.value as? TaskDetailState.Content
                _taskDetailState.value = TaskDetailState.Content(
                    task = updatedTask,
                    users = current?.users ?: emptyList(),
                    comments = current?.comments ?: emptyList()
                )
                // Refresh board so card list is up-to-date
                refresh()
                onSuccess()
            }.onFailure { error ->
                onError(errorMessage(error, "Ошибка сохранения"))
            }
        }
    }

    fun clearTaskDetail() {
        _taskDetailState.value = null
    }

    fun loadSecuritySettings(context: Context) {
        val result = BiometricManager.from(context)
            .canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK)
        // BIOMETRIC_SUCCESS = enrolled, BIOMETRIC_ERROR_NONE_ENROLLED = hardware present but no fingerprint set up
        val available = result == BiometricManager.BIOMETRIC_SUCCESS ||
            result == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED
        Log.d("TM_BIO", "canAuthenticate result=$result available=$available")
        _securitySettings.value = SecuritySettings(
            pinEnabled = isPinEnabled(context),
            biometricEnabled = isBiometricEnabled(context),
            biometricAvailable = available
        )
    }

    fun enablePin(context: Context, pin: String) {
        savePin(context, pin)
        _securitySettings.update { it.copy(pinEnabled = true) }
    }

    fun disablePin(context: Context) {
        clearPin(context)
        _securitySettings.update { it.copy(pinEnabled = false, biometricEnabled = false) }
    }

    fun setBiometric(context: Context, enabled: Boolean) {
        setBiometricEnabled(context, enabled)
        _securitySettings.update { it.copy(biometricEnabled = enabled) }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

data class SessionUiState(
    val isBusy: Boolean = false,
    val isAuthenticated: Boolean = false,
    val domain: String = "",
    val token: String = "",
    val timeZone: String = DEFAULT_TIME_ZONE,
    val username: String = "",
    val email: String = "",
    val password: String = "",
    val fcmToken: String = "",
    val fcmRegistered: Boolean = false,
    val themeMode: ThemeMode = ThemeMode.System,
    val errorMessage: String? = null
)

sealed interface BoardUiState {
    data object Loading : BoardUiState
    data class Error(val message: String) : BoardUiState
    data class Content(
        val boards: List<KanbanBoard>,
        val selectedBoardId: Int?,
        val isRefreshing: Boolean = false
    ) : BoardUiState
}

sealed interface TaskDetailState {
    data object Loading : TaskDetailState
    data class Error(val message: String) : TaskDetailState
    data class Content(
        val task: KanbanTask,
        val users: List<BoardUser> = emptyList(),
        val comments: List<CommentDto> = emptyList()
    ) : TaskDetailState
}

data class SecuritySettings(
    val pinEnabled: Boolean = false,
    val biometricEnabled: Boolean = false,
    val biometricAvailable: Boolean = false
)

sealed interface TodayUiState {
    data object Loading : TodayUiState
    data class Error(val message: String) : TodayUiState
    data class Content(val data: TodayCardsResult) : TodayUiState
}

sealed interface SearchUiState {
    data object Idle : SearchUiState
    data class Loading(val query: String) : SearchUiState
    data class Error(val query: String, val message: String) : SearchUiState
    data class Content(val query: String, val results: List<KanbanTask>) : SearchUiState
}

sealed interface AuthEvent {
    data object Unauthorized : AuthEvent
}
