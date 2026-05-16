package com.taskmanager.mobile.data.repository

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

class KanbanRepository {
    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        coerceInputValues = true
    }

    suspend fun login(baseUrl: String, username: String, password: String): String {
        val token = try {
            api(baseUrl = baseUrl, apiToken = "")
                .login(LoginRequest(username = username, password = password))
                .token
        } catch (error: HttpException) {
            if (error.code() == 401) {
                throw IllegalStateException("Неверный логин или пароль")
            }
            throw error
        }
        if (token.isBlank()) error("Токен не получен")
        return token
    }

    suspend fun terminateSessions(baseUrl: String, apiToken: String) {
        api(baseUrl, apiToken).terminateSessions()
    }

    suspend fun fetchBoards(baseUrl: String, apiToken: String): List<KanbanBoard> {
        val service = api(baseUrl, apiToken)
        val boards = service.getBoards()
        val columns = service.getColumns()
        val cards = service.getCards()

        val tasksByColumn = cards.groupBy { it.column }.mapValues { (_, items) ->
            sortTasksNewestFirst(items.map { dtoToTask(it) })
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

    suspend fun createCard(baseUrl: String, apiToken: String, request: CreateCardRequest): KanbanTask {
        val dto = api(baseUrl, apiToken).createCard(request)
        require(dto.id > 0) { "Сервер не вернул корректный id созданной задачи" }
        return dtoToTask(dto)
    }

    suspend fun moveCard(baseUrl: String, apiToken: String, cardId: Int, toColumnId: Int) {
        api(baseUrl, apiToken).moveCard(cardId = cardId, request = MoveCardRequest(toColumn = toColumnId))
    }

    suspend fun deleteCard(baseUrl: String, apiToken: String, cardId: Int) {
        api(baseUrl, apiToken).deleteCard(cardId)
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
        runCatching<Unit> {
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
        runCatching<Unit> {
            service.notifyCardUpdated(cardId = cardId, request = NotifyCardUpdatedRequest(version = updatedDto.version, changes = changes))
        }
        return dtoToTask(updatedDto)
    }

    fun taskFromJsonElement(element: kotlinx.serialization.json.JsonElement): KanbanTask =
        dtoToTask(json.decodeFromJsonElement(CardDto.serializer(), element))

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

    suspend fun updateNotificationProfile(
        baseUrl: String,
        apiToken: String,
        timeZone: String? = null
    ): NotificationProfileDto {
        val body = api(baseUrl, apiToken).updateNotificationProfile(
            request = NotificationProfileRequest(timezone = timeZone)
        )
        Log.d(PUSH_DEBUG_TAG, "PATCH /notifications/profile -> $body")
        return body
    }

    suspend fun getNotificationProfile(baseUrl: String, apiToken: String): NotificationProfileDto {
        return api(baseUrl, apiToken).getNotificationProfile()
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

    private fun api(baseUrl: String, apiToken: String): KanbanApi =
        ApiClient.kanbanApi(baseUrl = baseUrl, apiToken = apiToken, json = json)
}
