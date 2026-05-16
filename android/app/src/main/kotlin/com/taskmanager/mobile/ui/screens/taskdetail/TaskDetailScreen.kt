package com.taskmanager.mobile.ui.screens.taskdetail

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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TaskDetailScreen(
    taskId: Int,
    taskDetailState: TaskDetailState?,
    timeZone: String,
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
                    timeZone = timeZone,
                    onBack = onBack,
                    onSaveCard = onSaveCard
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun TaskDetailContent(
    task: KanbanTask,
    users: List<BoardUser>,
    timeZone: String,
    onBack: () -> Unit,
    onSaveCard: (draft: KanbanTask, onSuccess: () -> Unit, onError: (String) -> Unit) -> Unit
) {
    val context = LocalContext.current
    // Editable local draft state — reset when task changes from server
    var draftTitle by remember(task.id) { mutableStateOf(task.title) }
    var draftDescription by remember(task.id) { mutableStateOf(task.description) }
    var draftPriority by remember(task.id) { mutableStateOf(task.priority) }
    var draftDeadline by remember(task.id, timeZone) { mutableStateOf(normalizeDeadlineForInput(task.dueDate, timeZone).orEmpty()) }
    var draftAssignee by remember(task.id) { mutableStateOf(task.assignee) }
    var draftTags by remember(task.id) { mutableStateOf(task.tags) }
    var draftCategories by remember(task.id) { mutableStateOf(task.categories) }
    var draftChecklist by remember(task.id) { mutableStateOf(task.checklist) }

    val hasChanges = draftTitle != task.title ||
        draftDescription != task.description ||
        draftPriority != task.priority ||
        normalizeDeadlineForSave(draftDeadline, timeZone) != normalizeDeadlineForSave(task.dueDate, timeZone) ||
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
                    val currentDeadlineState = deadlineDraftStateOf(draftDeadline, timeZone)

                    fun openTimePicker(baseDate: Calendar) {
                        TimePickerDialog(
                            context,
                            { _, hour, minute ->
                                baseDate.set(Calendar.HOUR_OF_DAY, hour)
                                baseDate.set(Calendar.MINUTE, minute)
                                baseDate.set(Calendar.SECOND, 0)
                                baseDate.set(Calendar.MILLISECOND, 0)
                                val next = LocalDateTime.of(
                                    baseDate.get(Calendar.YEAR),
                                    baseDate.get(Calendar.MONTH) + 1,
                                    baseDate.get(Calendar.DAY_OF_MONTH),
                                    hour,
                                    minute,
                                    0
                                )
                                draftDeadline = next.format(deadlineStorageFormatter)
                                saveError = null
                            },
                            baseDate.get(Calendar.HOUR_OF_DAY),
                            baseDate.get(Calendar.MINUTE),
                            true
                        ).show()
                    }

                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(16.dp))
                                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
                                .clickable {
                                    val baseDate = calendarFromDeadline(currentDeadlineState.value, timeZone)
                                    DatePickerDialog(
                                        context,
                                        { _, year, month, dayOfMonth ->
                                            baseDate.set(Calendar.YEAR, year)
                                            baseDate.set(Calendar.MONTH, month)
                                            baseDate.set(Calendar.DAY_OF_MONTH, dayOfMonth)
                                            openTimePicker(baseDate)
                                        },
                                        baseDate.get(Calendar.YEAR),
                                        baseDate.get(Calendar.MONTH),
                                        baseDate.get(Calendar.DAY_OF_MONTH)
                                    ).show()
                                }
                                .padding(horizontal = 14.dp, vertical = 14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Text("📅", fontSize = 16.sp)
                            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(
                                    text = deadlineDisplayText(currentDeadlineState.value, timeZone),
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = if (currentDeadlineState.value.isNullOrBlank()) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface
                                )
                                Text(
                                    text = if (currentDeadlineState.value.isNullOrBlank()) "Откроется системный выбор даты и времени" else "Дата и время выбираются по очереди",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            if (!currentDeadlineState.value.isNullOrBlank()) {
                                TextButton(onClick = { draftDeadline = ""; saveError = null }) {
                                    Text("Очистить")
                                }
                            }
                        }

                        if (!currentDeadlineState.value.isNullOrBlank()) {
                            TextButton(
                                onClick = {
                                    val baseDate = calendarFromDeadline(currentDeadlineState.value, timeZone)
                                    openTimePicker(baseDate)
                                },
                                contentPadding = PaddingValues(0.dp)
                            ) {
                                Text("Изменить только время")
                            }
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
                            MetaRow(label = "Создано", value = formatReadableDateTime(task.createdAt, timeZone))
                        }
                        if (!task.updatedAt.isNullOrBlank()) {
                            MetaRow(label = "Обновлено", value = formatReadableDateTime(task.updatedAt, timeZone))
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
                            draftDeadline = normalizeDeadlineForInput(task.dueDate, timeZone).orEmpty()
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
                                dueDate = normalizeDeadlineForSave(draftDeadline, timeZone),
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
