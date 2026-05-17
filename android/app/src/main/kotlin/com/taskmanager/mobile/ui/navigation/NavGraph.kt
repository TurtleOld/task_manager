package com.taskmanager.mobile.ui.navigation

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.taskmanager.mobile.BuildConfig
import com.taskmanager.mobile.security.clearPin
import com.taskmanager.mobile.security.isPinEnabled
import com.taskmanager.mobile.ui.screens.board.BoardRoute
import com.taskmanager.mobile.ui.screens.login.LoginScreen
import com.taskmanager.mobile.ui.screens.pin.PinUnlockScreen
import com.taskmanager.mobile.ui.screens.settings.SettingsScreen
import com.taskmanager.mobile.ui.screens.taskdetail.TaskDetailScreen
import com.taskmanager.mobile.ui.theme.TaskManagerTheme
import com.taskmanager.mobile.ui.viewmodel.KanbanViewModel
import com.taskmanager.mobile.util.clearToken
import com.taskmanager.mobile.util.readSavedDomain
import com.taskmanager.mobile.util.readSavedTimeZone
import com.taskmanager.mobile.util.readSavedToken
import com.taskmanager.mobile.util.saveDomain
import com.taskmanager.mobile.util.saveTimeZone
import com.taskmanager.mobile.util.saveToken
import kotlinx.coroutines.launch

@Composable
fun AppRoot(vm: KanbanViewModel = viewModel()) {
    val context = LocalContext.current
    val session by vm.session.collectAsStateWithLifecycle()
    val boardState by vm.boardState.collectAsStateWithLifecycle()
    val taskDetailState by vm.taskDetailState.collectAsStateWithLifecycle()
    val boardUsers by vm.boardUsers.collectAsStateWithLifecycle()
    val securitySettings by vm.securitySettings.collectAsStateWithLifecycle()
    val timeZone = session.timeZone
    val navController = rememberNavController()
    val notificationPermissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }

    LaunchedEffect(Unit) {
        vm.bootstrap(
            domain = readSavedDomain(context).ifBlank { BuildConfig.API_BASE_URL },
            token = readSavedToken(context),
            timeZone = readSavedTimeZone(context)
        )
        vm.loadSecuritySettings(context)
    }

    LaunchedEffect(session.isAuthenticated) {
        if (session.isAuthenticated && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }

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
        vm.registerFcmPush(context)
    }

    LaunchedEffect(session.isAuthenticated, session.timeZone) {
        if (!session.isAuthenticated) return@LaunchedEffect
        saveTimeZone(context, session.timeZone)
    }

    TaskManagerTheme(themeMode = session.themeMode) {
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
                    vm.logout(context)
                    vm.loadSecuritySettings(context)
                }
            )
        }

        composable(Route.Board) {
            BoardRoute(
                boardState = boardState,
                boardUsers = boardUsers,
                timeZone = timeZone,
                onRetry = vm::refresh,
                onRefresh = vm::refresh,
                onLogout = {
                    clearToken(context)
                    vm.logout(context)
                },
                onSelectBoard = vm::selectBoard,
                onAddTask = { title, columnId -> vm.createTask(title, columnId) },
                onMoveTask = vm::moveTask,
                onDeleteTask = vm::archiveTask,
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
                onThemeModeChange = vm::onThemeModeChanged,
                onLogout = {
                    clearToken(context)
                    vm.logout(context)
                },
                onTerminateSessions = {
                    clearToken(context)
                    vm.terminateSessions(context)
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
                timeZone = timeZone,
                onLoadTask = vm::loadTaskDetail,
                onBack = { navController.popBackStack() },
                onClearDetail = vm::clearTaskDetail,
                onSaveCard = { draft, onSuccess, onError ->
                    vm.saveCard(taskId, draft, onSuccess, onError)
                },
                onPostComment = { text, onSuccess, onError ->
                    vm.postComment(taskId, text, onSuccess, onError)
                }
            )
        }
    }
    }
}

object Route {
    const val Login = "login"
    const val PinUnlock = "pin_unlock"
    const val Board = "board"
    const val TaskDetail = "task_detail"
    const val Settings = "settings"

    fun taskDetail(taskId: Int) = "$TaskDetail/$taskId"
}
