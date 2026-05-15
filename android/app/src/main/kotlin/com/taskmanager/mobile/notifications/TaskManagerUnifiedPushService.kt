package com.taskmanager.mobile.notifications

import android.util.Log
import org.unifiedpush.android.connector.FailedReason
import org.unifiedpush.android.connector.PushService
import org.unifiedpush.android.connector.data.PushEndpoint
import org.unifiedpush.android.connector.data.PushMessage

class TaskManagerUnifiedPushService : PushService() {
    override fun onNewEndpoint(endpoint: PushEndpoint, instance: String) {
        TaskManagerPushProfileSync.updateEndpoint(applicationContext, endpoint.url)
    }

    override fun onMessage(message: PushMessage, instance: String) {
        val payloadJson = message.content.toString(Charsets.UTF_8)
        TaskManagerNotificationPublisher.show(
            context = applicationContext,
            title = null,
            payloadJson = payloadJson,
        )
    }

    override fun onRegistrationFailed(reason: FailedReason, instance: String) {
        Log.w("TM_PUSH_DEBUG", "UnifiedPush registration failed: $reason")
    }

    override fun onUnregistered(instance: String) {
        TaskManagerPushProfileSync.clearEndpoint(applicationContext)
    }
}
