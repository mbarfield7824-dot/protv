package com.protv.firetv.account

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.currentCoroutineContext
import retrofit2.HttpException

sealed interface DeviceLinkState {
    data object Loading : DeviceLinkState
    data class ConfigurationRequired(val message: String) : DeviceLinkState
    data class Pending(val session: PendingDeviceSession, val message: String? = null) : DeviceLinkState
    data object Expired : DeviceLinkState
    data object Rejected : DeviceLinkState
    data class Failed(val message: String) : DeviceLinkState
    data class SignedIn(val accountLabel: String) : DeviceLinkState
}

class DeviceLinkController(
    private val repository: DeviceSessionRepository?,
    private val store: PendingDeviceSessionPersistence,
    private val firebaseAuth: ViewerAuthGateway?,
) {
    var state by mutableStateOf<DeviceLinkState>(DeviceLinkState.Loading)
        private set

    suspend fun run() {
        if (repository == null) {
            state = DeviceLinkState.ConfigurationRequired("The PROtv API URL is not configured for this build.")
            return
        }
        if (firebaseAuth == null) {
            state = DeviceLinkState.ConfigurationRequired(
                "Register the Fire TV app in the existing PROtv Firebase project, then provide its Android app configuration at build time.",
            )
            return
        }
        firebaseAuth.accountLabel?.let {
            store.clear()
            state = DeviceLinkState.SignedIn(it)
            return
        }
        state = DeviceLinkState.Loading
        val session = try {
            store.read()?.takeIf { it.expiresAtMillis > System.currentTimeMillis() }
                ?: repository.create().also(store::write)
        } catch (error: IOException) {
            state = DeviceLinkState.Failed("Could not connect to PROtv. Check the network and retry.")
            return
        } catch (error: HttpException) {
            state = DeviceLinkState.Failed("Could not start sign-in. Retry in a moment.")
            return
        } catch (error: IllegalArgumentException) {
            state = DeviceLinkState.Failed("The device sign-in response was invalid.")
            return
        } catch (error: IllegalStateException) {
            state = DeviceLinkState.Failed("Secure sign-in storage is unavailable on this device.")
            return
        }

        if (session.expiresAtMillis <= System.currentTimeMillis()) {
            store.clear()
            state = DeviceLinkState.Expired
            return
        }
        state = DeviceLinkState.Pending(session)
        while (currentCoroutineContext().isActive) {
            if (session.expiresAtMillis <= System.currentTimeMillis()) {
                store.clear()
                state = DeviceLinkState.Expired
                return
            }
            try {
                when (repository.status(session)) {
                    DeviceSessionStatus.PENDING -> state = DeviceLinkState.Pending(session)
                    DeviceSessionStatus.APPROVED -> {
                        state = DeviceLinkState.Pending(session, "Approved. Completing sign-in…")
                        val customToken = repository.exchange(session)
                        val accountLabel = firebaseAuth.signInWithCustomToken(customToken)
                        store.clear()
                        state = DeviceLinkState.SignedIn(accountLabel)
                        return
                    }
                    DeviceSessionStatus.REJECTED -> {
                        store.clear()
                        state = DeviceLinkState.Rejected
                        return
                    }
                    DeviceSessionStatus.EXPIRED, DeviceSessionStatus.CONSUMED -> {
                        store.clear()
                        state = DeviceLinkState.Expired
                        return
                    }
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: IOException) {
                state = DeviceLinkState.Pending(session, "Connection interrupted. Retrying…")
            } catch (error: HttpException) {
                when {
                    error.code() == 404 || error.code() == 410 -> {
                        store.clear()
                        state = DeviceLinkState.Expired
                        return
                    }
                    error.code() == 409 -> state = DeviceLinkState.Pending(session, "Completing sign-in…")
                    else -> state = DeviceLinkState.Pending(session, "PROtv is unavailable. Retrying…")
                }
            } catch (error: IllegalArgumentException) {
                store.clear()
                state = DeviceLinkState.Failed("The sign-in response was invalid. Start again.")
                return
            } catch (error: IllegalStateException) {
                store.clear()
                state = DeviceLinkState.Failed("Sign-in could not be completed. Start again.")
                return
            } catch (error: com.google.firebase.FirebaseException) {
                store.clear()
                state = DeviceLinkState.Failed("Firebase sign-in failed. Start again.")
                return
            }
            delay(session.intervalSeconds.coerceIn(1, 60) * 1_000L)
        }
    }

    fun cancel() {
        store.clear()
        state = DeviceLinkState.Loading
    }

}
