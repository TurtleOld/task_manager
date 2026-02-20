package com.taskmanager.mobile

import android.content.Context
import android.content.SharedPreferences
import android.os.Bundle
import android.util.Log
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
import okhttp3.MediaType
import okhttp3.OkHttpClient
import okhttp3.ResponseBody
import retrofit2.Retrofit
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import java.util.concurrent.TimeUnit
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory

private val LocalActivity = androidx.compose.runtime.staticCompositionLocalOf<FragmentActivity> {
    error("No FragmentActivity provided")
}

class MainActivity : FragmentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            androidx.compose.runtime.CompositionLocalProvider(LocalActivity provides this) {
                TaskManagerTheme {
                    AppRoot()
                }
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
    val securitySettings by vm.securitySettings.collectAsStateWithLifecycle()
    val navController = rememberNavController()

    LaunchedEffect(Unit) {
        vm.bootstrap(
            domain = readSavedDomain(context).ifBlank { BuildConfig.API_BASE_URL },
            token = readSavedToken(context)
        )
        vm.loadSecuritySettings(context)

        vm.registerPushPlayerId(currentOneSignalPlayerId())
        if (BuildConfig.ONESIGNAL_APP_ID.isNotBlank()) {
            OneSignal.Notifications.requestPermission(true)
        }
    }

    LaunchedEffect(session.isAuthenticated) {
        val route = when {
            !session.isAuthenticated -> Route.Login
            isPinEnabled(context) -> Route.PinUnlock
            else -> Route.Board
        }
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

        composable(Route.PinUnlock) {
            PinUnlockScreen(
                biometricEnabled = securitySettings.biometricEnabled,
                onUnlocked = {
                    navController.navigate(Route.Board) {
                        popUpTo(Route.PinUnlock) { inclusive = true }
                    }
                },
                onForgotPin = {
                    clearToken(context)
                    clearPin(context)
                    vm.logout()
                    vm.loadSecuritySettings(context)
                }
            )
        }

        composable(Route.Board) {
            BoardRoute(
                boardState = boardState,
                onRetry = vm::refresh,
                onRefresh = vm::refresh,
                onLogout = {
                    clearToken(context)
                    vm.logout()
                },
                onSelectBoard = vm::selectBoard,
                onAddTask = vm::createTask,
                onMoveTask = vm::moveTask,
                onTaskClick = { taskId ->
                    navController.navigate(Route.taskDetail(taskId))
                },
                onOpenSettings = {
                    navController.navigate(Route.Settings)
                }
            )
        }

        composable(Route.Settings) {
            SettingsScreen(
                session = session,
                securitySettings = securitySettings,
                onBack = { navController.popBackStack() },
                onEnablePin = { pin ->
                    vm.enablePin(context, pin)
                },
                onDisablePin = {
                    vm.disablePin(context)
                },
                onSetBiometric = { enabled ->
                    vm.setBiometric(context, enabled)
                },
                onLogout = {
                    clearToken(context)
                    vm.logout()
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
                onClearDetail = vm::clearTaskDetail,
                onSaveCard = { draft, onSuccess, onError ->
                    vm.saveCard(taskId, draft, onSuccess, onError)
                }
            )
        }
    }
}

private object Route {
    const val Login = "login"
    const val PinUnlock = "pin_unlock"
    const val Board = "board"
    const val TaskDetail = "task_detail"
    const val Settings = "settings"

    fun taskDetail(taskId: Int) = "$TaskDetail/$taskId"
}

// ─────────────────────────────────────────────────────────────────────────────
// Login Screen
// ─────────────────────────────────────────────────────────────────────────────

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
    var passwordVisible by rememberSaveable { mutableStateOf(false) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        // Decorative gradient blob top
        Box(
            modifier = Modifier
                .size(300.dp)
                .offset(x = (-60).dp, y = (-60).dp)
                .background(
                    brush = Brush.radialGradient(
                        colors = listOf(
                            MaterialTheme.colorScheme.primary.copy(alpha = 0.15f),
                            Color.Transparent
                        )
                    ),
                    shape = CircleShape
                )
        )
        // Decorative gradient blob bottom right
        Box(
            modifier = Modifier
                .size(250.dp)
                .align(Alignment.BottomEnd)
                .offset(x = 60.dp, y = 60.dp)
                .background(
                    brush = Brush.radialGradient(
                        colors = listOf(
                            MaterialTheme.colorScheme.secondary.copy(alpha = 0.12f),
                            Color.Transparent
                        )
                    ),
                    shape = CircleShape
                )
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
                .padding(horizontal = 24.dp),
            verticalArrangement = Arrangement.Center
        ) {
            // Logo / App name
            Column(
                modifier = Modifier.padding(bottom = 40.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(56.dp)
                        .background(
                            brush = Brush.linearGradient(
                                colors = listOf(
                                    MaterialTheme.colorScheme.primary,
                                    MaterialTheme.colorScheme.secondary
                                )
                            ),
                            shape = RoundedCornerShape(16.dp)
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "✓",
                        color = Color.White,
                        fontSize = 28.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "Task Manager",
                    style = MaterialTheme.typography.headlineMedium,
                    color = MaterialTheme.colorScheme.onBackground
                )
                Text(
                    text = "Войдите в свой аккаунт",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            // Card with form
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(24.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surface
                ),
                elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
                border = CardDefaults.outlinedCardBorder()
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(24.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    ModernTextField(
                        value = state.username,
                        onValueChange = onUsernameChange,
                        label = "Логин",
                        placeholder = "Введите логин"
                    )

                    ModernTextField(
                        value = state.password,
                        onValueChange = onPasswordChange,
                        label = "Пароль",
                        placeholder = "Введите пароль",
                        isPassword = true,
                        passwordVisible = passwordVisible,
                        onPasswordToggle = { passwordVisible = !passwordVisible }
                    )

                    AnimatedVisibility(
                        visible = !state.errorMessage.isNullOrBlank(),
                        enter = fadeIn() + slideInVertically(),
                        exit = fadeOut()
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(
                                    color = MaterialTheme.colorScheme.errorContainer,
                                    shape = RoundedCornerShape(12.dp)
                                )
                                .padding(12.dp)
                        ) {
                            Text(
                                text = state.errorMessage ?: "",
                                color = MaterialTheme.colorScheme.onErrorContainer,
                                style = MaterialTheme.typography.bodySmall
                            )
                        }
                    }

                    Button(
                        onClick = onLoginClick,
                        enabled = !state.isBusy,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(52.dp),
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.primary
                        )
                    ) {
                        if (state.isBusy) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                color = MaterialTheme.colorScheme.onPrimary,
                                strokeWidth = 2.dp
                            )
                        } else {
                            Text(
                                text = "Войти",
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Settings link
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Center
            ) {
                TextButton(onClick = { showSettings = true }) {
                    Text(
                        text = "⚙ Настройки сервера",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }

        if (showSettings) {
            ModalBottomSheet(
                onDismissRequest = { showSettings = false },
                containerColor = MaterialTheme.colorScheme.surface,
                shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 24.dp)
                        .padding(bottom = 32.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    Text(
                        text = "Настройки API",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold
                    )
                    ModernTextField(
                        value = state.domain,
                        onValueChange = onDomainChange,
                        label = "Адрес сервера",
                        placeholder = "https://task-manager.example.com"
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        TextButton(
                            onClick = { showSettings = false },
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("Отмена")
                        }
                        Button(
                            onClick = { showSettings = false },
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Text("Сохранить")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ModernTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    placeholder: String,
    isPassword: Boolean = false,
    passwordVisible: Boolean = false,
    onPasswordToggle: (() -> Unit)? = null
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontWeight = FontWeight.Medium
        )
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            placeholder = {
                Text(
                    text = placeholder,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
                )
            },
            visualTransformation = if (isPassword && !passwordVisible)
                PasswordVisualTransformation() else VisualTransformation.None,
            keyboardOptions = if (isPassword)
                KeyboardOptions(keyboardType = KeyboardType.Password) else KeyboardOptions.Default,
            trailingIcon = if (isPassword && onPasswordToggle != null) {
                {
                    TextButton(
                        onClick = onPasswordToggle,
                        contentPadding = PaddingValues(horizontal = 8.dp)
                    ) {
                        Text(
                            text = if (passwordVisible) "Скрыть" else "Показать",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                }
            } else null,
            shape = RoundedCornerShape(12.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = MaterialTheme.colorScheme.primary,
                unfocusedBorderColor = MaterialTheme.colorScheme.outline,
                focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f)
            )
        )
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Board Route (Kanban)
// ─────────────────────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun BoardRoute(
    boardState: BoardUiState,
    onRetry: () -> Unit,
    onRefresh: () -> Unit,
    onLogout: () -> Unit,
    onSelectBoard: (Int) -> Unit,
    onAddTask: (title: String, columnId: Int) -> Unit,
    onMoveTask: (taskId: Int, toColumnId: Int) -> Unit,
    onTaskClick: (Int) -> Unit,
    onOpenSettings: () -> Unit = {}
) {
    when (boardState) {
        BoardUiState.Loading -> {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(MaterialTheme.colorScheme.background),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    CircularProgressIndicator(
                        color = MaterialTheme.colorScheme.primary,
                        strokeWidth = 3.dp
                    )
                    Text(
                        text = "Загрузка...",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }

        is BoardUiState.Error -> {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(MaterialTheme.colorScheme.background),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.padding(32.dp)
                ) {
                    Text(
                        text = "⚠",
                        fontSize = 48.sp
                    )
                    Text(
                        text = boardState.message,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.error,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Button(
                        onClick = onRetry,
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Text("Повторить")
                    }
                    TextButton(onClick = onLogout) {
                        Text("Выйти из аккаунта")
                    }
                }
            }
        }

        is BoardUiState.Content -> {
            val selectedBoard = boardState.boards.firstOrNull { it.id == boardState.selectedBoardId }
                ?: boardState.boards.firstOrNull()
            var addTaskSheetVisible by remember { mutableStateOf(false) }
            var moveTask by remember { mutableStateOf<KanbanTask?>(null) }

            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(MaterialTheme.colorScheme.background)
            ) {
                Column(
                    modifier = Modifier.fillMaxSize()
                ) {
                    // Top header
                    KanbanHeader(
                        boards = boardState.boards,
                        selectedBoardId = boardState.selectedBoardId,
                        onSelectBoard = onSelectBoard,
                        onRefresh = onRefresh,
                        onOpenSettings = onOpenSettings,
                        onLogout = onLogout
                    )

                    // Board content
                    if (selectedBoard == null) {
                        Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = "Нет доступных досок",
                                style = MaterialTheme.typography.bodyLarge,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    } else {
                        LazyRow(
                            modifier = Modifier
                                .fillMaxSize()
                                .weight(1f),
                            contentPadding = PaddingValues(
                                start = 16.dp,
                                end = 16.dp,
                                top = 8.dp,
                                bottom = 88.dp
                            ),
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
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

                // FAB
                if (selectedBoard != null) {
                    FloatingActionButton(
                        onClick = { addTaskSheetVisible = true },
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .navigationBarsPadding()
                            .padding(20.dp),
                        containerColor = MaterialTheme.colorScheme.primary,
                        elevation = FloatingActionButtonDefaults.elevation(
                            defaultElevation = 6.dp
                        ),
                        shape = RoundedCornerShape(18.dp)
                    ) {
                        Text(
                            text = "+",
                            fontSize = 28.sp,
                            color = MaterialTheme.colorScheme.onPrimary,
                            fontWeight = FontWeight.Light
                        )
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
private fun KanbanHeader(
    boards: List<KanbanBoard>,
    selectedBoardId: Int?,
    onSelectBoard: (Int) -> Unit,
    onRefresh: () -> Unit,
    onOpenSettings: () -> Unit = {},
    onLogout: () -> Unit
) {
    var isRefreshing by remember { mutableStateOf(false) }

    // When boards data changes (refresh completed), reset spinner
    LaunchedEffect(boards) {
        isRefreshing = false
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface)
            .statusBarsPadding()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Kanban",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                    text = "${boards.sumOf { b -> b.columns.sumOf { it.tasks.size } }} задач",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            // Refresh button
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .background(
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        shape = CircleShape
                    )
                    .clickable(enabled = !isRefreshing) {
                        isRefreshing = true
                        onRefresh()
                    },
                contentAlignment = Alignment.Center
            ) {
                if (isRefreshing) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(18.dp),
                        color = MaterialTheme.colorScheme.primary,
                        strokeWidth = 2.dp
                    )
                } else {
                    Text(
                        text = "↻",
                        fontSize = 18.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            Spacer(modifier = Modifier.width(8.dp))
            // Settings button
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .background(
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        shape = CircleShape
                    )
                    .clickable(onClick = onOpenSettings),
                contentAlignment = Alignment.Center
            ) {
                Text(text = "⚙", fontSize = 16.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Spacer(modifier = Modifier.width(8.dp))
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .background(
                        color = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.6f),
                        shape = CircleShape
                    )
                    .clickable(onClick = onLogout),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "↩",
                    fontSize = 16.sp,
                    color = MaterialTheme.colorScheme.error
                )
            }
        }

        if (boards.size > 1) {
            LazyRow(
                contentPadding = PaddingValues(horizontal = 20.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(boards) { board ->
                    BoardTab(
                        title = board.title,
                        isSelected = board.id == selectedBoardId,
                        taskCount = board.columns.sumOf { it.tasks.size },
                        onClick = { onSelectBoard(board.id) }
                    )
                }
            }
        }

        HorizontalDivider(
            color = MaterialTheme.colorScheme.outline.copy(alpha = 0.5f),
            thickness = 0.5.dp
        )
    }
}

@Composable
private fun BoardTab(
    title: String,
    isSelected: Boolean,
    taskCount: Int,
    onClick: () -> Unit
) {
    val bgColor = if (isSelected) MaterialTheme.colorScheme.primaryContainer
    else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f)
    val textColor = if (isSelected) MaterialTheme.colorScheme.onPrimaryContainer
    else MaterialTheme.colorScheme.onSurfaceVariant

    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(10.dp))
            .background(bgColor)
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
            color = textColor
        )
        if (taskCount > 0) {
            Box(
                modifier = Modifier
                    .background(
                        color = if (isSelected) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.outline.copy(alpha = 0.4f),
                        shape = CircleShape
                    )
                    .padding(horizontal = 6.dp, vertical = 2.dp)
            ) {
                Text(
                    text = taskCount.toString(),
                    style = MaterialTheme.typography.labelSmall,
                    color = if (isSelected) MaterialTheme.colorScheme.onPrimary
                    else MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Column View
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun ColumnView(
    column: KanbanColumn,
    onMoveClick: (KanbanTask) -> Unit,
    onTaskClick: (Int) -> Unit
) {
    val columnColors = listOf(
        Color(0xFF8B5CF6),
        Color(0xFF06B6D4),
        Color(0xFF10B981),
        Color(0xFFF59E0B),
        Color(0xFFEF4444),
        Color(0xFFEC4899),
        Color(0xFF6366F1)
    )
    val accentColor = columnColors[column.id % columnColors.size]

    Column(
        modifier = Modifier
            .width(300.dp)
            .fillMaxHeight()
    ) {
        // Column header
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp))
                .background(MaterialTheme.colorScheme.surfaceContainer)
                .padding(start = 16.dp, end = 16.dp, top = 14.dp, bottom = 12.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                // Color indicator dot
                Box(
                    modifier = Modifier
                        .size(10.dp)
                        .background(accentColor, CircleShape)
                )
                Text(
                    text = if (column.icon.isBlank()) column.title else "${column.icon} ${column.title}",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.weight(1f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                // Task count badge
                Box(
                    modifier = Modifier
                        .background(
                            color = accentColor.copy(alpha = 0.15f),
                            shape = RoundedCornerShape(8.dp)
                        )
                        .padding(horizontal = 8.dp, vertical = 3.dp)
                ) {
                    Text(
                        text = column.tasks.size.toString(),
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = accentColor
                    )
                }
            }
        }

        // Top accent line
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(2.dp)
                .background(accentColor.copy(alpha = 0.7f))
        )

        // Tasks list
        LazyColumn(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f, fill = false)
                .heightIn(max = 600.dp)
                .background(MaterialTheme.colorScheme.surfaceContainer.copy(alpha = 0.6f))
                .padding(horizontal = 10.dp),
            contentPadding = PaddingValues(vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(column.tasks, key = { it.id }) { task ->
                TaskCard(
                    task = task,
                    accentColor = accentColor,
                    onMoveClick = { onMoveClick(task) },
                    onClick = { onTaskClick(task.id) }
                )
            }

            if (column.tasks.isEmpty()) {
                item {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 24.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "Нет задач",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
                        )
                    }
                }
            }
        }

        // Bottom cap
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(8.dp)
                .clip(RoundedCornerShape(bottomStart = 16.dp, bottomEnd = 16.dp))
                .background(MaterialTheme.colorScheme.surfaceContainer.copy(alpha = 0.6f))
        )
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Task Card
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun TaskCard(
    task: KanbanTask,
    accentColor: Color,
    onMoveClick: () -> Unit,
    onClick: () -> Unit
) {
    var menuExpanded by remember { mutableStateOf(false) }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            // Priority accent stripe
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(3.dp)
                    .background(
                        brush = Brush.horizontalGradient(
                            colors = listOf(
                                priorityColor(task.priority),
                                priorityColor(task.priority).copy(alpha = 0.3f)
                            )
                        )
                    )
            )

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                // Title row
                Row(
                    verticalAlignment = Alignment.Top,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Text(
                        text = task.title,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.weight(1f),
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                    Box {
                        Box(
                            modifier = Modifier
                                .size(28.dp)
                                .clip(RoundedCornerShape(8.dp))
                                .clickable { menuExpanded = true },
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = "⋯",
                                fontSize = 16.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        androidx.compose.material3.DropdownMenu(
                            expanded = menuExpanded,
                            onDismissRequest = { menuExpanded = false }
                        ) {
                            androidx.compose.material3.DropdownMenuItem(
                                text = { Text("Переместить в...") },
                                onClick = {
                                    menuExpanded = false
                                    onMoveClick()
                                }
                            )
                        }
                    }
                }

                // Description
                if (task.description.isNotBlank()) {
                    Text(
                        text = task.description,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                // Tags
                if (task.tags.isNotEmpty()) {
                    LazyRow(
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        items(task.tags.take(3)) { tag ->
                            Box(
                                modifier = Modifier
                                    .background(
                                        color = accentColor.copy(alpha = 0.12f),
                                        shape = RoundedCornerShape(6.dp)
                                    )
                                    .padding(horizontal = 6.dp, vertical = 2.dp)
                            ) {
                                Text(
                                    text = tag,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = accentColor,
                                    maxLines = 1
                                )
                            }
                        }
                    }
                }

                // Bottom row: priority + due date
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    // Priority pill
                    Row(
                        modifier = Modifier
                            .background(
                                color = priorityColor(task.priority).copy(alpha = 0.12f),
                                shape = RoundedCornerShape(6.dp)
                            )
                            .padding(horizontal = 6.dp, vertical = 2.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(3.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(6.dp)
                                .background(priorityColor(task.priority), CircleShape)
                        )
                        Text(
                            text = priorityLabel(task.priority),
                            style = MaterialTheme.typography.labelSmall,
                            color = priorityColor(task.priority),
                            fontWeight = FontWeight.Medium
                        )
                    }

                    if (!task.dueDate.isNullOrBlank()) {
                        Row(
                            modifier = Modifier
                                .background(
                                    color = MaterialTheme.colorScheme.surfaceVariant,
                                    shape = RoundedCornerShape(6.dp)
                                )
                                .padding(horizontal = 6.dp, vertical = 2.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(3.dp)
                        ) {
                            Text(
                                text = "📅",
                                fontSize = 9.sp
                            )
                            Text(
                                text = formatShortDate(task.dueDate),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }

                    Spacer(modifier = Modifier.weight(1f))

                    // Checklist progress if any
                    if (task.checklist.isNotEmpty()) {
                        val done = task.checklist.count { it.done }
                        Text(
                            text = "✓ $done/${task.checklist.size}",
                            style = MaterialTheme.typography.labelSmall,
                            color = if (done == task.checklist.size)
                                MaterialTheme.colorScheme.tertiary
                            else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

                    // Attachment indicator
                    if (task.attachments.isNotEmpty()) {
                        Text(
                            text = "📎 ${task.attachments.size}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }
}

private fun priorityColor(priority: TaskPriority): Color = when (priority) {
    TaskPriority.Low -> Color(0xFF10B981)
    TaskPriority.Medium -> Color(0xFFF59E0B)
    TaskPriority.High -> Color(0xFFEF4444)
}

private fun priorityLabel(priority: TaskPriority): String = priority.label

// Parse ISO-8601 date string like "2026-02-19T06:00:13.247183Z"
// Returns "19 фев 2026" for dates, "19 фев 2026, 06:00" for datetimes
private fun formatReadableDateTime(date: String?): String {
    if (date.isNullOrBlank()) return ""
    return try {
        val datePart = date.substringBefore('T')
        val parts = datePart.split("-")
        if (parts.size != 3) return date
        val day = parts[2].toIntOrNull() ?: return date
        val month = parts[1].toIntOrNull() ?: return date
        val year = parts[0]
        val monthName = when (month) {
            1 -> "янв"; 2 -> "фев"; 3 -> "мар"; 4 -> "апр"
            5 -> "май"; 6 -> "июн"; 7 -> "июл"; 8 -> "авг"
            9 -> "сен"; 10 -> "окт"; 11 -> "ноя"; 12 -> "дек"
            else -> parts[1]
        }
        if (date.contains('T')) {
            val timePart = date.substringAfter('T').substringBefore('.')
                .substringBefore('Z').take(5) // HH:mm
            "$day $monthName $year, $timePart"
        } else {
            "$day $monthName $year"
        }
    } catch (_: Exception) {
        date.take(16)
    }
}

private fun formatShortDate(date: String?): String {
    if (date.isNullOrBlank()) return ""
    return try {
        val datePart = date.substringBefore('T')
        val parts = datePart.split("-")
        if (parts.size == 3) "${parts[2]}.${parts[1]}.${parts[0].takeLast(2)}"
        else date.take(10)
    } catch (_: Exception) {
        date.take(10)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Add Task Sheet
// ─────────────────────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddTaskSheet(
    columns: List<KanbanColumn>,
    onDismiss: () -> Unit,
    onSubmit: (title: String, columnId: Int) -> Unit
) {
    var title by remember { mutableStateOf("") }
    var selectedColumnId by remember(columns) { mutableStateOf(columns.firstOrNull()?.id) }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 24.dp)
                .padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            // Handle + title
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = "Новая задача",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "Добавить задачу на доску",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            ModernTextField(
                value = title,
                onValueChange = { title = it },
                label = "Название задачи",
                placeholder = "Введите название..."
            )

            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    text = "Колонка",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = FontWeight.Medium
                )
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(columns, key = { it.id }) { column ->
                        val isSelected = selectedColumnId == column.id
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(10.dp))
                                .background(
                                    if (isSelected) MaterialTheme.colorScheme.primaryContainer
                                    else MaterialTheme.colorScheme.surfaceVariant
                                )
                                .border(
                                    width = if (isSelected) 1.5.dp else 0.dp,
                                    color = if (isSelected) MaterialTheme.colorScheme.primary
                                    else Color.Transparent,
                                    shape = RoundedCornerShape(10.dp)
                                )
                                .clickable { selectedColumnId = column.id }
                                .padding(horizontal = 14.dp, vertical = 8.dp)
                        ) {
                            Text(
                                text = if (column.icon.isBlank()) column.title
                                else "${column.icon} ${column.title}",
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                                color = if (isSelected) MaterialTheme.colorScheme.onPrimaryContainer
                                else MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }

            Button(
                onClick = {
                    val columnId = selectedColumnId ?: return@Button
                    onSubmit(title.trim(), columnId)
                },
                enabled = title.isNotBlank() && selectedColumnId != null,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.primary
                )
            ) {
                Text(
                    text = "Создать задачу",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Move Task Sheet
// ─────────────────────────────────────────────────────────────────────────────

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
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 24.dp)
                .padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = "Переместить задачу",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = task.title,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }

            if (availableColumns.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            MaterialTheme.colorScheme.surfaceVariant,
                            RoundedCornerShape(12.dp)
                        )
                        .padding(16.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "Нет доступных колонок",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    availableColumns.forEach { column ->
                        val isSelected = selectedColumnId == column.id
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .background(
                                    if (isSelected) MaterialTheme.colorScheme.primaryContainer
                                    else MaterialTheme.colorScheme.surfaceVariant
                                )
                                .border(
                                    width = if (isSelected) 1.5.dp else 0.dp,
                                    color = if (isSelected) MaterialTheme.colorScheme.primary
                                    else Color.Transparent,
                                    shape = RoundedCornerShape(12.dp)
                                )
                                .clickable { selectedColumnId = column.id }
                                .padding(16.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(32.dp)
                                    .background(
                                        color = if (isSelected) MaterialTheme.colorScheme.primary.copy(0.2f)
                                        else MaterialTheme.colorScheme.outline.copy(0.15f),
                                        shape = RoundedCornerShape(8.dp)
                                    ),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = if (column.icon.isBlank()) "▦" else column.icon,
                                    fontSize = 16.sp
                                )
                            }
                            Text(
                                text = column.title,
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                                color = if (isSelected) MaterialTheme.colorScheme.onPrimaryContainer
                                else MaterialTheme.colorScheme.onSurface,
                                modifier = Modifier.weight(1f)
                            )
                            Text(
                                text = "${column.tasks.size} задач",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            if (isSelected) {
                                Text(text = "✓", color = MaterialTheme.colorScheme.primary)
                            }
                        }
                    }
                }
            }

            Button(
                onClick = { selectedColumnId?.let(onMove) },
                enabled = selectedColumnId != null,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.primary
                )
            ) {
                Text(
                    text = "Переместить",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Task Detail Screen
// ─────────────────────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TaskDetailScreen(
    taskId: Int,
    taskDetailState: TaskDetailState?,
    onLoadTask: (Int) -> Unit,
    onBack: () -> Unit,
    onClearDetail: () -> Unit,
    onSaveCard: (draft: KanbanTask, onSuccess: () -> Unit, onError: (String) -> Unit) -> Unit
) {
    LaunchedEffect(taskId) {
        onLoadTask(taskId)
    }

    DisposableEffect(Unit) {
        onDispose {
            onClearDetail()
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        when (taskDetailState) {
            null, TaskDetailState.Loading -> {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                }
                Box(
                    modifier = Modifier
                        .statusBarsPadding()
                        .padding(16.dp)
                        .size(40.dp)
                        .background(
                            MaterialTheme.colorScheme.surface.copy(alpha = 0.9f),
                            CircleShape
                        )
                        .clickable(onClick = onBack),
                    contentAlignment = Alignment.Center
                ) {
                    Text(text = "←", fontSize = 18.sp, color = MaterialTheme.colorScheme.onSurface)
                }
            }

            is TaskDetailState.Error -> {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                        modifier = Modifier.padding(32.dp)
                    ) {
                        Text(text = "⚠", fontSize = 48.sp)
                        Text(
                            text = taskDetailState.message,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.error,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                        Button(onClick = { onLoadTask(taskId) }, shape = RoundedCornerShape(12.dp)) {
                            Text("Повторить")
                        }
                        TextButton(onClick = onBack) { Text("Назад") }
                    }
                }
            }

            is TaskDetailState.Content -> {
                TaskDetailContent(
                    task = taskDetailState.task,
                    users = taskDetailState.users,
                    onBack = onBack,
                    onSaveCard = onSaveCard
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun TaskDetailContent(
    task: KanbanTask,
    users: List<BoardUser>,
    onBack: () -> Unit,
    onSaveCard: (draft: KanbanTask, onSuccess: () -> Unit, onError: (String) -> Unit) -> Unit
) {
    // Editable local draft state — reset when task changes from server
    var draftTitle by remember(task.id) { mutableStateOf(task.title) }
    var draftDescription by remember(task.id) { mutableStateOf(task.description) }
    var draftPriority by remember(task.id) { mutableStateOf(task.priority) }
    var draftDeadline by remember(task.id) { mutableStateOf(task.dueDate ?: "") }
    var draftAssignee by remember(task.id) { mutableStateOf(task.assignee) }
    var draftTags by remember(task.id) { mutableStateOf(task.tags) }
    var draftCategories by remember(task.id) { mutableStateOf(task.categories) }
    var draftChecklist by remember(task.id) { mutableStateOf(task.checklist) }

    val hasChanges = draftTitle != task.title ||
        draftDescription != task.description ||
        draftPriority != task.priority ||
        (draftDeadline.ifBlank { null }) != task.dueDate ||
        draftAssignee != task.assignee ||
        draftTags != task.tags ||
        draftCategories != task.categories ||
        draftChecklist != task.checklist

    var isSaving by remember { mutableStateOf(false) }
    var saveError by remember { mutableStateOf<String?>(null) }

    // Tag/category/checklist input state
    var newTagInput by remember { mutableStateOf("") }
    var newCategoryInput by remember { mutableStateOf("") }
    var newChecklistInput by remember { mutableStateOf("") }
    var showAssigneeDropdown by remember { mutableStateOf(false) }

    Box(modifier = Modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(bottom = if (hasChanges) 112.dp else 40.dp)
        ) {
            // ── Hero header ──────────────────────────────────────────────────
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            brush = Brush.verticalGradient(
                                colors = listOf(
                                    priorityColor(draftPriority).copy(alpha = 0.15f),
                                    Color.Transparent
                                )
                            )
                        )
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .statusBarsPadding()
                            .padding(20.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        // Back button
                        Box(
                            modifier = Modifier
                                .size(40.dp)
                                .background(
                                    MaterialTheme.colorScheme.surface.copy(alpha = 0.8f),
                                    CircleShape
                                )
                                .clickable(onClick = onBack),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(text = "←", fontSize = 18.sp, color = MaterialTheme.colorScheme.onSurface)
                        }

                        Text(
                            text = "Редактирование задачи",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            // ── Title ────────────────────────────────────────────────────────
            item {
                DetailSection(title = "Название") {
                    OutlinedTextField(
                        value = draftTitle,
                        onValueChange = { draftTitle = it; saveError = null },
                        modifier = Modifier.fillMaxWidth(),
                        placeholder = { Text("Название задачи", style = MaterialTheme.typography.bodyMedium) },
                        singleLine = false,
                        maxLines = 3,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = MaterialTheme.colorScheme.primary,
                            unfocusedBorderColor = Color.Transparent,
                            focusedContainerColor = Color.Transparent,
                            unfocusedContainerColor = Color.Transparent
                        ),
                        textStyle = MaterialTheme.typography.bodyLarge.copy(
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    )
                }
            }

            // ── Description ──────────────────────────────────────────────────
            item {
                DetailSection(title = "Описание") {
                    OutlinedTextField(
                        value = draftDescription,
                        onValueChange = { draftDescription = it; saveError = null },
                        modifier = Modifier.fillMaxWidth(),
                        placeholder = { Text("Добавьте описание...", style = MaterialTheme.typography.bodyMedium) },
                        minLines = 3,
                        maxLines = 8,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = MaterialTheme.colorScheme.primary,
                            unfocusedBorderColor = Color.Transparent,
                            focusedContainerColor = Color.Transparent,
                            unfocusedContainerColor = Color.Transparent
                        ),
                        textStyle = MaterialTheme.typography.bodyMedium.copy(
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    )
                }
            }

            // ── Priority radio selector ───────────────────────────────────────
            item {
                DetailSection(title = "Приоритет") {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        TaskPriority.values().forEach { p ->
                            val selected = draftPriority == p
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(10.dp))
                                    .background(
                                        if (selected) priorityColor(p).copy(alpha = 0.12f)
                                        else Color.Transparent
                                    )
                                    .clickable { draftPriority = p; saveError = null }
                                    .padding(horizontal = 12.dp, vertical = 10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                // Radio circle
                                Box(
                                    modifier = Modifier
                                        .size(20.dp)
                                        .background(
                                            color = if (selected) priorityColor(p) else Color.Transparent,
                                            shape = CircleShape
                                        )
                                        .border(
                                            width = 2.dp,
                                            color = priorityColor(p),
                                            shape = CircleShape
                                        ),
                                    contentAlignment = Alignment.Center
                                ) {
                                    if (selected) {
                                        Box(
                                            modifier = Modifier
                                                .size(8.dp)
                                                .background(Color.White, CircleShape)
                                        )
                                    }
                                }
                                Text(
                                    text = p.emoji,
                                    fontSize = 18.sp
                                )
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = p.label,
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = if (selected) priorityColor(p)
                                        else MaterialTheme.colorScheme.onSurface,
                                        fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // ── Deadline ─────────────────────────────────────────────────────
            item {
                DetailSection(title = "Срок выполнения") {
                    OutlinedTextField(
                        value = draftDeadline,
                        onValueChange = { draftDeadline = it; saveError = null },
                        modifier = Modifier.fillMaxWidth(),
                        placeholder = { Text("ГГГГ-ММ-ДД или ГГГГ-ММ-ДДTHH:MM:SS", style = MaterialTheme.typography.bodySmall) },
                        singleLine = true,
                        leadingIcon = { Text("📅", fontSize = 16.sp, modifier = Modifier.padding(start = 4.dp)) },
                        trailingIcon = {
                            if (draftDeadline.isNotBlank()) {
                                TextButton(onClick = { draftDeadline = ""; saveError = null }) {
                                    Text("✕", color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        },
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = MaterialTheme.colorScheme.primary,
                            unfocusedBorderColor = Color.Transparent,
                            focusedContainerColor = Color.Transparent,
                            unfocusedContainerColor = Color.Transparent
                        ),
                        textStyle = MaterialTheme.typography.bodyMedium.copy(
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    )
                    if (draftDeadline.isNotBlank()) {
                        val formatted = formatReadableDateTime(draftDeadline)
                        if (formatted != draftDeadline) {
                            Text(
                                text = formatted,
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.padding(top = 4.dp, start = 4.dp)
                            )
                        }
                    }
                }
            }

            // ── Assignee dropdown ─────────────────────────────────────────────
            if (users.isNotEmpty()) {
                item {
                    DetailSection(title = "Ответственный") {
                        val assigneeName = users.find { it.id == draftAssignee }?.name
                        Box {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(10.dp))
                                    .clickable { showAssigneeDropdown = true }
                                    .padding(vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(36.dp)
                                        .background(
                                            MaterialTheme.colorScheme.primaryContainer,
                                            CircleShape
                                        ),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        text = (assigneeName?.firstOrNull()?.toString() ?: "?"),
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.onPrimaryContainer
                                    )
                                }
                                Text(
                                    text = assigneeName ?: "Не назначен",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = if (assigneeName != null) MaterialTheme.colorScheme.onSurface
                                    else MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.weight(1f)
                                )
                                Text(
                                    text = "▾",
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    fontSize = 14.sp
                                )
                            }

                            androidx.compose.material3.DropdownMenu(
                                expanded = showAssigneeDropdown,
                                onDismissRequest = { showAssigneeDropdown = false }
                            ) {
                                androidx.compose.material3.DropdownMenuItem(
                                    text = { Text("Не назначен", style = MaterialTheme.typography.bodyMedium) },
                                    onClick = { draftAssignee = null; showAssigneeDropdown = false; saveError = null }
                                )
                                users.forEach { user ->
                                    androidx.compose.material3.DropdownMenuItem(
                                        text = { Text(user.name, style = MaterialTheme.typography.bodyMedium) },
                                        onClick = { draftAssignee = user.id; showAssigneeDropdown = false; saveError = null }
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // ── Tags ─────────────────────────────────────────────────────────
            item {
                DetailSection(title = "Теги") {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        // Existing tags as removable chips
                        if (draftTags.isNotEmpty()) {
                            androidx.compose.foundation.layout.FlowRow(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                draftTags.forEach { tag ->
                                    Row(
                                        modifier = Modifier
                                            .background(
                                                MaterialTheme.colorScheme.primaryContainer,
                                                RoundedCornerShape(8.dp)
                                            )
                                            .padding(start = 10.dp, end = 6.dp, top = 5.dp, bottom = 5.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                                    ) {
                                        Text(
                                            text = "# $tag",
                                            style = MaterialTheme.typography.labelMedium,
                                            color = MaterialTheme.colorScheme.onPrimaryContainer,
                                            fontWeight = FontWeight.Medium
                                        )
                                        Box(
                                            modifier = Modifier
                                                .size(18.dp)
                                                .clip(CircleShape)
                                                .clickable {
                                                    draftTags = draftTags - tag
                                                    saveError = null
                                                },
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Text(
                                                text = "✕",
                                                fontSize = 10.sp,
                                                color = MaterialTheme.colorScheme.onPrimaryContainer
                                            )
                                        }
                                    }
                                }
                            }
                        }
                        // Add new tag input
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            OutlinedTextField(
                                value = newTagInput,
                                onValueChange = { newTagInput = it },
                                modifier = Modifier.weight(1f),
                                placeholder = { Text("Новый тег...", style = MaterialTheme.typography.bodySmall) },
                                singleLine = true,
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedBorderColor = MaterialTheme.colorScheme.primary,
                                    unfocusedBorderColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.4f),
                                    focusedContainerColor = Color.Transparent,
                                    unfocusedContainerColor = Color.Transparent
                                ),
                                textStyle = MaterialTheme.typography.bodySmall.copy(
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                            )
                            Button(
                                onClick = {
                                    val t = newTagInput.trim()
                                    if (t.isNotBlank() && t !in draftTags) {
                                        draftTags = draftTags + t
                                        saveError = null
                                    }
                                    newTagInput = ""
                                },
                                enabled = newTagInput.isNotBlank(),
                                shape = RoundedCornerShape(10.dp),
                                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 10.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = MaterialTheme.colorScheme.primary
                                )
                            ) {
                                Text("+", fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }

            // ── Categories ───────────────────────────────────────────────────
            item {
                DetailSection(title = "Категории") {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        if (draftCategories.isNotEmpty()) {
                            androidx.compose.foundation.layout.FlowRow(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                draftCategories.forEach { category ->
                                    Row(
                                        modifier = Modifier
                                            .background(
                                                MaterialTheme.colorScheme.secondaryContainer,
                                                RoundedCornerShape(8.dp)
                                            )
                                            .padding(start = 10.dp, end = 6.dp, top = 5.dp, bottom = 5.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                                    ) {
                                        Text(
                                            text = category,
                                            style = MaterialTheme.typography.labelMedium,
                                            color = MaterialTheme.colorScheme.onSecondaryContainer
                                        )
                                        Box(
                                            modifier = Modifier
                                                .size(18.dp)
                                                .clip(CircleShape)
                                                .clickable {
                                                    draftCategories = draftCategories - category
                                                    saveError = null
                                                },
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Text(
                                                text = "✕",
                                                fontSize = 10.sp,
                                                color = MaterialTheme.colorScheme.onSecondaryContainer
                                            )
                                        }
                                    }
                                }
                            }
                        }
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            OutlinedTextField(
                                value = newCategoryInput,
                                onValueChange = { newCategoryInput = it },
                                modifier = Modifier.weight(1f),
                                placeholder = { Text("Новая категория...", style = MaterialTheme.typography.bodySmall) },
                                singleLine = true,
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedBorderColor = MaterialTheme.colorScheme.primary,
                                    unfocusedBorderColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.4f),
                                    focusedContainerColor = Color.Transparent,
                                    unfocusedContainerColor = Color.Transparent
                                ),
                                textStyle = MaterialTheme.typography.bodySmall.copy(
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                            )
                            Button(
                                onClick = {
                                    val c = newCategoryInput.trim()
                                    if (c.isNotBlank() && c !in draftCategories) {
                                        draftCategories = draftCategories + c
                                        saveError = null
                                    }
                                    newCategoryInput = ""
                                },
                                enabled = newCategoryInput.isNotBlank(),
                                shape = RoundedCornerShape(10.dp),
                                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 10.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = MaterialTheme.colorScheme.secondary
                                )
                            ) {
                                Text("+", fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }

            // ── Checklist ─────────────────────────────────────────────────────
            item {
                val doneCount = draftChecklist.count { it.done }
                DetailSection(
                    title = "Чек-лист",
                    badge = if (draftChecklist.isNotEmpty()) "$doneCount / ${draftChecklist.size}" else null
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        // Progress bar
                        if (draftChecklist.isNotEmpty()) {
                            val progress = doneCount.toFloat() / draftChecklist.size
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(4.dp)
                                    .background(
                                        MaterialTheme.colorScheme.outline.copy(alpha = 0.2f),
                                        RoundedCornerShape(2.dp)
                                    )
                            ) {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth(progress)
                                        .height(4.dp)
                                        .background(
                                            MaterialTheme.colorScheme.tertiary,
                                            RoundedCornerShape(2.dp)
                                        )
                                )
                            }
                            Spacer(modifier = Modifier.height(8.dp))
                        }

                        // Items with toggle + remove
                        draftChecklist.forEachIndexed { index, item ->
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 6.dp)
                            ) {
                                // Checkbox tap area
                                Box(
                                    modifier = Modifier
                                        .size(24.dp)
                                        .clip(RoundedCornerShape(6.dp))
                                        .background(
                                            color = if (item.done) MaterialTheme.colorScheme.tertiary
                                            else Color.Transparent
                                        )
                                        .border(
                                            width = 1.5.dp,
                                            color = if (item.done) MaterialTheme.colorScheme.tertiary
                                            else MaterialTheme.colorScheme.outline,
                                            shape = RoundedCornerShape(6.dp)
                                        )
                                        .clickable {
                                            draftChecklist = draftChecklist.toMutableList().also {
                                                it[index] = item.copy(done = !item.done)
                                            }
                                            saveError = null
                                        },
                                    contentAlignment = Alignment.Center
                                ) {
                                    if (item.done) {
                                        Text(
                                            text = "✓",
                                            fontSize = 12.sp,
                                            color = MaterialTheme.colorScheme.onTertiary,
                                            fontWeight = FontWeight.Bold
                                        )
                                    }
                                }
                                Text(
                                    text = item.text,
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = if (item.done) MaterialTheme.colorScheme.onSurfaceVariant
                                    else MaterialTheme.colorScheme.onSurface,
                                    textDecoration = if (item.done) TextDecoration.LineThrough
                                    else TextDecoration.None,
                                    modifier = Modifier.weight(1f)
                                )
                                // Remove button
                                Box(
                                    modifier = Modifier
                                        .size(28.dp)
                                        .clip(CircleShape)
                                        .clickable {
                                            draftChecklist = draftChecklist.toMutableList().also { it.removeAt(index) }
                                            saveError = null
                                        },
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        text = "✕",
                                        fontSize = 12.sp,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                            if (index < draftChecklist.lastIndex) {
                                HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.12f))
                            }
                        }

                        // Add new checklist item
                        Spacer(modifier = Modifier.height(4.dp))
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            OutlinedTextField(
                                value = newChecklistInput,
                                onValueChange = { newChecklistInput = it },
                                modifier = Modifier.weight(1f),
                                placeholder = { Text("Новый пункт...", style = MaterialTheme.typography.bodySmall) },
                                singleLine = true,
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedBorderColor = MaterialTheme.colorScheme.primary,
                                    unfocusedBorderColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.4f),
                                    focusedContainerColor = Color.Transparent,
                                    unfocusedContainerColor = Color.Transparent
                                ),
                                textStyle = MaterialTheme.typography.bodySmall.copy(
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                            )
                            Button(
                                onClick = {
                                    val text = newChecklistInput.trim()
                                    if (text.isNotBlank()) {
                                        val newId = "new_${System.currentTimeMillis()}"
                                        draftChecklist = draftChecklist + ChecklistItemDto(id = newId, text = text, done = false)
                                        saveError = null
                                    }
                                    newChecklistInput = ""
                                },
                                enabled = newChecklistInput.isNotBlank(),
                                shape = RoundedCornerShape(10.dp),
                                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 10.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = MaterialTheme.colorScheme.tertiary
                                )
                            ) {
                                Text("+", fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }

            // ── Attachments (read-only) ───────────────────────────────────────
            if (task.attachments.isNotEmpty()) {
                item {
                    DetailSection(title = "Вложения") {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            task.attachments.forEach { attachment ->
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .background(
                                            MaterialTheme.colorScheme.surfaceVariant,
                                            RoundedCornerShape(10.dp)
                                        )
                                        .padding(12.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(36.dp)
                                            .background(
                                                MaterialTheme.colorScheme.secondaryContainer,
                                                RoundedCornerShape(8.dp)
                                            ),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Text(text = "📄", fontSize = 18.sp)
                                    }
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = attachment.name,
                                            style = MaterialTheme.typography.bodyMedium,
                                            fontWeight = FontWeight.Medium,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
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

            // ── Meta info ─────────────────────────────────────────────────────
            item {
                DetailSection(title = "Информация") {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        MetaRow(label = "ID задачи", value = "#${task.id}")
                        if (!task.createdAt.isNullOrBlank()) {
                            MetaRow(label = "Создано", value = formatReadableDateTime(task.createdAt))
                        }
                        if (!task.updatedAt.isNullOrBlank()) {
                            MetaRow(label = "Обновлено", value = formatReadableDateTime(task.updatedAt))
                        }
                    }
                }
            }
        }

        // ── Floating Save/Discard bar ────────────────────────────────────────
        AnimatedVisibility(
            visible = hasChanges,
            enter = fadeIn() + slideInVertically(initialOffsetY = { it }),
            exit = fadeOut(),
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .navigationBarsPadding()
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                AnimatedVisibility(visible = !saveError.isNullOrBlank()) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(
                                MaterialTheme.colorScheme.errorContainer,
                                RoundedCornerShape(12.dp)
                            )
                            .padding(horizontal = 14.dp, vertical = 8.dp)
                    ) {
                        Text(
                            text = saveError ?: "",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onErrorContainer
                        )
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    // Discard
                    TextButton(
                        onClick = {
                            draftTitle = task.title
                            draftDescription = task.description
                            draftPriority = task.priority
                            draftDeadline = task.dueDate ?: ""
                            draftAssignee = task.assignee
                            draftTags = task.tags
                            draftCategories = task.categories
                            draftChecklist = task.checklist
                            saveError = null
                        },
                        enabled = !isSaving,
                        modifier = Modifier
                            .weight(1f)
                            .height(50.dp)
                            .background(
                                MaterialTheme.colorScheme.surfaceVariant,
                                RoundedCornerShape(14.dp)
                            )
                    ) {
                        Text(
                            text = "Отменить",
                            style = MaterialTheme.typography.labelLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

                    // Save
                    Button(
                        onClick = {
                            isSaving = true
                            saveError = null
                            val draft = task.copy(
                                title = draftTitle.trim().ifBlank { task.title },
                                description = draftDescription,
                                priority = draftPriority,
                                dueDate = draftDeadline.trim().ifBlank { null },
                                assignee = draftAssignee,
                                tags = draftTags,
                                categories = draftCategories,
                                checklist = draftChecklist
                            )
                            onSaveCard(
                                draft,
                                { isSaving = false },
                                { err -> isSaving = false; saveError = err }
                            )
                        },
                        enabled = !isSaving,
                        modifier = Modifier
                            .weight(2f)
                            .height(50.dp),
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.primary
                        )
                    ) {
                        if (isSaving) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(18.dp),
                                color = MaterialTheme.colorScheme.onPrimary,
                                strokeWidth = 2.dp
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Сохранение...", style = MaterialTheme.typography.labelLarge)
                        } else {
                            Text(
                                text = "Сохранить",
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }
                }
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// PIN Unlock Screen
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun PinUnlockScreen(
    biometricEnabled: Boolean,
    onUnlocked: () -> Unit,
    onForgotPin: () -> Unit
) {
    val context = LocalContext.current
    val activity = LocalActivity.current
    var pin by remember { mutableStateOf("") }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var attempts by remember { mutableStateOf(0) }
    val maxAttempts = 5

    // Auto-trigger biometric on screen entry if enabled
    LaunchedEffect(Unit) {
        if (biometricEnabled) {
            triggerBiometricPrompt(activity, onSuccess = onUnlocked, onError = {})
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
        contentAlignment = Alignment.Center
    ) {
        // Decorative gradient blob
        Box(
            modifier = Modifier
                .size(320.dp)
                .align(Alignment.TopCenter)
                .offset(y = (-80).dp)
                .background(
                    brush = Brush.radialGradient(
                        colors = listOf(
                            MaterialTheme.colorScheme.primary.copy(alpha = 0.12f),
                            Color.Transparent
                        )
                    ),
                    shape = CircleShape
                )
        )

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .navigationBarsPadding()
                .padding(horizontal = 32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(32.dp)
        ) {
            // App icon
            Box(
                modifier = Modifier
                    .size(64.dp)
                    .background(
                        brush = Brush.linearGradient(
                            colors = listOf(
                                MaterialTheme.colorScheme.primary,
                                MaterialTheme.colorScheme.secondary
                            )
                        ),
                        shape = RoundedCornerShape(20.dp)
                    ),
                contentAlignment = Alignment.Center
            ) {
                Text(text = "✓", fontSize = 32.sp, color = Color.White, fontWeight = FontWeight.Bold)
            }

            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Text(
                    text = "Введите PIN-код",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onBackground
                )
                Text(
                    text = "Осталось попыток: ${maxAttempts - attempts}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            // PIN dots
            Row(
                horizontalArrangement = Arrangement.spacedBy(20.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                repeat(4) { i ->
                    val filled = i < pin.length
                    Box(
                        modifier = Modifier
                            .size(18.dp)
                            .background(
                                color = if (filled) MaterialTheme.colorScheme.primary
                                else MaterialTheme.colorScheme.outline.copy(alpha = 0.4f),
                                shape = CircleShape
                            )
                    )
                }
            }

            // Error message
            AnimatedVisibility(visible = !errorMessage.isNullOrBlank()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(MaterialTheme.colorScheme.errorContainer, RoundedCornerShape(12.dp))
                        .padding(horizontal = 16.dp, vertical = 10.dp)
                ) {
                    Text(
                        text = errorMessage ?: "",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onErrorContainer,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }

            // Numpad
            Column(
                verticalArrangement = Arrangement.spacedBy(12.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                val digits = listOf(
                    listOf("1", "2", "3"),
                    listOf("4", "5", "6"),
                    listOf("7", "8", "9"),
                    listOf("bio", "0", "⌫")
                )
                digits.forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        row.forEach { key ->
                            PinKey(
                                label = key,
                                isBioVisible = biometricEnabled,
                                onClick = {
                                    when (key) {
                                        "⌫" -> {
                                            if (pin.isNotEmpty()) pin = pin.dropLast(1)
                                            errorMessage = null
                                        }
                                        "bio" -> {
                                            if (biometricEnabled) {
                                                triggerBiometricPrompt(activity, onSuccess = onUnlocked, onError = {})
                                            }
                                        }
                                        else -> {
                                            if (pin.length < 4) {
                                                pin += key
                                                errorMessage = null
                                                if (pin.length == 4) {
                                                    if (verifyPin(context, pin)) {
                                                        onUnlocked()
                                                    } else {
                                                        attempts++
                                                        if (attempts >= maxAttempts) {
                                                            onForgotPin()
                                                        } else {
                                                            errorMessage = "Неверный PIN"
                                                            pin = ""
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            )
                        }
                    }
                }
            }

            TextButton(onClick = onForgotPin) {
                Text(
                    text = "Забыл PIN-код (сбросить и войти заново)",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
private fun PinKey(
    label: String,
    isBioVisible: Boolean,
    onClick: () -> Unit
) {
    val isEmpty = label == "bio" && !isBioVisible
    Box(
        modifier = Modifier
            .size(80.dp)
            .background(
                color = if (isEmpty) Color.Transparent
                else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.8f),
                shape = CircleShape
            )
            .then(
                if (!isEmpty) Modifier.clickable(onClick = onClick) else Modifier
            ),
        contentAlignment = Alignment.Center
    ) {
        if (!isEmpty) {
            when (label) {
                "⌫" -> Text(text = "⌫", fontSize = 22.sp, color = MaterialTheme.colorScheme.onSurface)
                "bio" -> Text(text = "☉", fontSize = 24.sp, color = MaterialTheme.colorScheme.primary)
                else -> Text(
                    text = label,
                    fontSize = 26.sp,
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
        }
    }
}

private fun triggerBiometricPrompt(
    activity: FragmentActivity,
    onSuccess: () -> Unit,
    onError: (String) -> Unit
) {
    val executor = ContextCompat.getMainExecutor(activity)
    val callback = object : BiometricPrompt.AuthenticationCallback() {
        override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
            onSuccess()
        }
        override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
            if (errorCode != BiometricPrompt.ERROR_USER_CANCELED &&
                errorCode != BiometricPrompt.ERROR_NEGATIVE_BUTTON) {
                onError(errString.toString())
            }
        }
    }
    val prompt = BiometricPrompt(activity, executor, callback)
    val info = BiometricPrompt.PromptInfo.Builder()
        .setTitle("Вход в Task Manager")
        .setSubtitle("Подтвердите личность")
        .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_WEAK)
        .setNegativeButtonText("Использовать PIN")
        .build()
    prompt.authenticate(info)
}

// ─────────────────────────────────────────────────────────────────────────────
// PIN Setup Dialog
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun PinSetupDialog(
    onConfirmed: (pin: String) -> Unit,
    onDismiss: () -> Unit
) {
    var step by remember { mutableStateOf(1) }
    var firstPin by remember { mutableStateOf("") }
    var currentPin by remember { mutableStateOf("") }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    val title = if (step == 1) "Введите новый PIN" else "Повторите PIN"

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background.copy(alpha = 0.97f)),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .navigationBarsPadding()
                .padding(horizontal = 32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(28.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                TextButton(onClick = {
                    if (step == 2) { step = 1; currentPin = ""; errorMessage = null }
                    else onDismiss()
                }) {
                    Text(if (step == 2) "← Назад" else "Отмена", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Text(
                    text = "Шаг $step / 2",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Text(
                text = title,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onBackground
            )

            // PIN dots
            Row(
                horizontalArrangement = Arrangement.spacedBy(20.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                repeat(4) { i ->
                    Box(
                        modifier = Modifier
                            .size(18.dp)
                            .background(
                                color = if (i < currentPin.length) MaterialTheme.colorScheme.primary
                                else MaterialTheme.colorScheme.outline.copy(alpha = 0.4f),
                                shape = CircleShape
                            )
                    )
                }
            }

            AnimatedVisibility(visible = !errorMessage.isNullOrBlank()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(MaterialTheme.colorScheme.errorContainer, RoundedCornerShape(12.dp))
                        .padding(horizontal = 16.dp, vertical = 10.dp)
                ) {
                    Text(
                        text = errorMessage ?: "",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onErrorContainer,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }

            // Numpad
            Column(
                verticalArrangement = Arrangement.spacedBy(12.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                val digits = listOf(
                    listOf("1", "2", "3"),
                    listOf("4", "5", "6"),
                    listOf("7", "8", "9"),
                    listOf("", "0", "⌫")
                )
                digits.forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        row.forEach { key ->
                            PinKey(
                                label = key,
                                isBioVisible = false,
                                onClick = {
                                    when (key) {
                                        "⌫" -> {
                                            if (currentPin.isNotEmpty()) currentPin = currentPin.dropLast(1)
                                            errorMessage = null
                                        }
                                        "" -> {}
                                        else -> {
                                            if (currentPin.length < 4) {
                                                currentPin += key
                                                errorMessage = null
                                                if (currentPin.length == 4) {
                                                    if (step == 1) {
                                                        firstPin = currentPin
                                                        currentPin = ""
                                                        step = 2
                                                    } else {
                                                        if (currentPin == firstPin) {
                                                            onConfirmed(currentPin)
                                                        } else {
                                                            errorMessage = "PIN-коды не совпадают"
                                                            currentPin = ""
                                                            step = 1
                                                            firstPin = ""
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            )
                        }
                    }
                }
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings Screen
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun SettingsScreen(
    session: SessionUiState,
    securitySettings: SecuritySettings,
    onBack: () -> Unit,
    onEnablePin: (pin: String) -> Unit,
    onDisablePin: () -> Unit,
    onSetBiometric: (Boolean) -> Unit,
    onLogout: () -> Unit
) {
    val context = LocalContext.current
    val activity = LocalActivity.current
    var showPinSetup by remember { mutableStateOf(false) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(bottom = 40.dp)
        ) {
            // Header
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(MaterialTheme.colorScheme.surface)
                        .statusBarsPadding()
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(20.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(40.dp)
                                .background(MaterialTheme.colorScheme.surfaceVariant, CircleShape)
                                .clickable(onClick = onBack),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(text = "←", fontSize = 18.sp, color = MaterialTheme.colorScheme.onSurface)
                        }
                        Text(
                            text = "Настройки",
                            style = MaterialTheme.typography.headlineMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                    HorizontalDivider(
                        modifier = Modifier.align(Alignment.BottomCenter),
                        color = MaterialTheme.colorScheme.outline.copy(alpha = 0.5f),
                        thickness = 0.5.dp
                    )
                }
            }

            // Security section
            item {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp, vertical = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Text(
                        text = "БЕЗОПАСНОСТЬ",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.primary,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(bottom = 8.dp, start = 4.dp)
                    )

                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        elevation = CardDefaults.cardElevation(0.dp),
                        border = CardDefaults.outlinedCardBorder()
                    ) {
                        Column {
                            // PIN toggle
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        if (securitySettings.pinEnabled) onDisablePin()
                                        else showPinSetup = true
                                    }
                                    .padding(horizontal = 20.dp, vertical = 16.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(16.dp)
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(40.dp)
                                        .background(
                                            MaterialTheme.colorScheme.primaryContainer,
                                            RoundedCornerShape(12.dp)
                                        ),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(text = "🔒", fontSize = 20.sp)
                                }
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = "Вход по PIN-коду",
                                        style = MaterialTheme.typography.bodyMedium,
                                        fontWeight = FontWeight.Medium,
                                        color = MaterialTheme.colorScheme.onSurface
                                    )
                                    Text(
                                        text = if (securitySettings.pinEnabled) "Включён" else "Выключен",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                                Switch(
                                    checked = securitySettings.pinEnabled,
                                    onCheckedChange = {
                                        if (securitySettings.pinEnabled) onDisablePin()
                                        else showPinSetup = true
                                    },
                                    colors = SwitchDefaults.colors(
                                        checkedThumbColor = MaterialTheme.colorScheme.onPrimary,
                                        checkedTrackColor = MaterialTheme.colorScheme.primary
                                    )
                                )
                            }

                            // Biometric toggle (only when PIN enabled)
                            if (securitySettings.pinEnabled) {
                                HorizontalDivider(
                                    modifier = Modifier.padding(horizontal = 16.dp),
                                    color = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f)
                                )
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .then(
                                            if (securitySettings.biometricAvailable)
                                                Modifier.clickable {
                                                    if (!securitySettings.biometricEnabled) {
                                                        triggerBiometricPrompt(
                                                            activity,
                                                            onSuccess = { onSetBiometric(true) },
                                                            onError = {}
                                                        )
                                                    } else {
                                                        onSetBiometric(false)
                                                    }
                                                }
                                            else Modifier
                                        )
                                        .padding(horizontal = 20.dp, vertical = 16.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(40.dp)
                                            .background(
                                                MaterialTheme.colorScheme.secondaryContainer,
                                                RoundedCornerShape(12.dp)
                                            ),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Text(text = "☉", fontSize = 22.sp, color = MaterialTheme.colorScheme.secondary)
                                    }
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = "Биометрия",
                                            style = MaterialTheme.typography.bodyMedium,
                                            fontWeight = FontWeight.Medium,
                                            color = if (securitySettings.biometricAvailable)
                                                MaterialTheme.colorScheme.onSurface
                                            else MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                        Text(
                                            text = when {
                                                !securitySettings.biometricAvailable -> "Недоступна на этом устройстве"
                                                securitySettings.biometricEnabled -> "Включена"
                                                else -> "Выключена"
                                            },
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                    Switch(
                                        checked = securitySettings.biometricEnabled,
                                        onCheckedChange = { enabled ->
                                            if (enabled) {
                                                triggerBiometricPrompt(
                                                    activity,
                                                    onSuccess = { onSetBiometric(true) },
                                                    onError = {}
                                                )
                                            } else {
                                                onSetBiometric(false)
                                            }
                                        },
                                        enabled = securitySettings.biometricAvailable,
                                        colors = SwitchDefaults.colors(
                                            checkedThumbColor = MaterialTheme.colorScheme.onSecondary,
                                            checkedTrackColor = MaterialTheme.colorScheme.secondary
                                        )
                                    )
                                }

                                HorizontalDivider(
                                    modifier = Modifier.padding(horizontal = 16.dp),
                                    color = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f)
                                )

                                // Change PIN button
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable { showPinSetup = true }
                                        .padding(horizontal = 20.dp, vertical = 16.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(40.dp)
                                            .background(
                                                MaterialTheme.colorScheme.tertiaryContainer,
                                                RoundedCornerShape(12.dp)
                                            ),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Text(text = "✎", fontSize = 20.sp)
                                    }
                                    Text(
                                        text = "Сменить PIN",
                                        style = MaterialTheme.typography.bodyMedium,
                                        fontWeight = FontWeight.Medium,
                                        color = MaterialTheme.colorScheme.onSurface,
                                        modifier = Modifier.weight(1f)
                                    )
                                    Text(
                                        text = "→",
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        fontSize = 16.sp
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // Account section
            item {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Text(
                        text = "АККАУНТ",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.primary,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(bottom = 8.dp, start = 4.dp)
                    )

                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        elevation = CardDefaults.cardElevation(0.dp),
                        border = CardDefaults.outlinedCardBorder()
                    ) {
                        Column {
                            // Server domain
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 20.dp, vertical = 16.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(16.dp)
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(40.dp)
                                        .background(
                                            MaterialTheme.colorScheme.surfaceVariant,
                                            RoundedCornerShape(12.dp)
                                        ),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(text = "🌐", fontSize = 20.sp)
                                }
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = "Сервер",
                                        style = MaterialTheme.typography.bodyMedium,
                                        fontWeight = FontWeight.Medium,
                                        color = MaterialTheme.colorScheme.onSurface
                                    )
                                    Text(
                                        text = session.domain.ifBlank { "Не указан" },
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                            }

                            HorizontalDivider(
                                modifier = Modifier.padding(horizontal = 16.dp),
                                color = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f)
                            )

                            // Logout
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable(onClick = onLogout)
                                    .padding(horizontal = 20.dp, vertical = 16.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(16.dp)
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(40.dp)
                                        .background(
                                            MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.5f),
                                            RoundedCornerShape(12.dp)
                                        ),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(text = "↩", fontSize = 20.sp, color = MaterialTheme.colorScheme.error)
                                }
                                Text(
                                    text = "Выйти из аккаунта",
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = FontWeight.Medium,
                                    color = MaterialTheme.colorScheme.error,
                                    modifier = Modifier.weight(1f)
                                )
                            }
                        }
                    }
                }
            }
        }

        // PIN setup overlay
        if (showPinSetup) {
            PinSetupDialog(
                onConfirmed = { pin ->
                    onEnablePin(pin)
                    showPinSetup = false
                },
                onDismiss = { showPinSetup = false }
            )
        }
    }
}

@Composable
private fun DetailSection(
    title: String,
    badge: String? = null,
    content: @Composable () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 6.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface
            )
            if (badge != null) {
                Box(
                    modifier = Modifier
                        .background(
                            MaterialTheme.colorScheme.surfaceVariant,
                            RoundedCornerShape(6.dp)
                        )
                        .padding(horizontal = 7.dp, vertical = 2.dp)
                ) {
                    Text(
                        text = badge,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }

        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(14.dp),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surface
            ),
            elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
            border = CardDefaults.outlinedCardBorder()
        ) {
            Box(modifier = Modifier.padding(16.dp)) {
                content()
            }
        }
    }
}

@Composable
private fun MetaRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurface,
            fontWeight = FontWeight.Medium
        )
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ViewModel
// ─────────────────────────────────────────────────────────────────────────────

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

    private val _securitySettings = MutableStateFlow(SecuritySettings())
    val securitySettings: StateFlow<SecuritySettings> = _securitySettings.asStateFlow()

    fun bootstrap(domain: String, token: String) {
        val normalizedDomain = normalizeBaseUrl(domain)
        _session.update {
            it.copy(domain = normalizedDomain, token = token, isAuthenticated = token.isNotBlank(), isBusy = false)
        }
        if (token.isNotBlank()) refresh()
    }

    fun onDomainChanged(value: String) = _session.update { it.copy(domain = value) }
    fun onUsernameChanged(value: String) = _session.update { it.copy(username = value) }
    fun onPasswordChanged(value: String) = _session.update { it.copy(password = value) }

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
                    it.copy(token = token, isAuthenticated = true, isBusy = false, errorMessage = null, password = "", registeredPlayerId = "")
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
                    request = CreateCardRequest(column = columnId, title = title.trim())
                )
            }
            refresh()
        }
    }

    fun moveTask(taskId: Int, toColumnId: Int) {
        val s = session.value
        viewModelScope.launch {
            runCatching {
                repository.moveCard(baseUrl = s.domain, apiToken = s.token, cardId = taskId, toColumnId = toColumnId)
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
                repository.updateNotificationProfile(baseUrl = s.domain, apiToken = s.token, oneSignalPlayerId = playerId)
                repository.ensurePushNotificationPreferences(baseUrl = s.domain, apiToken = s.token, eventTypes = notificationEventTypes)
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
    val username: String = "",
    val password: String = "",
    val registeredPlayerId: String = "",
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

// ─────────────────────────────────────────────────────────────────────────────
// Repository & API
// ─────────────────────────────────────────────────────────────────────────────

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
            items.map { dtoToTask(it) }.sortedBy { it.position }
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
            KanbanBoard(id = dto.id, title = dto.name, columns = columnsByBoard[dto.id].orEmpty())
        }
    }

    suspend fun getCard(baseUrl: String, apiToken: String, cardId: Int): KanbanTask =
        dtoToTask(api(baseUrl, apiToken).getCard(cardId))

    suspend fun createCard(baseUrl: String, apiToken: String, request: CreateCardRequest) {
        api(baseUrl, apiToken).createCard(request)
    }

    suspend fun moveCard(baseUrl: String, apiToken: String, cardId: Int, toColumnId: Int) {
        api(baseUrl, apiToken).moveCard(cardId = cardId, request = MoveCardRequest(toColumn = toColumnId))
    }

    suspend fun fetchUsers(baseUrl: String, apiToken: String): List<BoardUser> {
        return api(baseUrl, apiToken).listUsers().map { BoardUser(id = it.id, name = it.fullName.ifBlank { it.username }) }
    }

    suspend fun updateCard(
        baseUrl: String,
        apiToken: String,
        cardId: Int,
        oldTask: KanbanTask,
        newTask: KanbanTask
    ): KanbanTask {
        val patch = PatchCardRequest(
            title = newTask.title.trim().takeIf { it != oldTask.title && it.isNotBlank() },
            description = newTask.description.takeIf { it != oldTask.description },
            assignee = newTask.assignee.takeIf { it != oldTask.assignee },
            deadline = if (newTask.dueDate != oldTask.dueDate) newTask.dueDate else null,
            priority = newTask.priority.apiValue.takeIf { newTask.priority != oldTask.priority },
            tags = newTask.tags.takeIf { it != oldTask.tags },
            categories = newTask.categories.takeIf { it != oldTask.categories },
            checklist = newTask.checklist.takeIf { it != oldTask.checklist }
        )
        val service = api(baseUrl, apiToken)
        val updatedDto = service.patchCard(cardId = cardId, request = patch)
        val changes = buildCardChanges(oldTask, newTask)
        runCatching {
            service.notifyCardUpdated(
                cardId = cardId,
                request = NotifyCardUpdatedRequest(version = updatedDto.version, changes = changes)
            )
        }
        return dtoToTask(updatedDto)
    }

    suspend fun updateCardChecklist(
        baseUrl: String,
        apiToken: String,
        cardId: Int,
        oldChecklist: List<ChecklistItemDto>,
        newChecklist: List<ChecklistItemDto>
    ): KanbanTask {
        val service = api(baseUrl, apiToken)
        val updatedDto = service.patchCard(cardId = cardId, request = PatchCardRequest(checklist = newChecklist))
        val changes = buildChecklistChanges(oldChecklist, newChecklist)
        runCatching {
            service.notifyCardUpdated(cardId = cardId, request = NotifyCardUpdatedRequest(version = updatedDto.version, changes = changes))
        }
        return dtoToTask(updatedDto)
    }

    private fun dtoToTask(dto: CardDto) = KanbanTask(
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
        updatedAt = dto.updatedAt,
        version = dto.version
    )

    private fun buildCardChanges(old: KanbanTask, new: KanbanTask): List<String> {
        val changes = mutableListOf<String>()
        if (old.title != new.title) changes.add("Название: «${new.title}»")
        if (old.description != new.description) changes.add("Описание обновлено")
        if (old.priority != new.priority) changes.add("Приоритет: ${new.priority.emoji} ${new.priority.label}")
        if (old.dueDate != new.dueDate) changes.add(if (new.dueDate != null) "Срок: ${new.dueDate}" else "Срок удалён")
        if (old.assignee != new.assignee) changes.add("Ответственный изменён")
        if (old.tags != new.tags) {
            val added = new.tags - old.tags.toSet()
            val removed = old.tags - new.tags.toSet()
            if (added.isNotEmpty()) changes.add("Теги добавлены: ${added.joinToString()}")
            if (removed.isNotEmpty()) changes.add("Теги удалены: ${removed.joinToString()}")
        }
        if (old.categories != new.categories) {
            val added = new.categories - old.categories.toSet()
            val removed = old.categories - new.categories.toSet()
            if (added.isNotEmpty()) changes.add("Категории добавлены: ${added.joinToString()}")
            if (removed.isNotEmpty()) changes.add("Категории удалены: ${removed.joinToString()}")
        }
        changes.addAll(buildChecklistChanges(old.checklist, new.checklist))
        return changes
    }

    private fun buildChecklistChanges(old: List<ChecklistItemDto>, new: List<ChecklistItemDto>): List<String> {
        val changes = mutableListOf<String>()
        val oldMap = old.associateBy { it.id }
        val newMap = new.associateBy { it.id }
        for (item in new) {
            val prev = oldMap[item.id]
            if (prev == null) changes.add("Чек-лист добавлено: «${item.text}»")
            else if (prev.done != item.done) {
                val status = if (item.done) "выполнен" else "снята отметка"
                changes.add("Пункт «${item.text}» — $status")
            }
        }
        for (item in old) {
            if (!newMap.containsKey(item.id)) changes.add("Чек-лист удалено: «${item.text}»")
        }
        return changes
    }

    suspend fun updateNotificationProfile(baseUrl: String, apiToken: String, oneSignalPlayerId: String) {
        val body = api(baseUrl, apiToken).updateNotificationProfile(
            request = NotificationProfileRequest(onesignalPlayerId = oneSignalPlayerId)
        ).string()
        Log.d(PUSH_DEBUG_TAG, "PATCH /notifications/profile -> $body")
    }

    suspend fun ensurePushNotificationPreferences(baseUrl: String, apiToken: String, eventTypes: List<String>) {
        val service = api(baseUrl, apiToken)
        val preferences = service.listNotificationPreferences()
        Log.d(PUSH_DEBUG_TAG, "GET /notification-preferences -> count=${preferences.size} items=$preferences")

        val grouped = preferences.groupBy { it.eventType }

        for (eventType in eventTypes) {
            val eventPrefs = grouped[eventType].orEmpty()
            val hasGlobalPush = eventPrefs.any { it.board == null && it.channel == "push" }
            val hasGlobalTelegram = eventPrefs.any { it.board == null && it.channel == "telegram" }

            if (!hasGlobalPush) {
                val r = service.createNotificationPreference(
                    NotificationPreferenceRequest(board = null, channel = "push", eventType = eventType, enabled = true)
                ).string()
                Log.d(PUSH_DEBUG_TAG, "POST /notification-preferences push event=$eventType -> $r")
            }
            if (!hasGlobalTelegram) {
                val r = service.createNotificationPreference(
                    NotificationPreferenceRequest(board = null, channel = "telegram", eventType = eventType, enabled = false)
                ).string()
                Log.d(PUSH_DEBUG_TAG, "POST /notification-preferences telegram event=$eventType -> $r")
            }

            for (pref in eventPrefs) {
                if (pref.channel == "push" && !pref.enabled) {
                    val r = service.updateNotificationPreference(pref.id, NotificationPreferencePatch(enabled = true)).string()
                    Log.d(PUSH_DEBUG_TAG, "PATCH /notification-preferences/${pref.id} push->true event=$eventType -> $r")
                }
                if (pref.channel == "telegram" && pref.enabled) {
                    val r = service.updateNotificationPreference(pref.id, NotificationPreferencePatch(enabled = false)).string()
                    Log.d(PUSH_DEBUG_TAG, "PATCH /notification-preferences/${pref.id} telegram->false event=$eventType -> $r")
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

// ─────────────────────────────────────────────────────────────────────────────
// API Interface
// ─────────────────────────────────────────────────────────────────────────────

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

    @PATCH("cards/{cardId}/")
    suspend fun patchCard(@Path("cardId") cardId: Int, @Body request: PatchCardRequest): CardDto

    @POST("cards/{cardId}/notify-updated/")
    suspend fun notifyCardUpdated(@Path("cardId") cardId: Int, @Body request: NotifyCardUpdatedRequest): ResponseBody

    @POST("cards/{cardId}/move/")
    suspend fun moveCard(@Path("cardId") cardId: Int, @Body request: MoveCardRequest): ResponseBody

    @PATCH("notifications/profile/")
    suspend fun updateNotificationProfile(@Body request: NotificationProfileRequest): ResponseBody

    @GET("users/")
    suspend fun listUsers(): List<UserDto>

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

// ─────────────────────────────────────────────────────────────────────────────
// DTOs & Models
// ─────────────────────────────────────────────────────────────────────────────

@Serializable
private data class LoginRequest(val username: String, val password: String)

@Serializable
private data class LoginResponse(val token: String = "")

@Serializable
private data class BoardDto(val id: Int, val name: String)

@Serializable
private data class ColumnDto(val id: Int, val board: Int, val name: String, val icon: String? = null)

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
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
    val version: Int = 1
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
private data class MoveCardRequest(@SerialName("to_column") val toColumn: Int)

@Serializable
private data class PatchCardRequest(
    val title: String? = null,
    val description: String? = null,
    val assignee: Int? = null,
    val deadline: String? = null,
    val priority: String? = null,
    val tags: List<String>? = null,
    val categories: List<String>? = null,
    val checklist: List<ChecklistItemDto>? = null
)

@Serializable
private data class NotifyCardUpdatedRequest(
    val version: Int,
    val changes: List<String> = emptyList()
)

@Serializable
private data class UserDto(
    val id: Int,
    val username: String,
    @SerialName("full_name") val fullName: String = ""
)

data class BoardUser(val id: Int, val name: String)

@Serializable
private data class NotificationProfileRequest(@SerialName("onesignal_player_id") val onesignalPlayerId: String)

@Serializable
private data class NotificationPreferenceDto(
    val id: Int,
    val board: Int? = null,
    val channel: String,
    @SerialName("event_type") val eventType: String,
    val enabled: Boolean
)

@Serializable
private data class NotificationPreferenceRequest(
    val board: Int? = null,
    val channel: String,
    @SerialName("event_type") val eventType: String,
    val enabled: Boolean
)

@Serializable
private data class NotificationPreferencePatch(val enabled: Boolean)

@Serializable
data class AttachmentDto(val id: String, val name: String, val url: String, val size: Long? = null)

@Serializable
data class ChecklistItemDto(val id: String, val text: String, val done: Boolean)

data class KanbanBoard(val id: Int, val title: String, val columns: List<KanbanColumn>)

data class KanbanColumn(val id: Int, val boardId: Int, val title: String, val icon: String, val tasks: List<KanbanTask>)

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
    val updatedAt: String? = null,
    val version: Int = 1
)

enum class TaskPriority(val apiValue: String, val label: String, val emoji: String) {
    Low("🟢", "Можно когда будет время", "🟢"),
    Medium("🟡", "Важно (до конца недели)", "🟡"),
    High("🔥", "Срочно", "🔥");

    companion object {
        fun fromApiValue(value: String?): TaskPriority = when (value) {
            "🟢" -> Low
            "🔥" -> High
            else -> Medium
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

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

private fun readSavedDomain(context: Context): String =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(KEY_DOMAIN, "") ?: ""

private fun saveDomain(context: Context, domain: String) {
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .edit().putString(KEY_DOMAIN, normalizeBaseUrl(domain)).apply()
}

private fun readSavedToken(context: Context): String =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(KEY_TOKEN, "") ?: ""

private fun saveToken(context: Context, token: String) {
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .edit().putString(KEY_TOKEN, token).apply()
}

private fun clearToken(context: Context) {
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit().remove(KEY_TOKEN).apply()
}

private fun currentOneSignalPlayerId(): String {
    return try {
        OneSignal.User.pushSubscription.id ?: ""
    } catch (_: Throwable) {
        ""
    }
}

private const val PUSH_DEBUG_TAG = "TM_PUSH_DEBUG"

// ─────────────────────────────────────────────────────────────────────────────
// PIN & Biometric storage helpers
// ─────────────────────────────────────────────────────────────────────────────

private const val SECURE_PREFS_NAME = "task_manager_secure_prefs"
private const val KEY_PIN_HASH = "pin_hash"
private const val KEY_BIOMETRIC_ENABLED = "biometric_enabled"

private fun securePrefs(context: Context): SharedPreferences {
    val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()
    return EncryptedSharedPreferences.create(
        context,
        SECURE_PREFS_NAME,
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )
}

private fun hashPin(pin: String): String {
    val digest = java.security.MessageDigest.getInstance("SHA-256")
    return digest.digest(pin.toByteArray())
        .joinToString("") { "%02x".format(it) }
}

private fun savePin(context: Context, pin: String) {
    securePrefs(context).edit().putString(KEY_PIN_HASH, hashPin(pin)).apply()
}

private fun verifyPin(context: Context, pin: String): Boolean {
    val stored = securePrefs(context).getString(KEY_PIN_HASH, null) ?: return false
    return stored == hashPin(pin)
}

private fun clearPin(context: Context) {
    securePrefs(context).edit()
        .remove(KEY_PIN_HASH)
        .remove(KEY_BIOMETRIC_ENABLED)
        .apply()
}

private fun isPinEnabled(context: Context): Boolean =
    securePrefs(context).contains(KEY_PIN_HASH)

private fun isBiometricEnabled(context: Context): Boolean =
    securePrefs(context).getBoolean(KEY_BIOMETRIC_ENABLED, false)

private fun setBiometricEnabled(context: Context, enabled: Boolean) {
    securePrefs(context).edit().putBoolean(KEY_BIOMETRIC_ENABLED, enabled).apply()
}
