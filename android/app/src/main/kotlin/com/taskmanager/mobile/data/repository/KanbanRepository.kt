package com.taskmanager.mobile.data.repository

import android.util.Log
import kotlinx.serialization.json.Json
import retrofit2.HttpException
import com.taskmanager.mobile.data.api.ApiClient
import com.taskmanager.mobile.data.api.KanbanApi
import com.taskmanager.mobile.data.api.dto.CardDto
import com.taskmanager.mobile.data.api.dto.ChecklistItemDto
import com.taskmanager.mobile.data.api.dto.CommentDto
import com.taskmanager.mobile.data.api.dto.CreateCommentRequest
import com.taskmanager.mobile.data.api.dto.CreateCardRequest
import com.taskmanager.mobile.data.api.dto.LoginRequest
import com.taskmanager.mobile.data.api.dto.MoveCardRequest
import com.taskmanager.mobile.data.api.dto.NotificationPreferencePatch
import com.taskmanager.mobile.data.api.dto.NotificationPreferenceRequest
import com.taskmanager.mobile.data.api.dto.NotificationProfileDto
import com.taskmanager.mobile.data.api.dto.NotificationProfileRequest
import com.taskmanager.mobile.data.api.dto.NotifyCardUpdatedRequest
import com.taskmanager.mobile.data.api.dto.PatchCardRequest
import com.taskmanager.mobile.data.model.BoardUser
import com.taskmanager.mobile.data.model.KanbanBoard
import com.taskmanager.mobile.data.model.KanbanColumn
import com.taskmanager.mobile.data.model.KanbanTask
import com.taskmanager.mobile.data.model.TaskPriority
import com.taskmanager.mobile.util.PUSH_DEBUG_TAG
import com.taskmanager.mobile.util.asPosition
import com.taskmanager.mobile.util.sortTasksNewestFirst

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

    suspend fun getComments(baseUrl: String, apiToken: String, cardId: Int): List<CommentDto> =
        api(baseUrl, apiToken).getComments(cardId)

    suspend fun postComment(baseUrl: String, apiToken: String, cardId: Int, text: String): CommentDto =
        api(baseUrl, apiToken).postComment(cardId, CreateCommentRequest(text = text.trim()))

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

    suspend fun fetchTodayCards(baseUrl: String, apiToken: String): TodayCardsResult {
        val response = api(baseUrl, apiToken).getTodayCards()
        return TodayCardsResult(
            overdue = response["overdue"].orEmpty().map(::dtoToTask),
            today = response["today"].orEmpty().map(::dtoToTask),
            important = response["important"].orEmpty().map(::dtoToTask)
        )
    }

    suspend fun searchCards(baseUrl: String, apiToken: String, query: String): List<KanbanTask> {
        return api(baseUrl, apiToken).search(query).cards.map(::dtoToTask)
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
        boardId = dto.board,
        boardName = dto.boardName,
        columnName = dto.columnName,
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

data class TodayCardsResult(
    val overdue: List<KanbanTask> = emptyList(),
    val today: List<KanbanTask> = emptyList(),
    val important: List<KanbanTask> = emptyList()
)
