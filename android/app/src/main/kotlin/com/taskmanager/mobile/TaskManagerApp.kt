package com.taskmanager.mobile

import android.app.Application
import com.onesignal.OneSignal

class TaskManagerApp : Application() {
    override fun onCreate() {
        super.onCreate()

        val oneSignalAppId = BuildConfig.ONESIGNAL_APP_ID
        if (oneSignalAppId.isNotBlank()) {
            OneSignal.initWithContext(this, oneSignalAppId)
        }
    }
}
