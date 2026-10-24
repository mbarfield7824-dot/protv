package com.protv.firetv.ui

import android.annotation.SuppressLint
import android.os.Bundle
import android.view.KeyEvent
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.google.firebase.auth.FirebaseAuth
import com.protv.firetv.account.DeviceLinkController
import com.protv.firetv.account.DeviceSessionApiClient
import com.protv.firetv.account.PendingDeviceSessionStore
import com.protv.firetv.account.SignInScreen
import com.protv.firetv.account.ViewerFirebaseAuth
import com.protv.firetv.account.ViewerAccountApiClient
import com.protv.firetv.account.ViewerAccountController
import com.protv.firetv.account.DeviceWatchProgressStore
import com.protv.firetv.BuildConfig
import com.protv.firetv.data.api.CatalogApiClient
import com.protv.firetv.playback.PlaybackApiClient
import com.protv.firetv.playback.PlayerScreen
import com.protv.firetv.playback.RemoteKeyDispatcher
import com.protv.firetv.ui.home.HomeController
import kotlinx.coroutines.launch

private data class SelectedTitle(
    val id: String,
    val title: String,
    val resumePositionSeconds: Double?,
)

class MainActivity : ComponentActivity() {
    private val remoteKeys = RemoteKeyDispatcher<KeyEvent>()

    // The active player sees remote keys before focus routing, so Play/Pause and Select control
    // playback even when focus is on a Compose overlay rather than Media3's PlayerView.
    // RestrictedApi is a known false positive: androidx.core's ComponentActivity annotates its
    // override of the public platform Activity.dispatchKeyEvent, which apps may override.
    @SuppressLint("RestrictedApi")
    override fun dispatchKeyEvent(event: KeyEvent): Boolean =
        remoteKeys.dispatch(event) || super.dispatchKeyEvent(event)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val apiBaseUrl = BuildConfig.API_BASE_URL
        val catalog = if (apiBaseUrl.isBlank()) null else CatalogApiClient.create(apiBaseUrl)
        val playback = if (apiBaseUrl.isBlank()) null else PlaybackApiClient.create(apiBaseUrl)
        val deviceSessions = if (apiBaseUrl.isBlank()) null else DeviceSessionApiClient.create(apiBaseUrl)
        val viewerAccountRepository =
            if (apiBaseUrl.isBlank()) null else ViewerAccountApiClient.create(apiBaseUrl)
        val firebaseAuth = ViewerFirebaseAuth.create(
            applicationContext,
            BuildConfig.FIREBASE_API_KEY,
            BuildConfig.FIREBASE_APPLICATION_ID,
            BuildConfig.FIREBASE_PROJECT_ID,
        )
        val pendingSessionStore = PendingDeviceSessionStore(applicationContext)
        setContent {
            val home = remember { HomeController(catalog, apiBaseUrl) }
            val scope = rememberCoroutineScope()
            val accountLink = remember {
                DeviceLinkController(
                    repository = deviceSessions,
                    store = pendingSessionStore,
                    firebaseAuth = firebaseAuth,
                )
            }
            LaunchedEffect(home, home.reloadToken) { home.load() }
            var selectedTitle by remember { mutableStateOf<SelectedTitle?>(null) }
            var accountScreenOpen by remember { mutableStateOf(pendingSessionStore.hasPendingSession()) }
            var accountLabel by remember { mutableStateOf(firebaseAuth?.accountLabel) }
            var viewerId by remember { mutableStateOf(firebaseAuth?.viewerId) }
            val viewerAccount = remember(viewerAccountRepository, firebaseAuth) {
                ViewerAccountController(viewerAccountRepository, firebaseAuth, DeviceWatchProgressStore(applicationContext))
            }
            LaunchedEffect(viewerId) { viewerAccount.load() }
            DisposableEffect(firebaseAuth) {
                val listener = FirebaseAuth.AuthStateListener { auth ->
                    viewerId = auth.currentUser?.uid
                    accountLabel = auth.currentUser?.let {
                        it.email ?: it.displayName ?: "PROtv viewer"
                    }
                }
                firebaseAuth?.addAuthStateListener(listener)
                onDispose { firebaseAuth?.removeAuthStateListener(listener) }
            }
            val selection = selectedTitle
            if (selection != null && playback != null) {
                Box(Modifier.fillMaxSize()) {
                PlayerScreen(
                    titleId = selection.id,
                    title = selection.title,
                    startPositionSeconds = selection.resumePositionSeconds,
                    repository = playback,
                    isSignedIn = accountLabel != null,
                    isFavorite = selection.id in viewerAccount.state.favorites,
                    accountError = viewerAccount.state.error,
                    onSignIn = { accountScreenOpen = true },
                    onToggleFavorite = { viewerAccount.toggleFavorite(selection.id) },
                    onProgressUpdate = { position, duration ->
                        viewerAccount.recordProgress(selection.id, position, duration)
                        scope.launch { viewerAccount.saveProgress(selection.id, position, duration) }
                    },
                    onExit = { selectedTitle = null },
                    remoteKeys = remoteKeys,
                    overlayOpen = accountScreenOpen,
                )
                    if (accountScreenOpen) {
                        SignInScreen(
                            controller = accountLink,
                            firebaseAuth = firebaseAuth,
                            onClose = { accountScreenOpen = false },
                        )
                    }
                }
            } else if (accountScreenOpen) {
                SignInScreen(
                    controller = accountLink,
                    firebaseAuth = firebaseAuth,
                    onClose = { accountScreenOpen = false },
                )
            } else {
                ProTvScreen(
                    controller = home,
                    onSelect = { tile ->
                        selectedTitle = SelectedTitle(tile.id, tile.title, tile.resumePositionSeconds)
                    },
                    onExit = { finish() },
                    accountLabel = accountLabel,
                    onAccountClick = { accountScreenOpen = true },
                    viewerAccountState = viewerAccount.state,
                    onAccountRetry = { scope.launch { viewerAccount.load() } },
                    onRefreshClick = home::retry,
                )
            }
        }
    }
}
