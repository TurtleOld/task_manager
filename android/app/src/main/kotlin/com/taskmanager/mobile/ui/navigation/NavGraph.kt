package com.taskmanager.mobile.ui.navigation

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
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
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.taskmanager.mobile.BuildConfig
import com.taskmanager.mobile.security.clearToken
import com.taskmanager.mobile.security.clearPin
import com.taskmanager.mobile.security.isPinEnabled
import com.taskmanager.mobile.security.readSavedSecureTimeZone
import com.taskmanager.mobile.security.readSavedToken
import com.taskmanager.mobile.security.saveSecureTimeZone
import com.taskmanager.mobile.security.saveToken
import com.taskmanager.mobile.ui.screens.board.BoardRoute
import com.taskmanager.mobile.ui.screens.login.LoginScreen
import com.taskmanager.mobile.ui.screens.pin.PinUnlockScreen
import com.taskmanager.mobile.ui.screens.search.SearchScreen
import com.taskmanager.mobile.ui.screens.settings.SettingsScreen
import com.taskmanager.mobile.ui.screens.taskdetail.TaskDetailScreen
import com.taskmanager.mobile.ui.screens.today.TodayScreen
import com.taskmanager.mobile.ui.theme.TaskManagerTheme
import com.taskmanager.mobile.ui.viewmodel.AuthEvent
import com.taskmanager.mobile.ui.viewmodel.KanbanViewModel
import com.taskmanager.mobile.util.readSavedDomain
import com.taskmanager.mobile.util.saveDomain

@Composable
fun AppRoot(vm: KanbanViewModel = viewModel()) {
    val context = LocalContext.current
    val session by vm.session.collectAsStateWithLifecycle()
    val boardState by vm.boardState.collectAsStateWithLifecycle()
    val taskDetailState by vm.taskDetailState.collectAsStateWithLifecycle()
    val boardUsers by vm.boardUsers.collectAsStateWithLifecycle()
    val securitySettings by vm.securitySettings.collectAsStateWithLifecycle()
    val todayState by vm.todayState.collectAsStateWithLifecycle()
    val searchState by vm.searchState.collectAsStateWithLifecycle()
    val boardFilterAssignee by vm.boardFilterAssignee.collectAsStateWithLifecycle()
    val timeZone = session.timeZone
    val navController = rememberNavController()
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route?.substringBefore('/')
    val notificationPermissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
    var searchQuery by rememberSaveable { mutableStateOf("") }

    LaunchedEffect(Unit) {
        vm.bootstrap(
            context = context,
            domain = readSavedDomain(context).ifBlank { BuildConfig.API_BASE_URL },
            token = readSavedToken(context),
            timeZone = readSavedSecureTimeZone(context)
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
        saveSecureTimeZone(context, session.timeZone)
    }

    LaunchedEffect(Unit) {
        vm.authEvents.collect { event ->
            when (event) {
                AuthEvent.Unauthorized -> {
                    clearToken(context)
                }
            }
        }
    }

    TaskManagerTheme(themeMode = session.themeMode) {
        Scaffold(
            bottomBar = {
                val showBottomBar = session.isAuthenticated && currentRoute in setOf(Route.Board, Route.Today, Route.Search, Route.Settings)
                if (showBottomBar) {
                    BottomNavBar(currentRoute = currentRoute) { route ->
                        navController.navigate(route) {
                            popUpTo(navController.graph.findStartDestination().id) {
                                saveState = true
                            }
                            launchSingleTop = true
                            restoreState = true
                        }
                    }
                }
            }
        ) { innerPadding ->
            NavHost(
                navController = navController,
                startDestination = Route.Login,
                modifier = Modifier.fillMaxSize().padding(innerPadding),
                enterTransition = { slideInHorizontally(initialOffsetX = { it }) + fadeIn() },
                exitTransition = { slideOutHorizontally(targetOffsetX = { -it / 3 }) + fadeOut() },
                popEnterTransition = { slideInHorizontally(initialOffsetX = { -it / 3 }) + fadeIn() },
                popExitTransition = { slideOutHorizontally(targetOffsetX = { it }) + fadeOut() }
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
                        onTaskClick = { taskId -> navController.navigate(Route.taskDetail(taskId)) },
                        onOpenSettings = { navController.navigate(Route.Settings) },
                        selectedAssigneeFilter = boardFilterAssignee,
                        onAssigneeFilterChange = vm::setBoardAssigneeFilter
                    )
                }

                composable(Route.Today) {
                    TodayScreen(
                        state = todayState,
                        timeZone = timeZone,
                        onRetry = vm::loadTodayCards,
                        onTaskClick = { taskId -> navController.navigate(Route.taskDetail(taskId)) }
                    )
                }

                composable(Route.Search) {
                    SearchScreen(
                        query = searchQuery,
                        state = searchState,
                        onQueryChange = {
                            searchQuery = it
                            vm.search(it)
                        },
                        onTaskClick = { taskId -> navController.navigate(Route.taskDetail(taskId)) }
                    )
                }

                composable(Route.Settings) {
                    SettingsScreen(
                        session = session,
                        securitySettings = securitySettings,
                        onBack = { navController.popBackStack() },
                        onEnablePin = { pin -> vm.enablePin(context, pin) },
                        onDisablePin = { vm.disablePin(context) },
                        onSetBiometric = { enabled -> vm.setBiometric(context, enabled) },
                        onThemeModeChange = { mode -> vm.onThemeModeChanged(context, mode) },
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
                ) { backStackEntryInner ->
                    val taskId = backStackEntryInner.arguments?.getInt("taskId") ?: return@composable
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
                        },
                        onUploadAttachments = { uris, onSuccess, onError ->
                            vm.uploadAttachments(context, taskId, uris, onSuccess, onError)
                        },
                        onDeleteAttachment = { attachmentId, onSuccess, onError ->
                            vm.deleteAttachment(taskId, attachmentId, onSuccess, onError)
                        },
                        onCreateAttachment = { name, type, url, onSuccess, onError ->
                            vm.createAttachment(taskId, name, type, url, onSuccess, onError)
                        }
                    )
                }
            }
        }
    }
}

object Route {
    const val Login = "login"
    const val PinUnlock = "pin_unlock"
    const val Board = "board"
    const val Today = "today"
    const val Search = "search"
    const val TaskDetail = "task_detail"
    const val Settings = "settings"

    fun taskDetail(taskId: Int) = "$TaskDetail/$taskId"
}
