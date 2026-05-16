package com.taskmanager.mobile.data.api

import okhttp3.ResponseBody
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import com.taskmanager.mobile.data.api.dto.BoardDto
import com.taskmanager.mobile.data.api.dto.CardDto
import com.taskmanager.mobile.data.api.dto.ColumnDto
import com.taskmanager.mobile.data.api.dto.CreateCardRequest
import com.taskmanager.mobile.data.api.dto.LoginRequest
import com.taskmanager.mobile.data.api.dto.LoginResponse
import com.taskmanager.mobile.data.api.dto.MoveCardRequest
import com.taskmanager.mobile.data.api.dto.NotificationPreferenceDto
import com.taskmanager.mobile.data.api.dto.NotificationPreferencePatch
import com.taskmanager.mobile.data.api.dto.NotificationPreferenceRequest
import com.taskmanager.mobile.data.api.dto.NotificationProfileDto
import com.taskmanager.mobile.data.api.dto.NotificationProfileRequest
import com.taskmanager.mobile.data.api.dto.NotifyCardUpdatedRequest
import com.taskmanager.mobile.data.api.dto.PatchCardRequest
import com.taskmanager.mobile.data.api.dto.UserDto

interface KanbanApi {
    @POST("auth/login/")
    suspend fun login(@Body request: LoginRequest): LoginResponse

    @GET("boards/")
    suspend fun getBoards(): List<BoardDto>

    @GET("columns/")
    suspend fun getColumns(): List<ColumnDto>

    @GET("cards/")
    suspend fun getCards(): List<CardDto>

    @GET("cards/{cardId}/")
    suspend fun getCard(@Path("cardId") cardId: Int): CardDto

    @POST("cards/")
    suspend fun createCard(@Body request: CreateCardRequest): CardDto

    @PATCH("cards/{cardId}/")
    suspend fun patchCard(@Path("cardId") cardId: Int, @Body request: PatchCardRequest): CardDto

    @POST("cards/{cardId}/notify-updated/")
    suspend fun notifyCardUpdated(@Path("cardId") cardId: Int, @Body request: NotifyCardUpdatedRequest): ResponseBody

    @POST("cards/{cardId}/move/")
    suspend fun moveCard(@Path("cardId") cardId: Int, @Body request: MoveCardRequest): ResponseBody

    @DELETE("cards/{cardId}/")
    suspend fun deleteCard(@Path("cardId") cardId: Int): ResponseBody

    @POST("auth/terminate-sessions/")
    suspend fun terminateSessions(): ResponseBody

    @PATCH("notifications/profile/")
    suspend fun updateNotificationProfile(@Body request: NotificationProfileRequest): NotificationProfileDto

    @GET("notifications/profile/")
    suspend fun getNotificationProfile(): NotificationProfileDto

    @GET("users/")
    suspend fun listUsers(): List<UserDto>

    @GET("notification-preferences/")
    suspend fun listNotificationPreferences(): List<NotificationPreferenceDto>

    @POST("notification-preferences/")
    suspend fun createNotificationPreference(@Body request: NotificationPreferenceRequest): ResponseBody

    @PATCH("notification-preferences/{id}/")
    suspend fun updateNotificationPreference(
        @Path("id") id: Int,
        @Body request: NotificationPreferencePatch
    ): ResponseBody
}
