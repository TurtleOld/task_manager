package com.taskmanager.mobile.security

import android.content.Context
import android.util.Base64
import java.security.SecureRandom
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

const val KEY_PIN_HASH = "pin_hash"
const val KEY_BIOMETRIC_ENABLED = "biometric_enabled"

private const val PBKDF2_ALGORITHM = "PBKDF2WithHmacSHA256"
private const val ITERATIONS = 100_000
private const val KEY_LENGTH = 256
private const val SALT_BYTES = 16

private fun deriveKey(pin: String, salt: ByteArray): ByteArray {
    val spec = PBEKeySpec(pin.toCharArray(), salt, ITERATIONS, KEY_LENGTH)
    return SecretKeyFactory.getInstance(PBKDF2_ALGORITHM).generateSecret(spec).encoded
}

private fun encodeHash(salt: ByteArray, hash: ByteArray): String {
    val s = Base64.encodeToString(salt, Base64.NO_WRAP)
    val h = Base64.encodeToString(hash, Base64.NO_WRAP)
    return "$s:$h"
}

private fun decodeHash(stored: String): Pair<ByteArray, ByteArray>? {
    val parts = stored.split(":")
    if (parts.size != 2) return null
    return runCatching {
        Base64.decode(parts[0], Base64.NO_WRAP) to Base64.decode(parts[1], Base64.NO_WRAP)
    }.getOrNull()
}

fun savePin(context: Context, pin: String) {
    val salt = ByteArray(SALT_BYTES).also { SecureRandom().nextBytes(it) }
    val hash = deriveKey(pin, salt)
    saveSecureString(context, KEY_PIN_HASH, encodeHash(salt, hash))
}

fun verifyPin(context: Context, pin: String): Boolean {
    val stored = readSecureString(context, KEY_PIN_HASH) ?: return false
    val (salt, expectedHash) = decodeHash(stored) ?: return false
    val actualHash = deriveKey(pin, salt)
    return actualHash.contentEquals(expectedHash)
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
