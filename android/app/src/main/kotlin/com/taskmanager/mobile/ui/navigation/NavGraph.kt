package com.taskmanager.mobile.ui.navigation

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
                onDeleteTask = vm::deleteTask,
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
                }
            )
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
