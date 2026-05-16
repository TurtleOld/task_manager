package com.taskmanager.mobile.security

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

const val SECURE_PREFS_NAME = "task_manager_secure_prefs"
const val KEY_PIN_HASH = "pin_hash"
const val KEY_BIOMETRIC_ENABLED = "biometric_enabled"

fun securePrefs(context: Context): SharedPreferences {
    val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()
    return EncryptedSharedPreferences.create(
        context,
        SECURE_PREFS_NAME,
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )
}

fun hashPin(pin: String): String {
    val digest = java.security.MessageDigest.getInstance("SHA-256")
    return digest.digest(pin.toByteArray())
        .joinToString("") { "%02x".format(it) }
}

fun savePin(context: Context, pin: String) {
    securePrefs(context).edit().putString(KEY_PIN_HASH, hashPin(pin)).apply()
}

fun verifyPin(context: Context, pin: String): Boolean {
    val stored = securePrefs(context).getString(KEY_PIN_HASH, null) ?: return false
    return stored == hashPin(pin)
}

fun clearPin(context: Context) {
    securePrefs(context).edit()
        .remove(KEY_PIN_HASH)
        .remove(KEY_BIOMETRIC_ENABLED)
        .apply()
}

fun isPinEnabled(context: Context): Boolean =
    securePrefs(context).contains(KEY_PIN_HASH)

fun isBiometricEnabled(context: Context): Boolean =
    securePrefs(context).getBoolean(KEY_BIOMETRIC_ENABLED, false)

fun setBiometricEnabled(context: Context, enabled: Boolean) {
    securePrefs(context).edit().putBoolean(KEY_BIOMETRIC_ENABLED, enabled).apply()
}
