package com.taskmanager.mobile.ui.navigation

import androidx.fragment.app.FragmentActivity

val LocalActivity = androidx.compose.runtime.staticCompositionLocalOf<FragmentActivity> {
    error("No FragmentActivity provided")
}
