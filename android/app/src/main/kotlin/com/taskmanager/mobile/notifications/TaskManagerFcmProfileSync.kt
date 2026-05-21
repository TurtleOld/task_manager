package com.taskmanager.mobile.notifications

import android.content.Context
import android.util.Log
import okhttp3.MediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import org.json.JSONObject
import com.taskmanager.mobile.security.readSavedToken
import com.taskmanager.mobile.util.PREFS_NAME
import com.taskmanager.mobile.util.PUSH_DEBUG_TAG
import com.taskmanager.mobile.util.normalizeBaseUrl
import com.taskmanager.mobile.util.readSavedDomain

object TaskManagerFcmProfileSync {
    private const val KEY_FCM_TOKEN = "fcm_token"
    private const val KEY_PENDING_FCM_TOKEN = "pending_fcm_token"

    private val httpClient = OkHttpClient()
    private val jsonMediaType = MediaType.parse("application/json; charset=utf-8")

    fun updateToken(context: Context, fcmToken: String): Boolean {
        return updateToken(
            context = context,
            domain = readSavedDomain(context),
            apiToken = readSavedToken(context),
            fcmToken = fcmToken,
        )
    }

    fun updateToken(context: Context, domain: String, apiToken: String, fcmToken: String): Boolean {
        val tokenToSync = fcmToken.trim()
        if (tokenToSync.isBlank()) {
            Log.w(PUSH_DEBUG_TAG, "Cannot sync FCM token: empty fcmToken")
            return false
        }

        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit()
            .putString(KEY_FCM_TOKEN, tokenToSync)
            .putString(KEY_PENDING_FCM_TOKEN, tokenToSync)
            .apply()

        val normalizedDomain = normalizeBaseUrl(domain)
        val authToken = apiToken.trim()
        if (normalizedDomain.isBlank() || authToken.isBlank()) {
            Log.w(PUSH_DEBUG_TAG, "Cannot sync FCM token: missing domain/token")
            return false
        }

        return patchFcmToken(normalizedDomain, authToken, tokenToSync).also { synced ->
            if (synced) {
                prefs.edit().remove(KEY_PENDING_FCM_TOKEN).apply()
                Log.d(PUSH_DEBUG_TAG, "FCM token synced")
            }
        }
    }

    fun retryPendingToken(context: Context): Boolean {
        return retryPendingToken(
            context = context,
            domain = readSavedDomain(context),
            apiToken = readSavedToken(context),
        )
    }

    fun retryPendingToken(context: Context, domain: String, apiToken: String): Boolean {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val token = prefs.getString(KEY_PENDING_FCM_TOKEN, "").orEmpty()
            .ifBlank { prefs.getString(KEY_FCM_TOKEN, "").orEmpty() }
        return token.isNotBlank() && updateToken(context, domain, apiToken, token)
    }

    fun clearToken(context: Context): Boolean {
        return clearToken(
            context = context,
            domain = readSavedDomain(context),
            apiToken = readSavedToken(context),
        )
    }

    fun clearToken(context: Context, domain: String, apiToken: String): Boolean {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val normalizedDomain = normalizeBaseUrl(domain)
        val authToken = apiToken.trim()
        val canSync = normalizedDomain.isNotBlank() && authToken.isNotBlank()
        val synced = if (canSync) patchFcmToken(normalizedDomain, authToken, "") else false
        prefs.edit().remove(KEY_FCM_TOKEN).remove(KEY_PENDING_FCM_TOKEN).apply()
        return synced
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
                    Log.w(PUSH_DEBUG_TAG, "FCM token sync failed: HTTP ${response.code()}")
                    return false
                }
                true
            }
        } catch (error: Exception) {
            Log.e(PUSH_DEBUG_TAG, "FCM token sync failed", error)
            false
        }
    }
}
