package com.taskmanager.mobile.notifications

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONObject

class TaskManagerFirebaseMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        CoroutineScope(Dispatchers.IO).launch {
            TaskManagerFcmProfileSync.updateToken(applicationContext, token)
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val payload = when {
            message.data.isNotEmpty() -> JSONObject(message.data).toString()
            message.notification != null -> JSONObject()
                .put("title", message.notification?.title.orEmpty())
                .put("body", message.notification?.body.orEmpty())
                .toString()
            else -> null
        }
        val title = message.data["title"] ?: message.notification?.title
        TaskManagerNotificationPublisher.show(
            context = applicationContext,
            title = title,
            payloadJson = payload,
        )
    }
}
