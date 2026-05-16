package com.taskmanager.mobile.notifications

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.taskmanager.mobile.MainActivity
import com.taskmanager.mobile.R
import org.json.JSONObject

object TaskManagerNotificationPublisher {
    private const val CHANNEL_ID = "task_events"

    fun show(context: Context, title: String?, payloadJson: String?) {
        val payload = parsePayload(payloadJson)
        val finalTitle = title ?: payload?.optString("title")?.takeIf { it.isNotBlank() } ?: context.getString(R.string.app_name)
        val finalBody = payload?.optString("body")?.takeIf { it.isNotBlank() } ?: context.getString(R.string.app_name)
        val notificationId = payload?.optInt("notificationId") ?: finalBody.hashCode()

        ensureChannel(context)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            Log.w("TM_PUSH_DEBUG", "Skipping notification: POST_NOTIFICATIONS is not granted")
            return
        }

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            notificationId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(finalTitle)
            .setContentText(finalBody)
            .setStyle(NotificationCompat.BigTextStyle().bigText(finalBody))
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()

        NotificationManagerCompat.from(context).notify(notificationId, notification)
        Log.d("TM_PUSH_DEBUG", "Displayed notification id=$notificationId title=$finalTitle")
    }

    private fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Task events",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Notifications about boards and tasks"
        }
        manager.createNotificationChannel(channel)
    }

    private fun parsePayload(payloadJson: String?): JSONObject? {
        if (payloadJson.isNullOrBlank()) return null
        return runCatching { JSONObject(payloadJson) }.getOrNull()
    }
}
