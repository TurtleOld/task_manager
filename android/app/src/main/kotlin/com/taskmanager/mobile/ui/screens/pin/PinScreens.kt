package com.taskmanager.mobile.ui.screens.pin

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
fun PinUnlockScreen(
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
fun PinKey(
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

// ─────────────────────────────────────────────────────────────────────────────
// PIN Setup Dialog
// ─────────────────────────────────────────────────────────────────────────────

@Composable
fun PinSetupDialog(
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
