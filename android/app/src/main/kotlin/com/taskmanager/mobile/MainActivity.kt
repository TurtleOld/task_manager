package com.taskmanager.mobile

import android.os.Bundle
import android.content.Context
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.Button
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalContext
import androidx.compose.foundation.text.KeyboardOptions
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.onesignal.OneSignal
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            TaskManagerTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    MainScreen()
                }
            }
        }
    }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
private fun MainScreen(vm: KanbanViewModel = viewModel()) {
    val context = LocalContext.current
    val uiState = vm.uiState

    LaunchedEffect(Unit) {
        val savedDomain = readSavedDomain(context)
        val savedToken = readSavedToken(context)
        vm.bootstrap(
            domain = if (savedDomain.isBlank()) BuildConfig.API_BASE_URL else savedDomain,
            token = savedToken
        )

        vm.registerPushPlayerId(currentOneSignalPlayerId())

        if (BuildConfig.ONESIGNAL_APP_ID.isNotBlank()) {
            OneSignal.Notifications.requestPermission(true)
        }
    }

    if (!uiState.isAuthenticated) {
        LoginScreen(
            domain = uiState.domain,
            username = uiState.username,
            password = uiState.password,
            isLoading = uiState.isLoading,
            errorMessage = uiState.errorMessage,
            onDomainChange = vm::onDomainChanged,
            onUsernameChange = vm::onUsernameChanged,
            onPasswordChange = vm::onPasswordChanged,
            onLoginClick = {
                vm.login(playerId = currentOneSignalPlayerId()) {
                    saveDomain(context, uiState.domain)
                    saveToken(context, it)
                }
            }
        )
        return
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(text = "Task Manager", style = MaterialTheme.typography.titleLarge)
                        Text(
                            text = "Mobile Kanban",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                }
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = { vm.addCardToBacklog("Новая задача") }) {
                Text(text = "+")
            }
        }
    ) { padding ->
        if (uiState.isLoading) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator()
            }
            return@Scaffold
        }

        if (uiState.errorMessage != null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(24.dp),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(text = uiState.errorMessage, color = MaterialTheme.colorScheme.error)
                    Spacer(modifier = Modifier.height(12.dp))
                    TextButton(onClick = vm::refresh) { Text("Повторить") }
                    TextButton(
                        onClick = {
                            clearToken(context)
                            vm.logout()
                        }
                    ) {
                        Text("Выйти")
                    }
                }
            }
            return@Scaffold
        }

        val selectedBoard = uiState.selectedBoard
        if (selectedBoard == null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentAlignment = Alignment.Center
            ) {
                Text("Нет досок")
            }
            return@Scaffold
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Spacer(modifier = Modifier.height(2.dp))
            BoardSelector(
                boards = uiState.boards,
                selectedBoardId = selectedBoard.id,
                onBoardSelected = vm::selectBoard
            )
            BoardOverview(board = selectedBoard)
            KanbanColumns(
                board = selectedBoard,
                onMoveLeft = { cardId, columnIndex ->
                    if (columnIndex > 0) {
                        vm.moveCard(cardId, selectedBoard.columns[columnIndex - 1].id)
                    }
                },
                onMoveRight = { cardId, columnIndex ->
                    if (columnIndex < selectedBoard.columns.lastIndex) {
                        vm.moveCard(cardId, selectedBoard.columns[columnIndex + 1].id)
                    }
                }
            )
            Spacer(modifier = Modifier.height(80.dp))
        }
    }
}

@Composable
private fun LoginScreen(
    domain: String,
    username: String,
    password: String,
    isLoading: Boolean,
    errorMessage: String?,
    onDomainChange: (String) -> Unit,
    onUsernameChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    onLoginClick: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(20.dp),
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = "Авторизация",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold
        )
        Spacer(modifier = Modifier.height(18.dp))

        OutlinedTextField(
            value = domain,
            onValueChange = onDomainChange,
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            label = { Text("Домен backend") },
            placeholder = { Text("Например: https://task-manager.example.com") },
            supportingText = { Text("Поле обязательно. Адрес сохраняется в памяти приложения") }
        )
        Spacer(modifier = Modifier.height(10.dp))
        OutlinedTextField(
            value = username,
            onValueChange = onUsernameChange,
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            label = { Text("Логин") }
        )
        Spacer(modifier = Modifier.height(10.dp))
        OutlinedTextField(
            value = password,
            onValueChange = onPasswordChange,
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            label = { Text("Пароль") },
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password)
        )
        Spacer(modifier = Modifier.height(14.dp))

        Button(
            onClick = onLoginClick,
            enabled = !isLoading,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(if (isLoading) "Вход..." else "Войти")
        }

        if (!errorMessage.isNullOrBlank()) {
            Spacer(modifier = Modifier.height(10.dp))
            Text(text = errorMessage, color = MaterialTheme.colorScheme.error)
        }
    }
}

@Composable
private fun BoardSelector(
    boards: List<KanbanBoard>,
    selectedBoardId: Int,
    onBoardSelected: (Int) -> Unit
) {
    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        items(boards) { board ->
            FilterChip(
                selected = selectedBoardId == board.id,
                onClick = { onBoardSelected(board.id) },
                label = { Text(board.title) }
            )
        }
    }
}

@Composable
private fun BoardOverview(board: KanbanBoard) {
    val allCards = board.columns.flatMap { it.cards }
    val highPriority = allCards.count { it.priority == TaskPriority.High }

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        OverviewCard(
            modifier = Modifier.weight(1f),
            title = "Всего",
            value = allCards.size.toString(),
            accent = MaterialTheme.colorScheme.primary
        )
        OverviewCard(
            modifier = Modifier.weight(1f),
            title = "High",
            value = highPriority.toString(),
            accent = MaterialTheme.colorScheme.error
        )
        OverviewCard(
            modifier = Modifier.weight(1f),
            title = "Колонки",
            value = board.columns.size.toString(),
            accent = MaterialTheme.colorScheme.tertiary
        )
    }
}

@Composable
private fun OverviewCard(modifier: Modifier, title: String, value: String, accent: Color) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Box(modifier = Modifier.size(10.dp).background(accent, CircleShape))
            Text(text = value, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            Text(
                text = title,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun KanbanColumns(
    board: KanbanBoard,
    onMoveLeft: (cardId: Int, columnIndex: Int) -> Unit,
    onMoveRight: (cardId: Int, columnIndex: Int) -> Unit
) {
    LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        items(board.columns.indices.toList()) { columnIndex ->
            val column = board.columns[columnIndex]
            Card(
                modifier = Modifier.width(290.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer),
                shape = RoundedCornerShape(20.dp)
            ) {
                Column(
                    modifier = Modifier.padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(10.dp)
                                .background(color = column.accent, shape = CircleShape)
                        )
                        Text(
                            text = column.title,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold
                        )
                        Spacer(modifier = Modifier.weight(1f))
                        AssistChip(
                            onClick = {},
                            label = { Text(column.cards.size.toString()) },
                            colors = AssistChipDefaults.assistChipColors(
                                containerColor = MaterialTheme.colorScheme.surface
                            )
                        )
                    }

                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)

                    if (column.cards.isEmpty()) {
                        Text(
                            text = "Нет карточек",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(vertical = 6.dp)
                        )
                    } else {
                        column.cards.forEach { card ->
                            TaskCardItem(
                                card = card,
                                canMoveLeft = columnIndex > 0,
                                canMoveRight = columnIndex < board.columns.lastIndex,
                                onMoveLeft = { onMoveLeft(card.id, columnIndex) },
                                onMoveRight = { onMoveRight(card.id, columnIndex) }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun TaskCardItem(
    card: KanbanCard,
    canMoveLeft: Boolean,
    canMoveRight: Boolean,
    onMoveLeft: () -> Unit,
    onMoveRight: () -> Unit
) {
    Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(text = card.title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            Text(
                text = card.description.ifBlank { "Без описания" },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                PriorityPill(priority = card.priority)
                Text(
                    text = card.assignee,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary
                )
                Spacer(modifier = Modifier.weight(1f))
                Text(
                    text = card.dueDate,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                if (canMoveLeft) {
                    TextButton(onClick = onMoveLeft) { Text("←") }
                }
                if (canMoveRight) {
                    TextButton(onClick = onMoveRight) { Text("→") }
                }
            }
        }
    }
}

@Composable
private fun PriorityPill(priority: TaskPriority) {
    val color = when (priority) {
        TaskPriority.Low -> Color(0xFF4CAF50)
        TaskPriority.Medium -> Color(0xFFFF9800)
        TaskPriority.High -> Color(0xFFF44336)
    }

    Surface(shape = RoundedCornerShape(50), color = color.copy(alpha = 0.16f)) {
        Text(
            text = priority.name,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
            color = color,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Medium
        )
    }
}

class KanbanViewModel : ViewModel() {
    private val repository = KanbanRepository()

    var uiState by mutableStateOf(KanbanUiState(isLoading = true))
        private set

    fun bootstrap(domain: String, token: String) {
        val normalizedDomain = normalizeBaseUrl(domain)
        uiState = uiState.copy(
            domain = normalizedDomain,
            token = token,
            isAuthenticated = token.isNotBlank(),
            isLoading = false
        )
        if (token.isNotBlank()) {
            refresh()
        }
    }

    fun onDomainChanged(value: String) {
        uiState = uiState.copy(domain = value)
    }

    fun onUsernameChanged(value: String) {
        uiState = uiState.copy(username = value)
    }

    fun onPasswordChanged(value: String) {
        uiState = uiState.copy(password = value)
    }

    fun login(playerId: String, onSuccess: (String) -> Unit) {
        val domain = normalizeBaseUrl(uiState.domain)
        if (domain.isBlank()) {
            uiState = uiState.copy(errorMessage = "Введите домен backend")
            return
        }
        if (uiState.username.isBlank() || uiState.password.isBlank()) {
            uiState = uiState.copy(errorMessage = "Введите логин и пароль")
            return
        }

        viewModelScope.launch {
            uiState = uiState.copy(isLoading = true, errorMessage = null, domain = domain)
            try {
                val token = repository.login(domain, uiState.username, uiState.password)
                onSuccess(token)
                uiState = uiState.copy(
                    token = token,
                    isAuthenticated = true,
                    isLoading = false,
                    errorMessage = null,
                    password = "",
                    registeredPlayerId = ""
                )
                registerPushPlayerId(playerId)
                refresh()
            } catch (e: Exception) {
                uiState = uiState.copy(isLoading = false, errorMessage = e.message ?: "Ошибка входа")
            }
        }
    }

    fun logout() {
        uiState = KanbanUiState(
            isLoading = false,
            domain = uiState.domain
        )
    }

    fun registerPushPlayerId(playerId: String) {
        if (playerId.isBlank()) return
        if (!uiState.isAuthenticated || uiState.token.isBlank() || uiState.domain.isBlank()) return
        if (uiState.registeredPlayerId == playerId) return

        viewModelScope.launch {
            try {
                repository.updateNotificationProfile(
                    baseUrl = uiState.domain,
                    apiToken = uiState.token,
                    oneSignalPlayerId = playerId
                )
                uiState = uiState.copy(registeredPlayerId = playerId)
            } catch (_: Exception) {
                // Do not block main workflow if push registration sync fails.
            }
        }
    }

    fun refresh() {
        if (!uiState.isAuthenticated || uiState.token.isBlank()) return

        viewModelScope.launch {
            uiState = uiState.copy(isLoading = true, errorMessage = null)
            try {
                val boards = repository.fetchBoards(
                    baseUrl = uiState.domain,
                    apiToken = uiState.token
                )
                uiState = uiState.copy(
                    isLoading = false,
                    boards = boards,
                    selectedBoardId = uiState.selectedBoardId ?: boards.firstOrNull()?.id,
                    errorMessage = null
                )
            } catch (e: Exception) {
                uiState = uiState.copy(isLoading = false, errorMessage = e.message ?: "Ошибка загрузки")
            }
        }
    }

    fun selectBoard(boardId: Int) {
        uiState = uiState.copy(selectedBoardId = boardId)
    }

    fun addCardToBacklog(title: String) {
        val board = uiState.selectedBoard ?: return
        val firstColumnId = board.columns.firstOrNull()?.id ?: return

        viewModelScope.launch {
            try {
                repository.createCard(
                    baseUrl = uiState.domain,
                    apiToken = uiState.token,
                    columnId = firstColumnId,
                    title = title,
                    description = "Добавлено из Android"
                )
                refresh()
            } catch (e: Exception) {
                uiState = uiState.copy(errorMessage = e.message ?: "Не удалось добавить карточку")
            }
        }
    }

    fun moveCard(cardId: Int, toColumnId: Int) {
        viewModelScope.launch {
            try {
                repository.moveCard(
                    baseUrl = uiState.domain,
                    apiToken = uiState.token,
                    cardId = cardId,
                    toColumnId = toColumnId
                )
                refresh()
            } catch (e: Exception) {
                uiState = uiState.copy(errorMessage = e.message ?: "Не удалось переместить карточку")
            }
        }
    }
}

data class KanbanUiState(
    val isLoading: Boolean = false,
    val isAuthenticated: Boolean = false,
    val domain: String = "",
    val token: String = "",
    val username: String = "",
    val password: String = "",
    val registeredPlayerId: String = "",
    val boards: List<KanbanBoard> = emptyList(),
    val selectedBoardId: Int? = null,
    val errorMessage: String? = null
) {
    val selectedBoard: KanbanBoard?
        get() = boards.firstOrNull { it.id == selectedBoardId }
}

class KanbanRepository {

    suspend fun login(baseUrl: String, username: String, password: String): String = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("username", username)
            .put("password", password)
        val response = JSONObject(request(baseUrl = baseUrl, token = "", method = "POST", path = "/auth/login/", body = body.toString()))
        response.optString("token", "")
            .takeIf { it.isNotBlank() }
            ?: throw IllegalStateException("Токен не получен")
    }

    suspend fun fetchBoards(baseUrl: String, apiToken: String): List<KanbanBoard> = withContext(Dispatchers.IO) {
        val boards = getArray(baseUrl, apiToken, "/boards/")
        val columns = getArray(baseUrl, apiToken, "/columns/")
        val cards = getArray(baseUrl, apiToken, "/cards/")

        val cardsByColumn = mutableMapOf<Int, MutableList<KanbanCard>>()
        for (i in 0 until cards.length()) {
            val obj = cards.getJSONObject(i)
            val columnId = obj.getInt("column")
            cardsByColumn.getOrPut(columnId) { mutableListOf() }.add(obj.toKanbanCard())
        }

        val columnsByBoard = mutableMapOf<Int, MutableList<KanbanColumn>>()
        for (i in 0 until columns.length()) {
            val obj = columns.getJSONObject(i)
            val id = obj.getInt("id")
            val boardId = obj.getInt("board")
            val column = KanbanColumn(
                id = id,
                title = obj.optString("name", "Column"),
                accent = accentForColumn(obj.optString("name", "")),
                cards = (cardsByColumn[id] ?: mutableListOf()).sortedBy { it.position }
            )
            columnsByBoard.getOrPut(boardId) { mutableListOf() }.add(column)
        }

        val result = mutableListOf<KanbanBoard>()
        for (i in 0 until boards.length()) {
            val obj = boards.getJSONObject(i)
            val boardId = obj.getInt("id")
            val boardColumns = (columnsByBoard[boardId] ?: mutableListOf())
            result.add(
                KanbanBoard(
                    id = boardId,
                    title = obj.optString("name", "Board"),
                    columns = boardColumns
                )
            )
        }
        result
    }

    suspend fun createCard(
        baseUrl: String,
        apiToken: String,
        columnId: Int,
        title: String,
        description: String
    ) = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("column", columnId)
            .put("title", title)
            .put("description", description)
        request(baseUrl, apiToken, "POST", "/cards/", body.toString())
    }

    suspend fun moveCard(baseUrl: String, apiToken: String, cardId: Int, toColumnId: Int) = withContext(Dispatchers.IO) {
        val body = JSONObject().put("column", toColumnId)
        request(baseUrl, apiToken, "PATCH", "/cards/$cardId/", body.toString())
    }

    suspend fun updateNotificationProfile(
        baseUrl: String,
        apiToken: String,
        oneSignalPlayerId: String
    ) = withContext(Dispatchers.IO) {
        val body = JSONObject().put("onesignal_player_id", oneSignalPlayerId)
        request(baseUrl, apiToken, "PATCH", "/notifications/profile/", body.toString())
    }

    private fun getArray(baseUrl: String, apiToken: String, path: String): JSONArray {
        return JSONArray(request(baseUrl, apiToken, "GET", path, null))
    }

    private fun request(baseUrl: String, token: String, method: String, path: String, body: String?): String {
        val url = normalizeBaseUrl(baseUrl).trimEnd('/') + "/api/v1" + path
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 15000
            readTimeout = 15000
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Content-Type", "application/json")
            if (token.isNotBlank()) {
                setRequestProperty("Authorization", "Token $token")
            }
            doInput = true
            doOutput = body != null
        }

        if (body != null) {
            OutputStreamWriter(connection.outputStream).use { it.write(body) }
        }

        val code = connection.responseCode
        val stream = if (code in 200..299) connection.inputStream else connection.errorStream
        val payload = BufferedReader(stream.reader()).use { it.readText() }
        connection.disconnect()

        if (code !in 200..299) {
            throw IllegalStateException("HTTP $code: $payload")
        }
        return payload
    }

    private fun JSONObject.toKanbanCard(): KanbanCard {
        val assigneeId = if (isNull("assignee")) null else optInt("assignee")
        val deadlineRaw = optString("deadline", "")
        return KanbanCard(
            id = getInt("id"),
            title = optString("title", "Без названия"),
            description = optString("description", ""),
            assignee = assigneeId?.let { "User #$it" } ?: "Unassigned",
            dueDate = if (deadlineRaw.isBlank() || deadlineRaw == "null") "No date" else deadlineRaw,
            priority = priorityFromEmoji(optString("priority", "🟡")),
            position = optString("position", "0").toFloatOrNull() ?: 0f
        )
    }
}

data class KanbanBoard(
    val id: Int,
    val title: String,
    val columns: List<KanbanColumn>
)

data class KanbanColumn(
    val id: Int,
    val title: String,
    val accent: Color,
    val cards: List<KanbanCard>
)

data class KanbanCard(
    val id: Int,
    val title: String,
    val description: String,
    val assignee: String,
    val dueDate: String,
    val priority: TaskPriority,
    val position: Float
)

enum class TaskPriority {
    Low, Medium, High
}

private fun priorityFromEmoji(value: String): TaskPriority = when (value) {
    "🟢" -> TaskPriority.Low
    "🔥" -> TaskPriority.High
    else -> TaskPriority.Medium
}

private fun accentForColumn(name: String): Color {
    val normalized = name.lowercase()
    return when {
        normalized.contains("todo") || normalized.contains("backlog") -> Color(0xFF7C4DFF)
        normalized.contains("progress") || normalized.contains("review") -> Color(0xFF26C6DA)
        normalized.contains("done") || normalized.contains("release") -> Color(0xFF66BB6A)
        else -> Color(0xFF42A5F5)
    }
}

private fun normalizeBaseUrl(value: String): String {
    var base = value.trim().trimEnd('/')
    if (base.isBlank()) return ""
    if (!base.startsWith("http://") && !base.startsWith("https://")) {
        base = "https://$base"
    }
    if (base.endsWith("/api/v1")) {
        base = base.removeSuffix("/api/v1")
    } else if (base.endsWith("/api")) {
        base = base.removeSuffix("/api")
    }
    return base
}

private const val PREFS_NAME = "task_manager_mobile_prefs"
private const val KEY_DOMAIN = "domain"
private const val KEY_TOKEN = "token"

private fun readSavedDomain(context: Context): String {
    return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(KEY_DOMAIN, "") ?: ""
}

private fun saveDomain(context: Context, domain: String) {
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .edit()
        .putString(KEY_DOMAIN, normalizeBaseUrl(domain))
        .apply()
}

private fun readSavedToken(context: Context): String {
    return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(KEY_TOKEN, "") ?: ""
}

private fun saveToken(context: Context, token: String) {
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .edit()
        .putString(KEY_TOKEN, token)
        .apply()
}

private fun clearToken(context: Context) {
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .edit()
        .remove(KEY_TOKEN)
        .apply()
}

private fun currentOneSignalPlayerId(): String {
    return try {
        OneSignal.User.pushSubscription.id ?: ""
    } catch (_: Throwable) {
        ""
    }
}
