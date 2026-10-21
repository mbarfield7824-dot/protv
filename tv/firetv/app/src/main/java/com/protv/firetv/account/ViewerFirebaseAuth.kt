package com.protv.firetv.account

import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine

interface ViewerAuthGateway {
    val accountLabel: String?
    val viewerId: String? get() = accountLabel
    suspend fun signInWithCustomToken(customToken: String): String
    suspend fun idToken(): String?
    fun signOut()
}

internal fun isAndroidFirebaseApplicationId(applicationId: String): Boolean =
    applicationId.matches(Regex("1:[0-9]+:android:[A-Fa-f0-9]+"))

class ViewerFirebaseAuth private constructor(private val auth: FirebaseAuth) : ViewerAuthGateway {
    val currentUser: FirebaseUser? get() = auth.currentUser
    override val viewerId: String? get() = currentUser?.uid
    override val accountLabel: String?
        get() = currentUser?.let { it.email ?: it.displayName ?: "PROtv viewer" }

    override suspend fun signInWithCustomToken(customToken: String): String {
        val result = auth.signInWithCustomToken(customToken).awaitResult()
        val user = requireNotNull(result.user) { "Firebase sign-in returned no user" }
        return user.email ?: user.displayName ?: "PROtv viewer"
    }

    override suspend fun idToken(): String? =
        auth.currentUser?.getIdToken(false)?.awaitResult()?.token

    override fun signOut() {
        auth.signOut()
    }

    fun addAuthStateListener(listener: FirebaseAuth.AuthStateListener) {
        auth.addAuthStateListener(listener)
    }

    fun removeAuthStateListener(listener: FirebaseAuth.AuthStateListener) {
        auth.removeAuthStateListener(listener)
    }

    companion object {
        fun create(
            context: Context,
            apiKey: String,
            applicationId: String,
            projectId: String,
        ): ViewerFirebaseAuth? {
            if (apiKey.isBlank() || applicationId.isBlank() || projectId.isBlank()) return null
            require(isAndroidFirebaseApplicationId(applicationId)) {
                "Firebase application ID is not an Android app ID"
            }
            val name = "protv-viewer"
            val app = FirebaseApp.getApps(context).firstOrNull { it.name == name }
                ?: FirebaseApp.initializeApp(
                    context,
                    FirebaseOptions.Builder()
                        .setApiKey(apiKey)
                        .setApplicationId(applicationId)
                        .setProjectId(projectId)
                        .build(),
                    name,
                )
            return ViewerFirebaseAuth(FirebaseAuth.getInstance(app))
        }
    }
}

private suspend fun <T> com.google.android.gms.tasks.Task<T>.awaitResult(): T =
    suspendCancellableCoroutine { continuation ->
        addOnCompleteListener { task ->
            if (!continuation.isActive) return@addOnCompleteListener
            val error = task.exception
            if (task.isSuccessful) {
                continuation.resume(task.result)
            } else {
                continuation.resumeWithException(error ?: IllegalStateException("Firebase request failed"))
            }
        }
    }
