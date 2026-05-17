package com.taskmanager.mobile.security

import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.nio.ByteBuffer
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
private const val KEY_ALIAS = "task_manager_secure_key"
private const val SECURE_PREFS_NAME = "task_manager_secure_store"

private fun securePrefs(context: Context): SharedPreferences =
    context.getSharedPreferences(SECURE_PREFS_NAME, Context.MODE_PRIVATE)

private fun getOrCreateSecretKey(): SecretKey {
    val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }
    val existing = keyStore.getKey(KEY_ALIAS, null) as? SecretKey
    if (existing != null) return existing

    val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE_PROVIDER)
    keyGenerator.init(
        KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build()
    )
    return keyGenerator.generateKey()
}

private fun encrypt(value: String): String {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, getOrCreateSecretKey())
    val iv = cipher.iv
    val encrypted = cipher.doFinal(value.toByteArray(StandardCharsets.UTF_8))
    val payload = ByteBuffer.allocate(4 + iv.size + encrypted.size)
        .putInt(iv.size)
        .put(iv)
        .put(encrypted)
        .array()
    return Base64.encodeToString(payload, Base64.NO_WRAP)
}

private fun decrypt(value: String): String? = runCatching {
    val payload = Base64.decode(value, Base64.NO_WRAP)
    val buffer = ByteBuffer.wrap(payload)
    val ivSize = buffer.int
    val iv = ByteArray(ivSize)
    buffer.get(iv)
    val encrypted = ByteArray(buffer.remaining())
    buffer.get(encrypted)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, getOrCreateSecretKey(), GCMParameterSpec(128, iv))
    String(cipher.doFinal(encrypted), StandardCharsets.UTF_8)
}.getOrNull()

fun readSecureString(context: Context, key: String): String? {
    val raw = securePrefs(context).getString(key, null) ?: return null
    return decrypt(raw)
}

fun saveSecureString(context: Context, key: String, value: String?) {
    val prefs = securePrefs(context)
    if (value == null) {
        prefs.edit().remove(key).apply()
    } else {
        prefs.edit().putString(key, encrypt(value)).apply()
    }
}

fun readSecureBoolean(context: Context, key: String, default: Boolean = false): Boolean {
    return readSecureString(context, key)?.toBooleanStrictOrNull() ?: default
}

fun saveSecureBoolean(context: Context, key: String, value: Boolean) {
    saveSecureString(context, key, value.toString())
}

fun containsSecureKey(context: Context, key: String): Boolean = securePrefs(context).contains(key)

fun clearSecureKeys(context: Context, vararg keys: String) {
    val editor = securePrefs(context).edit()
    keys.forEach(editor::remove)
    editor.apply()
}
