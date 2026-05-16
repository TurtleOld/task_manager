package com.taskmanager.mobile.ui.components

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

fun priorityColor(priority: TaskPriority): Color = when (priority) {
    TaskPriority.Low -> Color(0xFF10B981)
    TaskPriority.Medium -> Color(0xFFF59E0B)
    TaskPriority.High -> Color(0xFFEF4444)
}

fun priorityLabel(priority: TaskPriority): String = priority.label

fun resolveZoneId(timeZone: String?): ZoneId = try {
    ZoneId.of(timeZone?.ifBlank { DEFAULT_TIME_ZONE } ?: DEFAULT_TIME_ZONE)
} catch (_: Exception) {
    ZoneId.of(DEFAULT_TIME_ZONE)
}

fun normalizeTimeZoneId(timeZone: String?): String = resolveZoneId(timeZone).id

// Parse ISO-8601 date string like "2026-02-19T06:00:13.247183Z"
// Returns "19 фев 2026" for dates, "19 фев 2026, 06:00" for datetimes
fun formatReadableDateTime(date: String?, timeZone: String = DEFAULT_TIME_ZONE): String {
    if (date.isNullOrBlank()) return ""
    return try {
        val parsed = parseDeadlineInstant(date, timeZone) ?: return date.take(16)
        val calendar = Calendar.getInstance(java.util.TimeZone.getTimeZone(resolveZoneId(timeZone))).apply {
            timeInMillis = parsed.toEpochMilli()
        }
        val dateText = "${calendar.get(Calendar.DAY_OF_MONTH)} ${monthName(calendar.get(Calendar.MONTH) + 1)} ${calendar.get(Calendar.YEAR)}"
        if (hasTimeComponent(date)) {
            val hour = calendar.get(Calendar.HOUR_OF_DAY).toString().padStart(2, '0')
            val minute = calendar.get(Calendar.MINUTE).toString().padStart(2, '0')
            "$dateText, $hour:$minute"
        } else {
            dateText
        }
    } catch (_: Exception) {
        date.take(16)
    }
}

fun formatShortDate(date: String?, timeZone: String = DEFAULT_TIME_ZONE): String {
    if (date.isNullOrBlank()) return ""
    return try {
        val parsed = parseDeadlineInstant(date, timeZone) ?: return date.take(10)
        val calendar = Calendar.getInstance(java.util.TimeZone.getTimeZone(resolveZoneId(timeZone))).apply {
            timeInMillis = parsed.toEpochMilli()
        }
        val day = calendar.get(Calendar.DAY_OF_MONTH).toString().padStart(2, '0')
        val month = (calendar.get(Calendar.MONTH) + 1).toString().padStart(2, '0')
        val year = calendar.get(Calendar.YEAR).toString().takeLast(2)
        "$day.$month.$year"
    } catch (_: Exception) {
        date.take(10)
    }
}

val deadlineStorageFormatter: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss")
val deadlineDateFormatter: DateTimeFormatter = DateTimeFormatter.ISO_LOCAL_DATE

fun monthName(month: Int): String = when (month) {
    1 -> "янв"; 2 -> "фев"; 3 -> "мар"; 4 -> "апр"
    5 -> "май"; 6 -> "июн"; 7 -> "июл"; 8 -> "авг"
    9 -> "сен"; 10 -> "окт"; 11 -> "ноя"; 12 -> "дек"
    else -> month.toString()
}

fun parseDeadlineInstant(value: String, timeZone: String = DEFAULT_TIME_ZONE): Instant? {
    val zoneId = resolveZoneId(timeZone)
    return try {
        when {
            value.contains('T') && (value.endsWith("Z") || value.substringAfter('T').contains('+')) -> OffsetDateTime.parse(value).toInstant()
            value.contains('T') -> LocalDateTime.parse(value).atZone(zoneId).toInstant()
            else -> LocalDate.parse(value, deadlineDateFormatter).atStartOfDay(zoneId).toInstant()
        }
    } catch (_: DateTimeParseException) {
        null
    }
}

fun hasTimeComponent(value: String?): Boolean {
    if (value.isNullOrBlank()) return false
    return value.contains('T')
}

fun normalizeDeadlineForInput(value: String?, timeZone: String = DEFAULT_TIME_ZONE): String? {
    val trimmed = value?.trim().orEmpty()
    if (trimmed.isBlank()) return null
    val parsed = parseDeadlineInstant(trimmed, timeZone) ?: return null
    return parsed.atZone(resolveZoneId(timeZone)).toLocalDateTime().format(deadlineStorageFormatter)
}

fun normalizeDeadlineForSave(value: String?, timeZone: String = DEFAULT_TIME_ZONE): String? {
    val trimmed = value?.trim().orEmpty()
    if (trimmed.isBlank()) return null
    val parsed = parseDeadlineInstant(trimmed, timeZone) ?: return null
    return parsed.atZone(ZoneOffset.UTC).toLocalDateTime().format(deadlineStorageFormatter)
}

data class DeadlineDraftState(
    val value: String?
)

fun deadlineDraftStateOf(value: String?, timeZone: String = DEFAULT_TIME_ZONE): DeadlineDraftState {
    val normalized = normalizeDeadlineForInput(value, timeZone)
    return DeadlineDraftState(normalized)
}

fun deadlineDisplayText(value: String?, timeZone: String = DEFAULT_TIME_ZONE): String = when {
    value.isNullOrBlank() -> "Выберите дату и время"
    else -> formatReadableDateTime(value, timeZone)
}

fun calendarFromDeadline(value: String?, timeZone: String = DEFAULT_TIME_ZONE): Calendar {
    val parsed = value?.let { parseDeadlineInstant(it, timeZone) }
    return Calendar.getInstance(java.util.TimeZone.getTimeZone(resolveZoneId(timeZone))).apply {
        if (parsed != null) {
            timeInMillis = parsed.toEpochMilli()
        }
    }
}

fun formatFileSize(bytes: Long): String {
    return when {
        bytes < 1024 -> "$bytes B"
        bytes < 1024 * 1024 -> "${bytes / 1024} KB"
        else -> "${bytes / (1024 * 1024)} MB"
    }
}
