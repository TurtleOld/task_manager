package com.taskmanager.mobile.data.api

import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import kotlinx.serialization.json.Json
import okhttp3.Interceptor
import okhttp3.MediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import com.taskmanager.mobile.util.normalizeBaseUrl

object ApiClient {
    private data class CacheKey(val baseUrl: String, val apiToken: String)

    private val services = ConcurrentHashMap<CacheKey, KanbanApi>()
    @Volatile
    private var unauthorizedHandler: (() -> Unit)? = null

    fun setUnauthorizedHandler(handler: (() -> Unit)?) {
        unauthorizedHandler = handler
    }

    fun clearCache() {
        services.clear()
    }

    fun kanbanApi(baseUrl: String, apiToken: String, json: Json): KanbanApi {
        val normalizedBaseUrl = normalizeBaseUrl(baseUrl)
        val key = CacheKey(normalizedBaseUrl, apiToken)
        return services.getOrPut(key) {
            createKanbanApi(normalizedBaseUrl, apiToken, json)
        }
    }

    private fun createKanbanApi(baseUrl: String, apiToken: String, json: Json): KanbanApi {
        val authInterceptor = Interceptor { chain ->
            val requestBuilder = chain.request().newBuilder()
                .header("Accept", "application/json")
                .header("Content-Type", "application/json")
            if (apiToken.isNotBlank()) {
                requestBuilder.header("Authorization", "Token $apiToken")
            }
            val response = chain.proceed(requestBuilder.build())
            if (response.code() == 401) {
                unauthorizedHandler?.invoke()
            }
            response
        }

        val client = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .addInterceptor(authInterceptor)
            .build()

        return Retrofit.Builder()
            .baseUrl(baseUrl.trimEnd('/') + "/api/v1/")
            .client(client)
            .addConverterFactory(json.asConverterFactory(MediaType.parse("application/json")!!))
            .build()
            .create(KanbanApi::class.java)
    }
}
