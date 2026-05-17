package com.taskmanager.mobile.security

import android.content.Context
import com.taskmanager.mobile.ui.components.normalizeTimeZoneId
import com.taskmanager.mobile.util.DEFAULT_TIME_ZONE

private const val KEY_TOKEN = "token"
private const val KEY_TIME_ZONE = "time_zone"

fun readSavedToken(context: Context): String =
    readSecureString(context, KEY_TOKEN).orEmpty()

fun saveToken(context: Context, token: String) {
    saveSecureString(context, KEY_TOKEN, token)
}

fun readSavedSecureTimeZone(context: Context): String =
    normalizeTimeZoneId(readSecureString(context, KEY_TIME_ZONE) ?: DEFAULT_TIME_ZONE)

fun saveSecureTimeZone(context: Context, timeZone: String) {
    saveSecureString(context, KEY_TIME_ZONE, normalizeTimeZoneId(timeZone))
}

fun clearToken(context: Context) {
    clearSecureKeys(context, KEY_TOKEN, KEY_TIME_ZONE)
}
