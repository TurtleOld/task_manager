package com.taskmanager.mobile.notifications

import android.app.Activity
import android.content.Context
import android.util.Log
import org.unifiedpush.android.connector.UnifiedPush

object TaskManagerUnifiedPushRegistrar {
    private const val INSTANCE = "task-manager"
    private const val REGISTRATION_LABEL = "Task Manager notifications"

    fun register(activity: Activity, context: Context, forceNewEndpoint: Boolean = false, onComplete: (Boolean) -> Unit = {}) {
        if (forceNewEndpoint) {
            unregister(context)
        }
        UnifiedPush.tryUseCurrentOrDefaultDistributor(activity) { success ->
            if (!success) {
                Log.w("TM_PUSH_DEBUG", "UnifiedPush distributor is not available")
                onComplete(false)
                return@tryUseCurrentOrDefaultDistributor
            }
            runCatching {
                UnifiedPush.register(
                    context = context,
                    instance = INSTANCE,
                    messageForDistributor = REGISTRATION_LABEL,
                )
            }.onSuccess {
                onComplete(true)
            }.onFailure { error ->
                Log.e("TM_PUSH_DEBUG", "UnifiedPush registration failed", error)
                onComplete(false)
            }
        }
    }

    fun unregister(context: Context) {
        runCatching { UnifiedPush.unregister(context, INSTANCE) }
    }
}
