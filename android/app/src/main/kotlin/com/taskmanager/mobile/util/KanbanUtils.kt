package com.taskmanager.mobile.util

import android.content.Context
import java.time.Instant
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import com.taskmanager.mobile.data.model.KanbanTask
import com.taskmanager.mobile.ui.components.normalizeTimeZoneId

const val DEFAULT_TIME_ZONE = "UTC"

fun JsonElement?.asPosition(): Float {
    val primitive = this as? JsonPrimitive ?: return 0f
    return primitive.content.toFloatOrNull() ?: 0f
}

fun sortTasksNewestFirst(tasks: List<KanbanTask>): List<KanbanTask> =
    tasks.sortedWith(compareByDescending<KanbanTask> { it.createdAt.orEmpty() }.thenByDescending { it.id })

fun currentIsoTimestamp(): String {
    return Instant.now().toString()
}

fun normalizeBaseUrl(value: String): String {
    var base = value.trim().trimEnd('/')
    if (base.isBlank()) return ""
    if (!base.startsWith("http://") && !base.startsWith("https://")) {
        base = "https://$base"
    }
    if (base.endsWith("/api/v1")) {
        base = base.removeSuffix("/api/v1")
    } else if (base.endsWith("/api")) {
        base = base.removeSuffix("/api")
    }
    return base
}

const val PREFS_NAME = "task_manager_mobile_prefs"
const val KEY_DOMAIN = "domain"
const val KEY_TOKEN = "token"
const val KEY_TIME_ZONE = "time_zone"

fun readSavedDomain(context: Context): String =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(KEY_DOMAIN, "") ?: ""

fun saveDomain(context: Context, domain: String) {
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .edit().putString(KEY_DOMAIN, normalizeBaseUrl(domain)).apply()
}

fun readSavedToken(context: Context): String =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(KEY_TOKEN, "") ?: ""

fun saveToken(context: Context, token: String) {
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .edit().putString(KEY_TOKEN, token).apply()
}

fun readSavedTimeZone(context: Context): String =
    normalizeTimeZoneId(
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(KEY_TIME_ZONE, DEFAULT_TIME_ZONE)
    )

fun saveTimeZone(context: Context, timeZone: String) {
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .edit().putString(KEY_TIME_ZONE, normalizeTimeZoneId(timeZone)).apply()
}

fun clearToken(context: Context) {
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
        .remove(KEY_TOKEN)
        .remove(KEY_TIME_ZONE)
        .apply()
}

const val PUSH_DEBUG_TAG = "TM_PUSH_DEBUG"
