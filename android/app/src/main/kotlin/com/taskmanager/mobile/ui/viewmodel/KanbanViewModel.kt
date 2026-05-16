package com.taskmanager.mobile.ui.viewmodel

import android.Manifest
import android.content.Context
import android.content.SharedPreferences
import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Build
import android.util.Log
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.compose.setContent
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.FloatingActionButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import okhttp3.Interceptor
import okhttp3.MediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.ResponseBody
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import retrofit2.HttpException
import retrofit2.Retrofit
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.concurrent.TimeUnit
import java.util.Calendar
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import com.google.firebase.messaging.FirebaseMessaging
import com.taskmanager.mobile.notifications.TaskManagerFcmProfileSync
import com.taskmanager.mobile.BuildConfig
import com.taskmanager.mobile.ui.theme.TaskManagerTheme
import com.taskmanager.mobile.ui.navigation.*
import com.taskmanager.mobile.ui.components.*
import com.taskmanager.mobile.ui.screens.login.*
import com.taskmanager.mobile.ui.screens.board.*
import com.taskmanager.mobile.ui.screens.taskdetail.*
import com.taskmanager.mobile.ui.screens.pin.*
import com.taskmanager.mobile.ui.screens.settings.*
import com.taskmanager.mobile.ui.viewmodel.*
import com.taskmanager.mobile.data.api.*
import com.taskmanager.mobile.data.api.dto.*
import com.taskmanager.mobile.data.model.*
import com.taskmanager.mobile.data.repository.*
import com.taskmanager.mobile.security.*
import com.taskmanager.mobile.util.*

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

    private val _securitySettings = MutableStateFlow(SecuritySettings())
    val securitySettings: StateFlow<SecuritySettings> = _securitySettings.asStateFlow()

    // ---- WebSocket real-time sync ----
    private val wsClient = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.SECONDS) // no read timeout for WebSocket
        .build()
    private var activeWebSocket: WebSocket? = null
    private var wsReconnectJob: kotlinx.coroutines.Job? = null

    private val wsJson = Json { ignoreUnknownKeys = true; explicitNulls = false; coerceInputValues = true }

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
                                val tasks = col.tasks.filter { it.id != task.id } + task
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
    }

    fun bootstrap(domain: String, token: String, timeZone: String = DEFAULT_TIME_ZONE) {
        val normalizedDomain = normalizeBaseUrl(domain)
        _session.update {
            it.copy(
                domain = normalizedDomain,
                token = token,
                timeZone = normalizeTimeZoneId(timeZone),
                isAuthenticated = token.isNotBlank(),
                isBusy = false
            )
        }
        if (token.isNotBlank()) refresh()
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
                _session.update { it.copy(isBusy = false, errorMessage = error.message ?: "Ошибка входа") }
            }
        }
    }

    fun logout(context: Context) {
        stopWebSocket()
        viewModelScope.launch(Dispatchers.IO) {
            TaskManagerFcmProfileSync.clearToken(context.applicationContext)
        }
        _session.value = SessionUiState(domain = session.value.domain)
        _boardState.value = BoardUiState.Loading
    }

    fun terminateSessions(context: Context) {
        val s = session.value
        viewModelScope.launch(Dispatchers.IO) {
            runCatching { repository.terminateSessions(s.domain, s.token) }
        }
        logout(context)
    }

    fun refresh() {
        val s = session.value
        if (!s.isAuthenticated || s.token.isBlank()) return

        viewModelScope.launch {
            val prev = _boardState.value
            if (prev !is BoardUiState.Content) {
                _boardState.value = BoardUiState.Loading
            }
            // Load boards and users in parallel
            val boardsDeferred = async { runCatching { repository.fetchBoards(baseUrl = s.domain, apiToken = s.token) } }
            val usersDeferred = async { runCatching { repository.fetchUsers(baseUrl = s.domain, apiToken = s.token) } }
            val profileDeferred = async { runCatching { loadNotificationProfile(baseUrl = s.domain, apiToken = s.token) } }
            val boardsResult = boardsDeferred.await()
            val usersResult = usersDeferred.await()
            val profileResult = profileDeferred.await()

            usersResult.onSuccess { users -> _boardUsers.value = users }
            profileResult.onSuccess { profile ->
                _session.update { it.copy(timeZone = profile.timezone, fcmToken = profile.fcmToken) }
            }

            boardsResult.onSuccess { boards ->
                val selectedId = (prev as? BoardUiState.Content)?.selectedBoardId
                    ?.takeIf { candidate -> boards.any { it.id == candidate } }
                    ?: boards.firstOrNull()?.id
                _boardState.value = BoardUiState.Content(boards = boards, selectedBoardId = selectedId)
                if (selectedId != null) {
                    startWebSocket(domain = s.domain, token = s.token, boardId = selectedId)
                }
            }.onFailure { error ->
                if (prev !is BoardUiState.Content) {
                    _boardState.value = BoardUiState.Error(error.message ?: "Ошибка загрузки")
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
                            col.copy(
                                tasks = sortTasksNewestFirst(col.tasks.map { task ->
                                    if (task.id == tempId) createdTask else task
                                })
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

    fun deleteTask(taskId: Int) {
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

    fun registerFcmPush(context: Context) {
        val s = session.value
        Log.d(PUSH_DEBUG_TAG, "registerFcmPush called: isAuth=${s.isAuthenticated} domain=${s.domain}")
        if (!s.isAuthenticated || s.token.isBlank() || s.domain.isBlank()) return
        if (s.fcmRegistered) return

        viewModelScope.launch {
            withContext(Dispatchers.IO) {
                TaskManagerFcmProfileSync.retryPendingToken(context.applicationContext)
            }
            runCatching {
                repository.ensurePushNotificationPreferences(baseUrl = s.domain, apiToken = s.token, eventTypes = notificationEventTypes)
            }.onSuccess {
                FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
                    if (!task.isSuccessful) {
                        Log.w(PUSH_DEBUG_TAG, "FCM token fetch failed", task.exception)
                        return@addOnCompleteListener
                    }
                    val fcmToken = task.result.orEmpty()
                    if (fcmToken.isBlank()) return@addOnCompleteListener
                    viewModelScope.launch {
                        val synced = withContext(Dispatchers.IO) {
                            TaskManagerFcmProfileSync.updateToken(context.applicationContext, fcmToken)
                        }
                        if (synced) {
                            _session.update { it.copy(fcmToken = fcmToken, fcmRegistered = true) }
                        }
                    }
                }
            }
        }
    }

    fun loadTaskDetail(taskId: Int) {
        val s = session.value
        if (!s.isAuthenticated || s.token.isBlank()) return

        viewModelScope.launch {
            _taskDetailState.value = TaskDetailState.Loading
            runCatching {
                repository.getCard(baseUrl = s.domain, apiToken = s.token, cardId = taskId)
            }.onSuccess { task ->
                val users = runCatching { repository.fetchUsers(baseUrl = s.domain, apiToken = s.token) }.getOrDefault(emptyList())
                _taskDetailState.value = TaskDetailState.Content(task = task, users = users)
            }.onFailure { error ->
                _taskDetailState.value = TaskDetailState.Error(error.message ?: "Ошибка загрузки")
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
                val users = (_taskDetailState.value as? TaskDetailState.Content)?.users ?: emptyList()
                _taskDetailState.value = TaskDetailState.Content(task = updatedTask, users = users)
                refresh()
                onSuccess()
            }.onFailure { error ->
                onError(error.message ?: "Ошибка сохранения")
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
                _taskDetailState.value = TaskDetailState.Content(updatedTask)
                // Refresh board so card list is up-to-date
                refresh()
                onSuccess()
            }.onFailure { error ->
                onError(error.message ?: "Ошибка сохранения")
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
    val password: String = "",
    val fcmToken: String = "",
    val fcmRegistered: Boolean = false,
    val errorMessage: String? = null
)

sealed interface BoardUiState {
    data object Loading : BoardUiState
    data class Error(val message: String) : BoardUiState
    data class Content(val boards: List<KanbanBoard>, val selectedBoardId: Int?) : BoardUiState
}

sealed interface TaskDetailState {
    data object Loading : TaskDetailState
    data class Error(val message: String) : TaskDetailState
    data class Content(val task: KanbanTask, val users: List<BoardUser> = emptyList()) : TaskDetailState
}

data class SecuritySettings(
    val pinEnabled: Boolean = false,
    val biometricEnabled: Boolean = false,
    val biometricAvailable: Boolean = false
)
