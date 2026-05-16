package com.taskmanager.mobile.data.api.dto

import androidx.compose.foundation.layout.size
import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import com.taskmanager.mobile.data.model.TaskPriority
import com.taskmanager.mobile.util.DEFAULT_TIME_ZONE

@Serializable
data class LoginRequest(val username: String, val password: String)

@Serializable
data class LoginResponse(val token: String = "")

@Serializable
data class BoardDto(val id: Int, val name: String)

@Serializable
data class ColumnDto(val id: Int, val board: Int, val name: String, val icon: String? = null)

@Serializable
data class CardDto(
    val id: Int,
    val column: Int,
    val title: String? = null,
    val description: String? = null,
    val deadline: String? = null,
    val priority: JsonElement? = null,
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
data class MoveCardRequest(@SerialName("to_column") val toColumn: Int)

@Serializable
data class PatchCardRequest(
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
data class NotifyCardUpdatedRequest(
    val version: Int,
    val changes: List<String> = emptyList()
)

@Serializable
data class UserDto(
    val id: Int,
    val username: String,
    @SerialName("full_name") val fullName: String = ""
)

@Serializable
data class NotificationProfileRequest(
    val timezone: String? = null,
    @SerialName("fcm_token") val fcmToken: String? = null
)

@Serializable
data class NotificationProfileDto(
    val email: String = "",
    @SerialName("telegram_chat_id") val telegramChatId: String = "",
    @SerialName("fcm_token") val fcmToken: String = "",
    val timezone: String = DEFAULT_TIME_ZONE,
    @SerialName("timezone_configured") val timezoneConfigured: Boolean = false
)

@Serializable
data class NotificationPreferenceDto(
    val id: Int,
    val board: Int? = null,
    val channel: String,
    @SerialName("event_type") val eventType: String,
    val enabled: Boolean
)

@Serializable
data class NotificationPreferenceRequest(
    val board: Int? = null,
    val channel: String,
    @SerialName("event_type") val eventType: String,
    val enabled: Boolean
)

@Serializable
data class NotificationPreferencePatch(val enabled: Boolean)

@Serializable
data class AttachmentDto(@Serializable(with = FlexibleStringSerializer::class) val id: String, val name: String, val url: String, val size: Long? = null)

@Serializable
data class ChecklistItemDto(@Serializable(with = FlexibleStringSerializer::class) val id: String, val text: String, val done: Boolean)

object FlexibleStringSerializer : KSerializer<String> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("FlexibleString", PrimitiveKind.STRING)

    override fun deserialize(decoder: Decoder): String {
        val jsonDecoder = decoder as? JsonDecoder ?: return decoder.decodeString()
        val element = jsonDecoder.decodeJsonElement()
        return when (element) {
            is JsonPrimitive -> element.content
            else -> element.toString()
        }
    }

    override fun serialize(encoder: Encoder, value: String) {
        encoder.encodeString(value)
    }
}
