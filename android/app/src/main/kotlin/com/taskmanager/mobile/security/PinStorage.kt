package com.taskmanager.mobile.security

import android.content.Context

const val KEY_PIN_HASH = "pin_hash"
const val KEY_BIOMETRIC_ENABLED = "biometric_enabled"

fun hashPin(pin: String): String {
    val digest = java.security.MessageDigest.getInstance("SHA-256")
    return digest.digest(pin.toByteArray())
        .joinToString("") { "%02x".format(it) }
}

fun savePin(context: Context, pin: String) {
    saveSecureString(context, KEY_PIN_HASH, hashPin(pin))
}

fun verifyPin(context: Context, pin: String): Boolean {
    val stored = readSecureString(context, KEY_PIN_HASH) ?: return false
    return stored == hashPin(pin)
}

fun clearPin(context: Context) {
    clearSecureKeys(context, KEY_PIN_HASH, KEY_BIOMETRIC_ENABLED)
}

fun isPinEnabled(context: Context): Boolean =
    containsSecureKey(context, KEY_PIN_HASH)

fun isBiometricEnabled(context: Context): Boolean =
    readSecureBoolean(context, KEY_BIOMETRIC_ENABLED, false)

fun setBiometricEnabled(context: Context, enabled: Boolean) {
    saveSecureBoolean(context, KEY_BIOMETRIC_ENABLED, enabled)
}
