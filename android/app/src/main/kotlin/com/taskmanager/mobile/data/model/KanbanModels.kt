package com.taskmanager.mobile.data.model

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import com.taskmanager.mobile.data.api.dto.AttachmentDto
import com.taskmanager.mobile.data.api.dto.ChecklistItemDto

data class BoardUser(val id: Int, val name: String)

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
    Low("1", "Можно когда будет время", "🟢"),
    Medium("2", "Важно (до конца недели)", "🟡"),
    High("3", "Срочно", "🔥");

    companion object {
        fun fromApiValue(value: JsonElement?): TaskPriority {
            val content = (value as? JsonPrimitive)?.content?.trim()
            return when (content) {
                "0", "1", "🟢" -> Low
                "3", "🔥" -> High
                "2", "🟡" -> Medium
                else -> Medium
            }
        }

        fun fromApiValue(value: String?): TaskPriority = when (value?.trim()) {
            "0", "1", "🟢" -> Low
            "3", "🔥" -> High
            "2", "🟡" -> Medium
            else -> Medium
        }
    }
}
