package com.taskmanager.mobile

import android.content.Context
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.clickable
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.IconButton
import androidx.compose.material3.FabPosition
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.text.KeyboardOptions
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
import com.onesignal.OneSignal
import com.onesignal.user.subscriptions.IPushSubscriptionObserver
import com.onesignal.user.subscriptions.PushSubscriptionChangedState
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.ResponseBody
import okhttp3.MediaType
import retrofit2.Retrofit
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import java.util.concurrent.TimeUnit
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            TaskManagerTheme {
                AppRoot()
            }
        }
    }
}

@Composable
private fun AppRoot(vm: KanbanViewModel = viewModel()) {
    val context = LocalContext.current
    val session by vm.session.collectAsStateWithLifecycle()
    val boardState by vm.boardState.collectAsStateWithLifecycle()
    val taskDetailState by vm.taskDetailState.collectAsStateWithLifecycle()
    val navController = rememberNavController()

    LaunchedEffect(Unit) {
        vm.bootstrap(
            domain = readSavedDomain(context).ifBlank { BuildConfig.API_BASE_URL },
            token = readSavedToken(context)
        )

        vm.registerPushPlayerId(currentOneSignalPlayerId())
        if (BuildConfig.ONESIGNAL_APP_ID.isNotBlank()) {
            OneSignal.Notifications.requestPermission(true)
        }
    }

    LaunchedEffect(session.isAuthenticated) {
        val route = if (session.isAuthenticated) Route.Board else Route.Login
        navController.navigate(route) {
            popUpTo(navController.graph.findStartDestination().id) { inclusive = true }
            launchSingleTop = true
        }
    }

    LaunchedEffect(session.isAuthenticated) {
        if (!session.isAuthenticated) return@LaunchedEffect
        repeat(15) {
            val playerId = currentOneSignalPlayerId()
            if (playerId.isNotBlank()) {
                vm.registerPushPlayerId(playerId)
                return@LaunchedEffect
            }
            delay(2000)
        }
    }

    DisposableEffect(session.isAuthenticated, session.domain, session.token) {
        val observer = object : IPushSubscriptionObserver {
            override fun onPushSubscriptionChange(state: PushSubscriptionChangedState) {
                val playerId = state.current.id ?: ""
                if (playerId.isNotBlank()) {
                    vm.registerPushPlayerId(playerId)
                }
            }
        }
        OneSignal.User.pushSubscription.addObserver(observer)
        onDispose {
            OneSignal.User.pushSubscription.removeObserver(observer)
        }
    }

    NavHost(
        navController = navController,
        startDestination = Route.Login,
        modifier = Modifier.fillMaxSize()
    ) {
        composable(Route.Login) {
            LoginScreen(
                state = session,
                onDomainChange = vm::onDomainChanged,
                onUsernameChange = vm::onUsernameChanged,
                onPasswordChange = vm::onPasswordChanged,
                onLoginClick = {
                    val domainToSave = session.domain
                    vm.login(
                        playerId = currentOneSignalPlayerId(),
                        onSuccess = { token ->
                            saveDomain(context, domainToSave)
                            saveToken(context, token)
                        }
                    )
                }
            )
        }

        composable(Route.Board) {
            BoardRoute(
                boardState = boardState,
                onRetry = vm::refresh,
                onLogout = {
                    clearToken(context)
                    vm.logout()
                },
                onSelectBoard = vm::selectBoard,
                onAddTask = vm::createTask,
                onMoveTask = vm::moveTask,
                onTaskClick = { taskId ->
                    navController.navigate(Route.taskDetail(taskId))
                }
            )
        }

        composable(
            route = "${Route.TaskDetail}/{taskId}",
            arguments = listOf(navArgument("taskId") { type = NavType.IntType })
        ) { backStackEntry ->
            val taskId = backStackEntry.arguments?.getInt("taskId") ?: return@composable
            TaskDetailScreen(
                taskId = taskId,
                taskDetailState = taskDetailState,
                onLoadTask = vm::loadTaskDetail,
                onBack = { navController.popBackStack() },
                onClearDetail = vm::clearTaskDetail
            )
        }
    }
}

private object Route {
    const val Login = "login"
    const val Board = "board"
    const val TaskDetail = "task_detail"
    
    fun taskDetail(taskId: Int) = "$TaskDetail/$taskId"
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LoginScreen(
    state: SessionUiState,
    onDomainChange: (String) -> Unit,
    onUsernameChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    onLoginClick: () -> Unit
) {
    var showSettings by rememberSaveable { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Авторизация") },
                actions = {
                    IconButton(onClick = { showSettings = true }) {
                        Text("⚙️")
                    }
                }
            )
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(20.dp),
            verticalArrangement = Arrangement.Center
        ) {
            OutlinedTextField(
                value = state.username,
                onValueChange = onUsernameChange,
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                label = { Text("Логин") }
            )

            Spacer(modifier = Modifier.height(10.dp))
            OutlinedTextField(
                value = state.password,
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
                enabled = !state.isBusy,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(if (state.isBusy) "Вход..." else "Войти")
            }

            if (!state.errorMessage.isNullOrBlank()) {
                Spacer(modifier = Modifier.height(10.dp))
                Text(text = state.errorMessage, color = MaterialTheme.colorScheme.error)
            }
        }

        if (showSettings) {
            ModalBottomSheet(onDismissRequest = { showSettings = false }) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp, vertical = 12.dp)
                ) {
                    Text(
                        text = "Настройки API",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedTextField(
                        value = state.domain,
                        onValueChange = onDomainChange,
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        label = { Text("Домен backend") },
                        placeholder = { Text("Например: https://task-manager.example.com") }
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.End
                    ) {
                        TextButton(onClick = { showSettings = false }) {
                            Text("Закрыть")
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                        Button(onClick = { showSettings = false }) {
                            Text("Сохранить")
                        }
                    }
                    Spacer(modifier = Modifier.height(12.dp))
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun BoardRoute(
    boardState: BoardUiState,
    onRetry: () -> Unit,
    onLogout: () -> Unit,
    onSelectBoard: (Int) -> Unit,
    onAddTask: (title: String, columnId: Int) -> Unit,
    onMoveTask: (taskId: Int, toColumnId: Int) -> Unit,
    onTaskClick: (Int) -> Unit
) {
    when (boardState) {
        BoardUiState.Loading -> {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        }

        is BoardUiState.Error -> {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(boardState.message, color = MaterialTheme.colorScheme.error)
                    Spacer(modifier = Modifier.height(12.dp))
                    TextButton(onClick = onRetry) { Text("Повторить") }
                    TextButton(onClick = onLogout) { Text("Выйти") }
                }
            }
        }

        is BoardUiState.Content -> {
            val selectedBoard = boardState.boards.firstOrNull { it.id == boardState.selectedBoardId }
                ?: boardState.boards.firstOrNull()
            var addTaskSheetVisible by remember { mutableStateOf(false) }
            var moveTask by remember { mutableStateOf<KanbanTask?>(null) }

            Scaffold(
                topBar = {
                    TopAppBar(
                        title = { Text("Task Manager") },
                        actions = {
                            TextButton(onClick = onLogout) { Text("Выйти") }
                        }
                    )
                },
                floatingActionButtonPosition = FabPosition.End,
                floatingActionButton = {
                    if (selectedBoard != null) {
                        FloatingActionButton(onClick = { addTaskSheetVisible = true }) {
                            Text("+")
                        }
                    }
                }
            ) { paddingValues ->
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues)
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(boardState.boards) { board ->
                            FilterChip(
                                selected = board.id == boardState.selectedBoardId,
                                onClick = { onSelectBoard(board.id) },
                                label = { Text(board.title) }
                            )
                        }
                    }

                    if (selectedBoard == null) {
                        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            Text("Нет досок")
                        }
                    } else {
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            items(selectedBoard.columns) { column ->
                                ColumnView(
                                    column = column,
                                    onMoveClick = { moveTask = it },
                                    onTaskClick = onTaskClick
                                )
                            }
                        }
                    }
                }
            }

            if (addTaskSheetVisible && selectedBoard != null) {
                AddTaskSheet(
                    columns = selectedBoard.columns,
                    onDismiss = { addTaskSheetVisible = false },
                    onSubmit = { title, columnId ->
                        onAddTask(title, columnId)
                        addTaskSheetVisible = false
                    }
                )
            }

            if (moveTask != null && selectedBoard != null) {
                MoveTaskSheet(
                    task = moveTask!!,
                    columns = selectedBoard.columns,
                    onDismiss = { moveTask = null },
                    onMove = { toColumnId ->
                        onMoveTask(moveTask!!.id, toColumnId)
                        moveTask = null
                    }
                )
            }
        }
    }
}

@Composable
private fun ColumnView(
    column: KanbanColumn,
    onMoveClick: (KanbanTask) -> Unit,
    onTaskClick: (Int) -> Unit
) {
    Card(
        modifier = Modifier.width(320.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = if (column.icon.isBlank()) column.title else "${column.icon} ${column.title}",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f)
                )
                AssistChip(onClick = {}, label = { Text(column.tasks.size.toString()) })
            }

            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 560.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(column.tasks, key = { it.id }) { task ->
                    TaskCard(
                        task = task,
                        columnTitle = column.title,
                        onMoveClick = { onMoveClick(task) },
                        onClick = { onTaskClick(task.id) }
                    )
                }
            }
        }
    }
}

@Composable
private fun TaskCard(
    task: KanbanTask,
    columnTitle: String,
    onMoveClick: () -> Unit,
    onClick: () -> Unit
) {
    var menuExpanded by remember { mutableStateOf(false) }
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() }
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(10.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = task.title,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f)
                )
                Box {
                    TextButton(onClick = { menuExpanded = true }) { Text("⋮") }
                    DropdownMenu(expanded = menuExpanded, onDismissRequest = { menuExpanded = false }) {
                        DropdownMenuItem(
                            text = { Text("Move to…") },
                            onClick = {
                                menuExpanded = false
                                onMoveClick()
                            }
                        )
                    }
                }
            }

            if (task.description.isNotBlank()) {
                Text(
                    text = task.description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "${task.priority.display} · $columnTitle",
                    style = MaterialTheme.typography.labelMedium
                )
                if (!task.dueDate.isNullOrBlank()) {
                    Text(
                        text = task.dueDate,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddTaskSheet(
    columns: List<KanbanColumn>,
    onDismiss: () -> Unit,
    onSubmit: (title: String, columnId: Int) -> Unit
) {
    var title by remember { mutableStateOf("") }
    var selectedColumnId by remember(columns) { mutableStateOf(columns.firstOrNull()?.id) }

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text("Новая задача", style = MaterialTheme.typography.titleLarge)
            OutlinedTextField(
                value = title,
                onValueChange = { title = it },
                label = { Text("Title") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )

            Text("Колонка", style = MaterialTheme.typography.titleMedium)
            LazyColumn(modifier = Modifier.heightIn(max = 220.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                items(columns, key = { it.id }) { column ->
                    FilterChip(
                        selected = selectedColumnId == column.id,
                        onClick = { selectedColumnId = column.id },
                        label = { Text(if (column.icon.isBlank()) column.title else "${column.icon} ${column.title}") }
                    )
                }
            }

            Button(
                onClick = {
                    val columnId = selectedColumnId ?: return@Button
                    onSubmit(title.trim(), columnId)
                },
                enabled = title.isNotBlank() && selectedColumnId != null,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Добавить")
            }
            Spacer(modifier = Modifier.height(12.dp))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MoveTaskSheet(
    task: KanbanTask,
    columns: List<KanbanColumn>,
    onDismiss: () -> Unit,
    onMove: (toColumnId: Int) -> Unit
) {
    var selectedColumnId by remember { mutableStateOf<Int?>(null) }
    val availableColumns = remember(columns, task.columnId) {
        columns.filter { it.id != task.columnId }
    }

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text("Move to…", style = MaterialTheme.typography.titleLarge)
            Text(task.title, style = MaterialTheme.typography.bodyMedium)

            if (availableColumns.isEmpty()) {
                Text("Нет доступных колонок")
            } else {
                LazyColumn(modifier = Modifier.heightIn(max = 220.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(availableColumns, key = { it.id }) { column ->
                        FilterChip(
                            selected = selectedColumnId == column.id,
                            onClick = { selectedColumnId = column.id },
                            label = { Text(if (column.icon.isBlank()) column.title else "${column.icon} ${column.title}") }
                        )
                    }
                }
            }

            Button(
                onClick = { selectedColumnId?.let(onMove) },
                enabled = selectedColumnId != null,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Переместить")
            }
            Spacer(modifier = Modifier.height(12.dp))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TaskDetailScreen(
    taskId: Int,
    taskDetailState: TaskDetailState?,
    onLoadTask: (Int) -> Unit,
    onBack: () -> Unit,
    onClearDetail: () -> Unit
) {
    LaunchedEffect(taskId) {
        onLoadTask(taskId)
    }

    DisposableEffect(Unit) {
        onDispose {
            onClearDetail()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Детали задачи") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Text("←")
                    }
                }
            )
        }
    ) { paddingValues ->
        when (taskDetailState) {
            null, TaskDetailState.Loading -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator()
                }
            }

            is TaskDetailState.Error -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(taskDetailState.message, color = MaterialTheme.colorScheme.error)
                        Spacer(modifier = Modifier.height(12.dp))
                        TextButton(onClick = { onLoadTask(taskId) }) { Text("Повторить") }
                        TextButton(onClick = onBack) { Text("Назад") }
                    }
                }
            }

            is TaskDetailState.Content -> {
                TaskDetailContent(
                    task = taskDetailState.task,
                    modifier = Modifier.padding(paddingValues)
                )
            }
        }
    }
}

@Composable
private fun TaskDetailContent(task: KanbanTask, modifier: Modifier = Modifier) {
    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Заголовок
        item {
            Text(
                text = task.title,
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold
            )
        }

        // Приоритет и дедлайн
        item {
            Row(
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)) {
                    Text(
                        text = task.priority.display,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                        style = MaterialTheme.typography.labelLarge
                    )
                }
                if (!task.dueDate.isNullOrBlank()) {
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.tertiaryContainer)) {
                        Text(
                            text = "📅 ${task.dueDate}",
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                            style = MaterialTheme.typography.labelLarge
                        )
                    }
                }
            }
        }

        // Описание
        if (task.description.isNotBlank()) {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = "Описание",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer)) {
                        Text(
                            text = task.description,
                            modifier = Modifier.padding(12.dp),
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                }
            }
        }

        // Теги
        if (task.tags.isNotEmpty()) {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = "Теги",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(task.tags) { tag ->
                            AssistChip(
                                onClick = {},
                                label = { Text(tag) }
                            )
                        }
                    }
                }
            }
        }

        // Категории
        if (task.categories.isNotEmpty()) {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = "Категории",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(task.categories) { category ->
                            AssistChip(
                                onClick = {},
                                label = { Text(category) }
                            )
                        }
                    }
                }
            }
        }

        // Чек-лист
        if (task.checklist.isNotEmpty()) {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = "Чек-лист",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer)) {
                        Column(
                            modifier = Modifier.padding(12.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            task.checklist.forEach { item ->
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Text(
                                        text = if (item.done) "✅" else "⬜",
                                        style = MaterialTheme.typography.bodyMedium
                                    )
                                    Text(
                                        text = item.text,
                                        style = MaterialTheme.typography.bodyMedium,
                                        modifier = Modifier.weight(1f)
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        // Вложения
        if (task.attachments.isNotEmpty()) {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = "Вложения",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer)) {
                        Column(
                            modifier = Modifier.padding(12.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            task.attachments.forEach { attachment ->
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Text(
                                        text = "📎",
                                        style = MaterialTheme.typography.bodyMedium
                                    )
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = attachment.name,
                                            style = MaterialTheme.typography.bodyMedium,
                                            fontWeight = FontWeight.Medium
                                        )
                                        if (attachment.size != null) {
                                            Text(
                                                text = formatFileSize(attachment.size),
                                                style = MaterialTheme.typography.bodySmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Метаданные
        item {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = "Информация",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold
                )
                if (!task.createdAt.isNullOrBlank()) {
                    Text(
                        text = "Создано: ${task.createdAt}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                if (!task.updatedAt.isNullOrBlank()) {
                    Text(
                        text = "Обновлено: ${task.updatedAt}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Text(
                    text = "ID: ${task.id}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

private fun formatFileSize(bytes: Long): String {
    return when {
        bytes < 1024 -> "$bytes B"
        bytes < 1024 * 1024 -> "${bytes / 1024} KB"
        else -> "${bytes / (1024 * 1024)} MB"
    }
}

class KanbanViewModel : ViewModel() {
    private val repository = KanbanRepository()
    private val notificationEventTypes = listOf(
        "board.created",
        "board.updated",
        "board.deleted",
        "column.created",
        "column.updated",
        "column.deleted",
        "card.created",
        "card.updated",
        "card.deleted",
        "card.moved",
        "card.deadline_reminder"
    )

    private val _session = MutableStateFlow(SessionUiState())
    val session: StateFlow<SessionUiState> = _session.asStateFlow()

    private val _boardState = MutableStateFlow<BoardUiState>(BoardUiState.Loading)
    val boardState: StateFlow<BoardUiState> = _boardState.asStateFlow()

    private val _taskDetailState = MutableStateFlow<TaskDetailState?>(null)
    val taskDetailState: StateFlow<TaskDetailState?> = _taskDetailState.asStateFlow()

    fun bootstrap(domain: String, token: String) {
        val normalizedDomain = normalizeBaseUrl(domain)
        _session.update {
            it.copy(
                domain = normalizedDomain,
                token = token,
                isAuthenticated = token.isNotBlank(),
                isBusy = false
            )
        }
        if (token.isNotBlank()) {
            refresh()
        }
    }

    fun onDomainChanged(value: String) {
        _session.update { it.copy(domain = value) }
    }

    fun onUsernameChanged(value: String) {
        _session.update { it.copy(username = value) }
    }

    fun onPasswordChanged(value: String) {
        _session.update { it.copy(password = value) }
    }

    fun login(playerId: String, onSuccess: (String) -> Unit) {
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
                    it.copy(
                        token = token,
                        isAuthenticated = true,
                        isBusy = false,
                        errorMessage = null,
                        password = "",
                        registeredPlayerId = ""
                    )
                }
                registerPushPlayerId(playerId)
                refresh()
            }.onFailure { error ->
                _session.update { it.copy(isBusy = false, errorMessage = error.message ?: "Ошибка входа") }
            }
        }
    }

    fun logout() {
        _session.value = SessionUiState(domain = session.value.domain)
        _boardState.value = BoardUiState.Loading
    }

    fun refresh() {
        val s = session.value
        if (!s.isAuthenticated || s.token.isBlank()) return

        viewModelScope.launch {
            _boardState.value = BoardUiState.Loading
            runCatching {
                repository.fetchBoards(baseUrl = s.domain, apiToken = s.token)
            }.onSuccess { boards ->
                val selectedId = (_boardState.value as? BoardUiState.Content)?.selectedBoardId
                    ?.takeIf { candidate -> boards.any { it.id == candidate } }
                    ?: boards.firstOrNull()?.id
                _boardState.value = BoardUiState.Content(boards = boards, selectedBoardId = selectedId)
            }.onFailure { error ->
                _boardState.value = BoardUiState.Error(error.message ?: "Ошибка загрузки")
            }
        }
    }

    fun selectBoard(boardId: Int) {
        val current = _boardState.value as? BoardUiState.Content ?: return
        _boardState.value = current.copy(selectedBoardId = boardId)
    }

    fun createTask(title: String, columnId: Int) {
        if (title.isBlank()) return
        val s = session.value
        viewModelScope.launch {
            runCatching {
                repository.createCard(
                    baseUrl = s.domain,
                    apiToken = s.token,
                    request = CreateCardRequest(
                        column = columnId,
                        title = title.trim()
                    )
                )
            }
            refresh()
        }
    }

    fun moveTask(taskId: Int, toColumnId: Int) {
        val s = session.value
        viewModelScope.launch {
            runCatching {
                repository.moveCard(
                    baseUrl = s.domain,
                    apiToken = s.token,
                    cardId = taskId,
                    toColumnId = toColumnId
                )
            }
            refresh()
        }
    }

    fun registerPushPlayerId(playerId: String) {
        val s = session.value
        Log.d(PUSH_DEBUG_TAG, "registerPushPlayerId called: playerId=$playerId isAuth=${s.isAuthenticated} domain=${s.domain}")
        if (playerId.isBlank() || !s.isAuthenticated || s.token.isBlank() || s.domain.isBlank()) return
        if (s.registeredPlayerId == playerId) return

        viewModelScope.launch {
            runCatching {
                repository.updateNotificationProfile(
                    baseUrl = s.domain,
                    apiToken = s.token,
                    oneSignalPlayerId = playerId
                )
                repository.ensurePushNotificationPreferences(
                    baseUrl = s.domain,
                    apiToken = s.token,
                    eventTypes = notificationEventTypes
                )
            }.onSuccess {
                _session.update { it.copy(registeredPlayerId = playerId) }
            }
        }
    }

    fun loadTaskDetail(taskId: Int) {
        val s = session.value
        if (!s.isAuthenticated || s.token.isBlank()) return

        viewModelScope.launch {
            _taskDetailState.value = TaskDetailState.Loading
            runCatching {
                repository.getCard(
                    baseUrl = s.domain,
                    apiToken = s.token,
                    cardId = taskId
                )
            }.onSuccess { task ->
                _taskDetailState.value = TaskDetailState.Content(task)
            }.onFailure { error ->
                _taskDetailState.value = TaskDetailState.Error(error.message ?: "Ошибка загрузки")
            }
        }
    }

    fun clearTaskDetail() {
        _taskDetailState.value = null
    }
}

data class SessionUiState(
    val isBusy: Boolean = false,
    val isAuthenticated: Boolean = false,
    val domain: String = "",
    val token: String = "",
    val username: String = "",
    val password: String = "",
    val registeredPlayerId: String = "",
    val errorMessage: String? = null
)

sealed interface BoardUiState {
    data object Loading : BoardUiState
    data class Error(val message: String) : BoardUiState
    data class Content(
        val boards: List<KanbanBoard>,
        val selectedBoardId: Int?
    ) : BoardUiState
}

sealed interface TaskDetailState {
    data object Loading : TaskDetailState
    data class Error(val message: String) : TaskDetailState
    data class Content(val task: KanbanTask) : TaskDetailState
}

class KanbanRepository {
    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        coerceInputValues = true
    }

    suspend fun login(baseUrl: String, username: String, password: String): String {
        val token = api(baseUrl = baseUrl, apiToken = "")
            .login(LoginRequest(username = username, password = password))
            .token
        if (token.isBlank()) error("Токен не получен")
        return token
    }

    suspend fun fetchBoards(baseUrl: String, apiToken: String): List<KanbanBoard> {
        val service = api(baseUrl, apiToken)
        val boards = service.getBoards()
        val columns = service.getColumns()
        val cards = service.getCards()

        val tasksByColumn = cards.groupBy { it.column }.mapValues { (_, items) ->
            items.map { dto ->
                KanbanTask(
                    id = dto.id,
                    title = dto.title.orEmpty().ifBlank { "Без названия" },
                    description = dto.description.orEmpty(),
                    columnId = dto.column,
                    dueDate = dto.deadline,
                    priority = TaskPriority.fromApiValue(dto.priority),
                    position = dto.position.asPosition(),
                    assignee = dto.assignee,
                    tags = dto.tags,
                    categories = dto.categories,
                    checklist = dto.checklist,
                    attachments = dto.attachments,
                    createdAt = dto.createdAt,
                    updatedAt = dto.updatedAt
                )
            }.sortedBy { it.position }
        }

        val columnsByBoard = columns.groupBy { it.board }.mapValues { (_, items) ->
            items.map { dto ->
                KanbanColumn(
                    id = dto.id,
                    boardId = dto.board,
                    title = dto.name,
                    icon = dto.icon.orEmpty(),
                    tasks = tasksByColumn[dto.id].orEmpty()
                )
            }
        }

        return boards.map { dto ->
            KanbanBoard(
                id = dto.id,
                title = dto.name,
                columns = columnsByBoard[dto.id].orEmpty()
            )
        }
    }

    suspend fun getCard(baseUrl: String, apiToken: String, cardId: Int): KanbanTask {
        val dto = api(baseUrl, apiToken).getCard(cardId)
        return KanbanTask(
            id = dto.id,
            title = dto.title.orEmpty().ifBlank { "Без названия" },
            description = dto.description.orEmpty(),
            columnId = dto.column,
            dueDate = dto.deadline,
            priority = TaskPriority.fromApiValue(dto.priority),
            position = dto.position.asPosition(),
            assignee = dto.assignee,
            tags = dto.tags,
            categories = dto.categories,
            checklist = dto.checklist,
            attachments = dto.attachments,
            createdAt = dto.createdAt,
            updatedAt = dto.updatedAt
        )
    }

    suspend fun createCard(baseUrl: String, apiToken: String, request: CreateCardRequest) {
        api(baseUrl, apiToken).createCard(request)
    }

    suspend fun moveCard(baseUrl: String, apiToken: String, cardId: Int, toColumnId: Int) {
        api(baseUrl, apiToken).moveCard(cardId = cardId, request = MoveCardRequest(toColumn = toColumnId))
    }

    suspend fun updateNotificationProfile(baseUrl: String, apiToken: String, oneSignalPlayerId: String) {
        val body = api(baseUrl, apiToken).updateNotificationProfile(
            request = NotificationProfileRequest(onesignalPlayerId = oneSignalPlayerId)
        ).string()
        Log.d(PUSH_DEBUG_TAG, "PATCH /notifications/profile -> $body")
    }

    suspend fun ensurePushNotificationPreferences(
        baseUrl: String,
        apiToken: String,
        eventTypes: List<String>
    ) {
        val service = api(baseUrl, apiToken)
        val preferences = service.listNotificationPreferences()
        Log.d(PUSH_DEBUG_TAG, "GET /notification-preferences -> count=${preferences.size} items=$preferences")

        val grouped = preferences.groupBy { it.eventType }

        for (eventType in eventTypes) {
            val eventPrefs = grouped[eventType].orEmpty()
            val hasGlobalPush = eventPrefs.any { it.board == null && it.channel == "push" }
            val hasGlobalTelegram = eventPrefs.any { it.board == null && it.channel == "telegram" }

            if (!hasGlobalPush) {
                val createPushResponse = service.createNotificationPreference(
                    NotificationPreferenceRequest(
                        board = null,
                        channel = "push",
                        eventType = eventType,
                        enabled = true
                    )
                ).string()
                Log.d(PUSH_DEBUG_TAG, "POST /notification-preferences push event=$eventType -> $createPushResponse")
            }
            if (!hasGlobalTelegram) {
                val createTelegramResponse = service.createNotificationPreference(
                    NotificationPreferenceRequest(
                        board = null,
                        channel = "telegram",
                        eventType = eventType,
                        enabled = false
                    )
                ).string()
                Log.d(PUSH_DEBUG_TAG, "POST /notification-preferences telegram event=$eventType -> $createTelegramResponse")
            }

            for (pref in eventPrefs) {
                if (pref.channel == "push" && !pref.enabled) {
                    val updatePushResponse = service.updateNotificationPreference(
                        pref.id,
                        NotificationPreferencePatch(enabled = true)
                    ).string()
                    Log.d(PUSH_DEBUG_TAG, "PATCH /notification-preferences/${pref.id} push->true event=$eventType -> $updatePushResponse")
                }
                if (pref.channel == "telegram" && pref.enabled) {
                    val updateTelegramResponse = service.updateNotificationPreference(
                        pref.id,
                        NotificationPreferencePatch(enabled = false)
                    ).string()
                    Log.d(PUSH_DEBUG_TAG, "PATCH /notification-preferences/${pref.id} telegram->false event=$eventType -> $updateTelegramResponse")
                }
            }
        }

        val finalPreferences = service.listNotificationPreferences()
        Log.d(PUSH_DEBUG_TAG, "GET /notification-preferences (final) -> count=${finalPreferences.size} items=$finalPreferences")
    }

    private fun api(baseUrl: String, apiToken: String): KanbanApi {
        val authInterceptor = Interceptor { chain ->
            val requestBuilder = chain.request().newBuilder()
                .header("Accept", "application/json")
                .header("Content-Type", "application/json")
            if (apiToken.isNotBlank()) {
                requestBuilder.header("Authorization", "Token $apiToken")
            }
            chain.proceed(requestBuilder.build())
        }

        val client = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .addInterceptor(authInterceptor)
            .build()

        return Retrofit.Builder()
            .baseUrl(normalizeBaseUrl(baseUrl).trimEnd('/') + "/api/v1/")
            .client(client)
            .addConverterFactory(json.asConverterFactory(MediaType.parse("application/json")!!))
            .build()
            .create(KanbanApi::class.java)
    }
}

private interface KanbanApi {
    @POST("auth/login/")
    suspend fun login(@Body request: LoginRequest): LoginResponse

    @GET("boards/")
    suspend fun getBoards(): List<BoardDto>

    @GET("columns/")
    suspend fun getColumns(): List<ColumnDto>

    @GET("cards/")
    suspend fun getCards(): List<CardDto>

    @GET("cards/{cardId}/")
    suspend fun getCard(@Path("cardId") cardId: Int): CardDto

    @POST("cards/")
    suspend fun createCard(@Body request: CreateCardRequest): ResponseBody

    @POST("cards/{cardId}/move/")
    suspend fun moveCard(@Path("cardId") cardId: Int, @Body request: MoveCardRequest): ResponseBody

    @PATCH("notifications/profile/")
    suspend fun updateNotificationProfile(@Body request: NotificationProfileRequest): ResponseBody

    @GET("notification-preferences/")
    suspend fun listNotificationPreferences(): List<NotificationPreferenceDto>

    @POST("notification-preferences/")
    suspend fun createNotificationPreference(@Body request: NotificationPreferenceRequest): ResponseBody

    @PATCH("notification-preferences/{id}/")
    suspend fun updateNotificationPreference(
        @Path("id") id: Int,
        @Body request: NotificationPreferencePatch
    ): ResponseBody
}

@Serializable
private data class LoginRequest(
    val username: String,
    val password: String
)

@Serializable
private data class LoginResponse(
    val token: String = ""
)

@Serializable
private data class BoardDto(
    val id: Int,
    val name: String
)

@Serializable
private data class ColumnDto(
    val id: Int,
    val board: Int,
    val name: String,
    val icon: String? = null
)

@Serializable
private data class CardDto(
    val id: Int,
    val column: Int,
    val title: String? = null,
    val description: String? = null,
    val deadline: String? = null,
    val priority: String? = null,
    val position: JsonElement? = null,
    val assignee: Int? = null,
    val tags: List<String> = emptyList(),
    val categories: List<String> = emptyList(),
    val checklist: List<ChecklistItemDto> = emptyList(),
    val attachments: List<AttachmentDto> = emptyList(),
    @SerialName("created_at")
    val createdAt: String? = null,
    @SerialName("updated_at")
    val updatedAt: String? = null
)

@Serializable
data class CreateCardRequest(
    val column: Int,
    val title: String,
    val description: String = "",
    val assignee: Int? = null,
    val deadline: String? = null,
    val priority: String = TaskPriority.Medium.apiValue,
    val tags: List<String> = emptyList(),
    val categories: List<String> = emptyList(),
    val checklist: List<ChecklistItemDto> = emptyList()
)

@Serializable
private data class MoveCardRequest(
    @SerialName("to_column")
    val toColumn: Int
)

@Serializable
private data class NotificationProfileRequest(
    @SerialName("onesignal_player_id")
    val onesignalPlayerId: String
)

@Serializable
private data class NotificationPreferenceDto(
    val id: Int,
    val board: Int? = null,
    val channel: String,
    @SerialName("event_type")
    val eventType: String,
    val enabled: Boolean
)

@Serializable
private data class NotificationPreferenceRequest(
    val board: Int? = null,
    val channel: String,
    @SerialName("event_type")
    val eventType: String,
    val enabled: Boolean
)

@Serializable
private data class NotificationPreferencePatch(
    val enabled: Boolean
)

@Serializable
data class AttachmentDto(
    val id: String,
    val name: String,
    val url: String,
    val size: Long? = null
)

@Serializable
data class ChecklistItemDto(
    val id: String,
    val text: String,
    val done: Boolean
)

data class KanbanBoard(
    val id: Int,
    val title: String,
    val columns: List<KanbanColumn>
)

data class KanbanColumn(
    val id: Int,
    val boardId: Int,
    val title: String,
    val icon: String,
    val tasks: List<KanbanTask>
)

data class KanbanTask(
    val id: Int,
    val title: String,
    val description: String,
    val columnId: Int,
    val dueDate: String?,
    val priority: TaskPriority,
    val position: Float,
    val assignee: Int? = null,
    val tags: List<String> = emptyList(),
    val categories: List<String> = emptyList(),
    val checklist: List<ChecklistItemDto> = emptyList(),
    val attachments: List<AttachmentDto> = emptyList(),
    val createdAt: String? = null,
    val updatedAt: String? = null
)

enum class TaskPriority(val apiValue: String, val display: String) {
    Low("🟢", "Low"),
    Medium("🟡", "Medium"),
    High("🔥", "High");

    companion object {
        fun fromApiValue(value: String?): TaskPriority = when (value) {
            Low.apiValue -> Low
            High.apiValue -> High
            else -> Medium
        }
    }
}

private fun JsonElement?.asPosition(): Float {
    val primitive = this as? JsonPrimitive ?: return 0f
    return primitive.content.toFloatOrNull() ?: 0f
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

private const val PUSH_DEBUG_TAG = "TM_PUSH_DEBUG"
