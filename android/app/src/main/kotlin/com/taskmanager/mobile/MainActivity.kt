package com.taskmanager.mobile

import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.fragment.app.FragmentActivity
import com.taskmanager.mobile.ui.navigation.AppRoot
import com.taskmanager.mobile.ui.navigation.LocalActivity
import com.taskmanager.mobile.ui.theme.TaskManagerTheme

class MainActivity : FragmentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            androidx.compose.runtime.CompositionLocalProvider(LocalActivity provides this) {
                TaskManagerTheme {
                    AppRoot()
                }
            }
        }
    }
}
