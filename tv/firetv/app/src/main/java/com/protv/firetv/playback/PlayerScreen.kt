package com.protv.firetv.playback

import android.util.Log
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import androidx.activity.compose.BackHandler
import androidx.annotation.OptIn
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.media3.common.MediaItem
import androidx.media3.common.AudioAttributes
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.common.util.Util
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import androidx.tv.material3.Button
import androidx.tv.material3.ButtonDefaults
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.protv.firetv.R
import com.protv.firetv.ui.theme.ProTvButtonShape
import com.protv.firetv.ui.theme.ProTvButtons
import com.protv.firetv.ui.theme.ProTvColors
import java.io.IOException
import kotlinx.serialization.SerializationException
import retrofit2.HttpException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val Midnight = ProTvColors.Midnight
private const val AttributionIntroMillis = 8_000L

private sealed interface PlaybackState {
    data object Loading : PlaybackState
    data object Failed : PlaybackState
    data class Ready(val url: String) : PlaybackState
}

@Composable
fun PlayerScreen(
    titleId: String,
    title: String,
    repository: PlaybackRepository,
    startPositionSeconds: Double?,
    isSignedIn: Boolean,
    isFavorite: Boolean,
    accountError: String?,
    onSignIn: () -> Unit,
    onToggleFavorite: suspend () -> Unit,
    onProgressUpdate: (positionSeconds: Double, durationSeconds: Double) -> Unit,
    onExit: () -> Unit,
    remoteKeys: RemoteKeyDispatcher<KeyEvent>,
    overlayOpen: Boolean = false,
    /** Creative Commons credit; shown as playback starts and whenever the controls are up. */
    attribution: String? = null,
) {
    BackHandler(enabled = !overlayOpen, onBack = onExit)
    val scope = rememberCoroutineScope()
    var retry by remember { mutableIntStateOf(0) }
    var controlsVisible by remember(titleId, retry) { mutableStateOf(false) }
    val state by produceState<PlaybackState>(PlaybackState.Loading, titleId, retry) {
        value = PlaybackState.Loading
        try {
            value = PlaybackState.Ready(repository.hlsUrl(titleId))
        } catch (error: IOException) {
            Log.e("PROtvPlayback", "Network error loading playback (${error.javaClass.simpleName})")
            value = PlaybackState.Failed
        } catch (error: HttpException) {
            Log.e("PROtvPlayback", "HTTP error loading playback (${error.code()})")
            value = PlaybackState.Failed
        } catch (error: SerializationException) {
            Log.e("PROtvPlayback", "Invalid playback response (${error.javaClass.simpleName})")
            value = PlaybackState.Failed
        } catch (error: IllegalArgumentException) {
            Log.e("PROtvPlayback", "Invalid playback data (${error.javaClass.simpleName})")
            value = PlaybackState.Failed
        }
    }

    MaterialTheme {
        Box(modifier = Modifier.fillMaxSize().background(Midnight), contentAlignment = Alignment.Center) {
            when (val current = state) {
                PlaybackState.Loading -> PlaybackMessage(title, stringResource(R.string.playback_loading))
                PlaybackState.Failed -> PlaybackMessage(
                    title, stringResource(R.string.playback_error), onRetry = { retry++ }
                )
                is PlaybackState.Ready -> VideoPlayer(
                    url = current.url,
                    title = title,
                    onRetry = { retry++ },
                    startPositionSeconds = startPositionSeconds,
                    onProgressUpdate = onProgressUpdate,
                    remoteKeys = remoteKeys,
                    active = !overlayOpen,
                    onControlsVisibleChange = { controlsVisible = it },
                )
            }
            var attributionIntro by remember(titleId, retry) { mutableStateOf(true) }
            LaunchedEffect(titleId, retry, state is PlaybackState.Ready) {
                if (state is PlaybackState.Ready) { delay(AttributionIntroMillis); attributionIntro = false }
            }
            if (attribution != null && (state !is PlaybackState.Ready || controlsVisible || attributionIntro)) {
                Text(attribution, color = ProTvColors.White, fontSize = 15.sp,
                    modifier = Modifier.align(Alignment.TopStart).padding(24.dp)
                        .background(Color.Black.copy(alpha = .6f)).padding(horizontal = 12.dp, vertical = 8.dp))
            }
            // During playback the account action appears only with the player controls, so a hidden
            // overlay can never hold focus and swallow Select.
            val showAccountAction = !overlayOpen && (state !is PlaybackState.Ready || controlsVisible)
            if (showAccountAction) Column(
                modifier = Modifier.align(Alignment.TopEnd).padding(24.dp),
                horizontalAlignment = Alignment.End,
            ) {
                if (isSignedIn) {
                    Button(
                        onClick = { scope.launch { onToggleFavorite() } },
                        shape = ButtonDefaults.shape(ProTvButtonShape),
                        colors = ProTvButtons.primary(),
                    ) {
                        Text(if (isFavorite) "Remove from My List" else "Add to My List")
                    }
                } else {
                    Button(
                        onClick = onSignIn,
                        shape = ButtonDefaults.shape(ProTvButtonShape),
                        colors = ProTvButtons.primary(),
                    ) {
                        Text("Sign in to use My List")
                    }
                }
                accountError?.let { message ->
                    Spacer(Modifier.height(8.dp))
                    Text(message, color = ProTvColors.Cyan, fontSize = 14.sp)
                }
            }
        }
    }
}

@Composable
@OptIn(UnstableApi::class)
private fun VideoPlayer(
    url: String,
    title: String,
    onRetry: () -> Unit,
    startPositionSeconds: Double?,
    onProgressUpdate: (positionSeconds: Double, durationSeconds: Double) -> Unit,
    remoteKeys: RemoteKeyDispatcher<KeyEvent>,
    active: Boolean,
    onControlsVisibleChange: (Boolean) -> Unit,
) {
    val context = LocalContext.current
    val player = remember(url, startPositionSeconds) {
        ExoPlayer.Builder(context).build().apply {
            setAudioAttributes(AudioAttributes.DEFAULT, true)
        }
    }
    val latestProgressUpdate by rememberUpdatedState(onProgressUpdate)
    val latestControlsChange by rememberUpdatedState(onControlsVisibleChange)
    val latestActive by rememberUpdatedState(active)
    var buffering by remember(url) { mutableStateOf(true) }
    var failed by remember(url) { mutableStateOf(false) }
    var playerView by remember(player) { mutableStateOf<PlayerView?>(null) }
    var controlsVisible by remember(player) { mutableStateOf(false) }

    LaunchedEffect(player, title) {
        while (true) {
            delay(5_000)
            val duration = player.duration
            val position = player.currentPosition
            if (player.isPlaying && position > 0 && duration > 0) {
                latestProgressUpdate(position / 1_000.0, duration / 1_000.0)
            }
        }
    }

    DisposableEffect(player) {
        val listener = object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                if (!isPlaying && player.currentPosition > 0 && player.duration > 0) {
                    latestProgressUpdate(player.currentPosition / 1_000.0, player.duration / 1_000.0)
                }
            }
            override fun onPlaybackStateChanged(playbackState: Int) {
                buffering = playbackState == Player.STATE_BUFFERING || playbackState == Player.STATE_IDLE
            }

            override fun onPlayerError(error: PlaybackException) {
                Log.e("PROtvPlayback", "Mux stream playback failed (${error.errorCodeName})")
                failed = true
            }
        }
        player.addListener(listener)
        player.setMediaItem(MediaItem.Builder().setUri(url).setMimeType(MimeTypes.APPLICATION_M3U8).build())
        startPositionSeconds?.takeIf { it.isFinite() && it > 0 }?.let {
            player.seekTo((it * 1_000).toLong())
        }
        player.prepare()
        player.playWhenReady = true
        onDispose {
            if (player.currentPosition > 0 && player.duration > 0) {
                latestProgressUpdate(player.currentPosition / 1_000.0, player.duration / 1_000.0)
            }
            player.removeListener(listener)
            player.release()
        }
    }

    // Leaving the app (Home, screensaver, another app) pauses playback; returning re-focuses the
    // player and shows its paused controls so the remote acts on the player immediately.
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner, player) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_STOP -> player.pause()
                Lifecycle.Event.ON_START -> if (latestActive) playerView?.let { view ->
                    view.requestFocus()
                    view.showPlaybackControls(resetFocus = true)
                }
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    DisposableEffect(playerView, active) {
        val view = playerView ?: return@DisposableEffect onDispose { }
        if (!active) {
            // An overlay (account sign-in) covers the player: stop playback and keep the hidden
            // player's controls out of D-pad focus search.
            player.pause()
            view.hideController()
            view.descendantFocusability = ViewGroup.FOCUS_BLOCK_DESCENDANTS
            view.isFocusable = false
            view.clearFocus()
            return@DisposableEffect onDispose { }
        }
        view.descendantFocusability = ViewGroup.FOCUS_BEFORE_DESCENDANTS
        view.isFocusable = true
        view.requestFocus()
        view.showPlaybackControls(resetFocus = true)
        val policy = PlayerRemoteKeyPolicy()
        val unregister = remoteKeys.register { event ->
            if (failed) {
                policy.reset()
                false
            } else {
                handleRemoteKey(event, policy, view, player, controlsVisible)
            }
        }
        onDispose { unregister() }
    }

    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        AndroidView(
            factory = { viewContext ->
                PlaybackPlayerView(viewContext).apply {
                    useController = true
                    controllerAutoShow = true
                    controllerShowTimeoutMs = 2_750
                    // Media3's staged hide otherwise leaves the progress bar up for two more seconds.
                    setControllerAnimationEnabled(false)
                    this.player = player
                    isFocusable = true
                    descendantFocusability = ViewGroup.FOCUS_BEFORE_DESCENDANTS
                    setControllerVisibilityListener(
                        PlayerView.ControllerVisibilityListener { visibility ->
                            val visible = visibility == View.VISIBLE
                            controlsVisible = visible
                            latestControlsChange(visible)
                            if (latestActive) {
                                if (visible) focusPlayPause() else requestFocus()
                            }
                        },
                    )
                    playerView = this
                }
            },
            update = { view -> view.player = player },
            modifier = Modifier.fillMaxSize(),
        )
        if (failed) {
            PlaybackMessage(title, stringResource(R.string.playback_error), onRetry = onRetry)
        } else if (buffering) {
            // Kept clear of the centered transport controls so Play/Pause stays visible.
            PlaybackMessage(
                title,
                stringResource(R.string.playback_buffering),
                modifier = Modifier.align(Alignment.TopStart).padding(24.dp),
            )
        }
    }
}

@OptIn(UnstableApi::class)
private fun PlayerView.focusPlayPause() {
    findViewById<View>(androidx.media3.ui.R.id.exo_play_pause).requestFocus()
}

@OptIn(UnstableApi::class)
private fun PlayerView.showPlaybackControls(resetFocus: Boolean = false) {
    val wasVisible = isControllerFullyVisible
    showController()
    if (resetFocus || !wasVisible) focusPlayPause()
}

@OptIn(UnstableApi::class)
private fun handleRemoteKey(
    event: KeyEvent,
    policy: PlayerRemoteKeyPolicy,
    view: PlayerView,
    player: Player,
    controlsVisible: Boolean,
): Boolean {
    val isDown = when (event.action) {
        KeyEvent.ACTION_DOWN -> true
        KeyEvent.ACTION_UP -> false
        else -> return false
    }
    when (policy.onKey(event.keyCode, isDown, event.repeatCount, controlsVisible)) {
        PlayerRemoteCommand.PassThrough -> {
            // Keeps visible controls up while the viewer navigates, including onto Compose actions.
            if (isDown && controlsVisible && event.keyCode != KeyEvent.KEYCODE_BACK) view.showPlaybackControls()
            return false
        }
        PlayerRemoteCommand.Consume -> Unit
        PlayerRemoteCommand.TogglePlayPause -> {
            Util.handlePlayPauseButtonAction(player)
            view.showPlaybackControls()
        }
        PlayerRemoteCommand.Play -> {
            Util.handlePlayButtonAction(player)
            view.showPlaybackControls()
        }
        PlayerRemoteCommand.Pause -> {
            Util.handlePauseButtonAction(player)
            view.showPlaybackControls()
        }
        PlayerRemoteCommand.SeekForward -> {
            player.seekForward()
            view.showPlaybackControls()
        }
        PlayerRemoteCommand.SeekBack -> {
            player.seekBack()
            view.showPlaybackControls()
        }
        PlayerRemoteCommand.ShowControls -> view.showPlaybackControls()
    }
    return true
}

@Composable
private fun PlaybackMessage(
    title: String,
    message: String,
    modifier: Modifier = Modifier,
    onRetry: (() -> Unit)? = null,
) {
    Column(
        modifier = modifier.background(Midnight.copy(alpha = 0.9f)).padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(title, color = Color.White, fontSize = 25.sp)
        Spacer(Modifier.height(16.dp))
        Text(message, color = ProTvColors.Silver, fontSize = 20.sp)
        if (onRetry != null) {
            val retryFocusRequester = remember { FocusRequester() }
            LaunchedEffect(Unit) {
                withFrameNanos { }
                runCatching { retryFocusRequester.requestFocus() }
            }
            Spacer(Modifier.height(20.dp))
            Button(
                onClick = onRetry,
                modifier = Modifier.focusRequester(retryFocusRequester),
                shape = ButtonDefaults.shape(ProTvButtonShape),
                colors = ProTvButtons.primary(),
            ) {
                Text(stringResource(R.string.catalog_retry))
            }
        }
    }
}