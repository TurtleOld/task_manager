package com.taskmanager.mobile.ui.components

import androidx.compose.ui.graphics.Color
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.Calendar
import com.taskmanager.mobile.data.model.TaskPriority
import com.taskmanager.mobile.util.DEFAULT_TIME_ZONE

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

fun formatTaskCount(count: Int): String {
    val mod100 = count % 100
    val mod10 = count % 10
    val suffix = when {
        mod100 in 11..14 -> "задач"
        mod10 == 1 -> "задача"
        mod10 in 2..4 -> "задачи"
        else -> "задач"
    }
    return "$count $suffix"
}
