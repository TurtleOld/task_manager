package com.taskmanager.mobile.notifications

import android.content.Context
import android.util.Log
import okhttp3.MediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import org.json.JSONObject
import com.taskmanager.mobile.util.KEY_DOMAIN
import com.taskmanager.mobile.util.KEY_TOKEN
import com.taskmanager.mobile.util.PREFS_NAME
import com.taskmanager.mobile.util.clearToken
import com.taskmanager.mobile.util.normalizeBaseUrl

object TaskManagerFcmProfileSync {
    private const val PREFS_NAME = "task_manager_mobile_prefs"
    private const val KEY_DOMAIN = "domain"
    private const val KEY_TOKEN = "token"
    private const val KEY_FCM_TOKEN = "fcm_token"
    private const val KEY_PENDING_FCM_TOKEN = "pending_fcm_token"

    private val httpClient = OkHttpClient()
    private val jsonMediaType = MediaType.parse("application/json; charset=utf-8")

    fun updateToken(context: Context, fcmToken: String): Boolean {
        val tokenToSync = fcmToken.trim()
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit()
            .putString(KEY_FCM_TOKEN, tokenToSync)
            .putString(KEY_PENDING_FCM_TOKEN, tokenToSync)
            .apply()

        val domain = normalizeBaseUrl(prefs.getString(KEY_DOMAIN, "").orEmpty())
        val apiToken = prefs.getString(KEY_TOKEN, "").orEmpty()
        if (domain.isBlank() || apiToken.isBlank() || tokenToSync.isBlank()) {
            Log.w("TM_PUSH_DEBUG", "Cannot sync FCM token: missing domain/token/fcmToken")
            return false
        }

        return patchFcmToken(domain, apiToken, tokenToSync).also { synced ->
            if (synced) {
                prefs.edit().remove(KEY_PENDING_FCM_TOKEN).apply()
                Log.d("TM_PUSH_DEBUG", "FCM token synced")
            }
        }
    }

    fun retryPendingToken(context: Context): Boolean {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val token = prefs.getString(KEY_PENDING_FCM_TOKEN, "").orEmpty()
            .ifBlank { prefs.getString(KEY_FCM_TOKEN, "").orEmpty() }
        return token.isNotBlank() && updateToken(context, token)
    }

    fun clearToken(context: Context): Boolean {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val domain = normalizeBaseUrl(prefs.getString(KEY_DOMAIN, "").orEmpty())
        val apiToken = prefs.getString(KEY_TOKEN, "").orEmpty()
        prefs.edit().remove(KEY_FCM_TOKEN).remove(KEY_PENDING_FCM_TOKEN).apply()
        if (domain.isBlank() || apiToken.isBlank()) return false
        return patchFcmToken(domain, apiToken, "")
    }

    private fun patchFcmToken(domain: String, apiToken: String, fcmToken: String): Boolean {
        val payload = JSONObject()
            .put("fcm_token", fcmToken)
            .toString()
        val request = Request.Builder()
            .url("${domain.trimEnd('/')}/api/v1/notifications/profile/")
            .header("Accept", "application/json")
            .header("Content-Type", "application/json")
            .header("Authorization", "Token $apiToken")
            .patch(RequestBody.create(jsonMediaType, payload))
            .build()

        return try {
            httpClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    Log.w("TM_PUSH_DEBUG", "FCM token sync failed: HTTP ${response.code()}")
                    return false
                }
                true
            }
        } catch (error: Exception) {
            Log.e("TM_PUSH_DEBUG", "FCM token sync failed", error)
            false
        }
    }

    private fun normalizeBaseUrl(value: String): String {
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
}
