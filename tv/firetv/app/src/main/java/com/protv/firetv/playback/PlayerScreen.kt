package com.protv.firetv.playback

import android.util.Log
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.AudioAttributes
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import androidx.tv.material3.Button
import androidx.tv.material3.ButtonDefaults
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.protv.firetv.R
import java.io.IOException
import kotlinx.serialization.SerializationException
import retrofit2.HttpException

private val Midnight = Color(0xFF080C1B)
private val RoyalBlue = Color(0xFF2343A9)
private val ElectricBlue = Color(0xFF328BFF)

private sealed interface PlaybackState {
    data object Loading : PlaybackState
    data object Failed : PlaybackState
    data class Ready(val url: String) : PlaybackState
}

@Composable
fun PlayerScreen(titleId: String, title: String, repository: PlaybackRepository, onExit: () -> Unit) {
    BackHandler(onBack = onExit)
    var retry by remember { mutableIntStateOf(0) }
    val state by produceState<PlaybackState>(PlaybackState.Loading, titleId, retry) {
        value = PlaybackState.Loading
        try {
            value = PlaybackState.Ready(repository.hlsUrl(titleId))
        } catch (error: IOException) {
            Log.e("PROtvPlayback", "Network error loading playback", error)
            value = PlaybackState.Failed
        } catch (error: HttpException) {
            Log.e("PROtvPlayback", "HTTP error loading playback", error)
            value = PlaybackState.Failed
        } catch (error: SerializationException) {
            Log.e("PROtvPlayback", "Invalid playback response", error)
            value = PlaybackState.Failed
        } catch (error: IllegalArgumentException) {
            Log.e("PROtvPlayback", "Invalid playback data", error)
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
                is PlaybackState.Ready -> VideoPlayer(current.url, title, onRetry = { retry++ })
            }
        }
    }
}

@Composable
@OptIn(UnstableApi::class)
private fun VideoPlayer(url: String, title: String, onRetry: () -> Unit) {
    val context = LocalContext.current
    val player = remember(url) {
        ExoPlayer.Builder(context).build().apply {
            setAudioAttributes(AudioAttributes.DEFAULT, true)
        }
    }
    var buffering by remember(url) { mutableStateOf(true) }
    var failed by remember(url) { mutableStateOf(false) }

    DisposableEffect(player) {
        val listener = object : Player.Listener {
            override fun onPlaybackStateChanged(playbackState: Int) {
                buffering = playbackState == Player.STATE_BUFFERING || playbackState == Player.STATE_IDLE
            }

            override fun onPlayerError(error: PlaybackException) {
                Log.e("PROtvPlayback", "Mux stream playback failed", error)
                failed = true
            }
        }
        player.addListener(listener)
        player.setMediaItem(MediaItem.Builder().setUri(url).setMimeType(MimeTypes.APPLICATION_M3U8).build())
        player.prepare()
        player.playWhenReady = true
        onDispose {
            player.removeListener(listener)
            player.release()
        }
    }

    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        AndroidView(
            factory = { viewContext ->
                PlayerView(viewContext).apply {
                    useController = true
                    controllerAutoShow = true
                    this.player = player
                    isFocusable = true
                    post {
                        requestFocus()
                        showController()
                    }
                }
            },
            update = { it.player = player },
            modifier = Modifier.fillMaxSize(),
        )
        if (failed) {
            PlaybackMessage(title, stringResource(R.string.playback_error), onRetry = onRetry)
        } else if (buffering) {
            PlaybackMessage(title, stringResource(R.string.playback_buffering))
        }
    }
}

@Composable
private fun PlaybackMessage(title: String, message: String, onRetry: (() -> Unit)? = null) {
    Column(
        modifier = Modifier.background(Midnight.copy(alpha = 0.9f)).padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(title, color = Color.White, fontSize = 25.sp)
        Spacer(Modifier.height(16.dp))
        Text(message, color = Color(0xFFBEC8DD), fontSize = 20.sp)
        if (onRetry != null) {
            Spacer(Modifier.height(20.dp))
            Button(
                onClick = onRetry,
                colors = ButtonDefaults.colors(
                    containerColor = RoyalBlue,
                    focusedContainerColor = ElectricBlue,
                ),
            ) {
                Text(stringResource(R.string.catalog_retry))
            }
        }
    }
}
