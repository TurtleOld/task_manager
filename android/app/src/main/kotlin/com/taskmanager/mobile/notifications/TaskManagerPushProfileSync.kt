package com.taskmanager.mobile.notifications

import android.content.Context
import android.util.Log
import okhttp3.MediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import org.json.JSONObject

object TaskManagerPushProfileSync {
    private const val PREFS_NAME = "task_manager_mobile_prefs"
    private const val KEY_DOMAIN = "domain"
    private const val KEY_TOKEN = "token"
    private const val KEY_PENDING_ENDPOINT = "pending_unifiedpush_endpoint"

    private val httpClient = OkHttpClient()
    private val jsonMediaType = MediaType.parse("application/json; charset=utf-8")

    fun updateEndpoint(context: Context, endpoint: String) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putString(KEY_PENDING_ENDPOINT, endpoint).apply()
        val domain = normalizeBaseUrl(prefs.getString(KEY_DOMAIN, "").orEmpty())
        val token = prefs.getString(KEY_TOKEN, "").orEmpty()
        if (domain.isBlank() || token.isBlank() || endpoint.isBlank()) {
            Log.w("TM_PUSH_DEBUG", "Cannot sync UnifiedPush endpoint: missing domain/token/endpoint")
            return
        }

        val payload = JSONObject()
            .put("unifiedpush_endpoint", endpoint)
            .toString()
        val request = Request.Builder()
            .url("${domain.trimEnd('/')}/api/v1/notifications/profile/")
            .header("Accept", "application/json")
            .header("Content-Type", "application/json")
            .header("Authorization", "Token $token")
            .patch(RequestBody.create(jsonMediaType, payload))
            .build()

        try {
            httpClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    Log.w("TM_PUSH_DEBUG", "UnifiedPush endpoint sync failed: HTTP ${response.code()}")
                    return
                }
                prefs.edit().remove(KEY_PENDING_ENDPOINT).apply()
                Log.d("TM_PUSH_DEBUG", "UnifiedPush endpoint synced")
            }
        } catch (error: Exception) {
            Log.e("TM_PUSH_DEBUG", "UnifiedPush endpoint sync failed", error)
        }
    }

    fun retryPendingEndpoint(context: Context) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val endpoint = prefs.getString(KEY_PENDING_ENDPOINT, "").orEmpty()
        if (endpoint.isNotBlank()) {
            updateEndpoint(context, endpoint)
        }
    }

    fun hasPendingEndpoint(context: Context): Boolean {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getString(KEY_PENDING_ENDPOINT, "").orEmpty().isNotBlank()
    }

    fun clearEndpoint(context: Context) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val domain = normalizeBaseUrl(prefs.getString(KEY_DOMAIN, "").orEmpty())
        val token = prefs.getString(KEY_TOKEN, "").orEmpty()
        if (domain.isBlank() || token.isBlank()) return

        val payload = JSONObject()
            .put("unifiedpush_endpoint", "")
            .toString()
        val request = Request.Builder()
            .url("${domain.trimEnd('/')}/api/v1/notifications/profile/")
            .header("Accept", "application/json")
            .header("Content-Type", "application/json")
            .header("Authorization", "Token $token")
            .patch(RequestBody.create(jsonMediaType, payload))
            .build()

        runCatching {
            httpClient.newCall(request).execute().close()
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
