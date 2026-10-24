package com.protv.firetv.account

import android.annotation.SuppressLint
import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import java.security.GeneralSecurityException
import java.io.IOException
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
data class PendingDeviceSession(
    val sessionId: String,
    val deviceSecret: String,
    val userCode: String,
    val verificationUrl: String,
    val expiresAtMillis: Long,
    val intervalSeconds: Int,
)

fun verificationQrPayload(session: PendingDeviceSession): String = session.verificationUrl

interface PendingDeviceSessionPersistence {
    fun read(): PendingDeviceSession?
    fun write(session: PendingDeviceSession)
    fun clear()
}

class PendingDeviceSessionStore(context: Context) : PendingDeviceSessionPersistence {
    private val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
    private val keyStore: KeyStore = loadKeyStore()

    fun hasPendingSession(): Boolean = preferences.contains(SESSION_KEY)

    override fun read(): PendingDeviceSession? {
        val encoded = preferences.getString(SESSION_KEY, null) ?: return null
        val packed = Base64.decode(encoded, Base64.NO_WRAP)
        require(packed.size > GCM_IV_LENGTH) { "Stored device session is incomplete" }
        val iv = packed.copyOfRange(0, GCM_IV_LENGTH)
        val ciphertext = packed.copyOfRange(GCM_IV_LENGTH, packed.size)
        return try {
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, getKey(), GCMParameterSpec(GCM_TAG_BITS, iv))
            val json = cipher.doFinal(ciphertext).toString(Charsets.UTF_8)
            Json.decodeFromString<PendingDeviceSession>(json)
        } catch (error: GeneralSecurityException) {
            throw IllegalStateException("Unable to decrypt the stored device session", error)
        }
    }

    @SuppressLint("UseKtx")
    override fun write(session: PendingDeviceSession) {
        val packed = try {
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.ENCRYPT_MODE, getKey())
            val ciphertext = cipher.doFinal(Json.encodeToString(session).toByteArray(Charsets.UTF_8))
            cipher.iv + ciphertext
        } catch (error: GeneralSecurityException) {
            throw IllegalStateException("Unable to encrypt the device session", error)
        }
        check(preferences.edit().putString(SESSION_KEY, Base64.encodeToString(packed, Base64.NO_WRAP)).commit()) {
            "Unable to persist the device session"
        }
    }

    @SuppressLint("UseKtx")
    override fun clear() {
        check(preferences.edit().remove(SESSION_KEY).commit()) { "Unable to clear the device session" }
    }

    private fun getKey(): SecretKey {
        val existing = keyStore.getKey(KEY_ALIAS, null) as? SecretKey
        if (existing != null) return existing
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        return generator.generateKey()
    }

    private fun loadKeyStore(): KeyStore =
        try {
            KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        } catch (error: GeneralSecurityException) {
            throw IllegalStateException("Android Keystore is unavailable", error)
        } catch (error: IOException) {
            throw IllegalStateException("Unable to load Android Keystore", error)
        }

    private companion object {
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val PREFERENCES_NAME = "protv_device_link"
        const val SESSION_KEY = "pending_session"
        const val KEY_ALIAS = "com.protv.firetv.device-link.aes"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val GCM_IV_LENGTH = 12
        const val GCM_TAG_BITS = 128
    }
}
