package com.taskmanager.mobile.security

import android.content.Context
import com.taskmanager.mobile.ui.components.normalizeTimeZoneId
import com.taskmanager.mobile.util.DEFAULT_TIME_ZONE

private const val KEY_TOKEN = "token"
private const val KEY_TIME_ZONE = "time_zone"

fun readSavedToken(context: Context): String =
    securePrefs(context).getString(KEY_TOKEN, "") ?: ""

fun saveToken(context: Context, token: String) {
    securePrefs(context).edit().putString(KEY_TOKEN, token).apply()
}

fun readSavedSecureTimeZone(context: Context): String =
    normalizeTimeZoneId(securePrefs(context).getString(KEY_TIME_ZONE, DEFAULT_TIME_ZONE))

fun saveSecureTimeZone(context: Context, timeZone: String) {
    securePrefs(context).edit().putString(KEY_TIME_ZONE, normalizeTimeZoneId(timeZone)).apply()
}

fun clearToken(context: Context) {
    securePrefs(context).edit()
        .remove(KEY_TOKEN)
        .remove(KEY_TIME_ZONE)
        .apply()
}
