package com.protv.firetv.playback

import android.view.KeyEvent
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import androidx.tv.material3.Button
import androidx.tv.material3.Text
import com.protv.firetv.data.api.FeatureRepository
import com.protv.firetv.data.api.LiveFeed
import com.protv.firetv.data.api.LiveItem
import com.protv.firetv.data.api.LivePlayback
import com.protv.firetv.ui.theme.ProTvButtons
import com.protv.firetv.ui.theme.ProTvColors
import com.protv.firetv.ui.theme.ProTvWordmark
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import retrofit2.HttpException
import java.io.IOException

private data class LiveLoad(val feed: LiveFeed? = null, val receivedAtMillis: Long = 0, val error: String? = null)

@Composable
fun LiveScreen(
    repository: FeatureRepository,
    remoteKeys: RemoteKeyDispatcher<KeyEvent>,
    onExit: () -> Unit,
) {
    var load by remember { mutableStateOf(LiveLoad()) }
    var guideOpen by remember { mutableStateOf(false) }
    var guideIndex by remember { mutableIntStateOf(0) }
    val focus = remember { FocusRequester() }

    LaunchedEffect(repository) {
        while (isActive) {
            val receivedAt = System.currentTimeMillis()
            val nextDelay = try {
                val feed = repository.live()
                load = LiveLoad(feed, receivedAt)
                feed.refreshAfterMs.coerceIn(1_000, 60_000)
            } catch (_: IOException) {
                load = load.copy(error = "Reconnecting to PROtv LIVE...")
                10_000
            } catch (_: HttpException) {
                load = load.copy(error = "PROtv LIVE is temporarily unavailable.")
                15_000
            } catch (_: IllegalArgumentException) {
                load = load.copy(error = "PROtv LIVE is not available on this Fire TV yet.")
                60_000
            }
            delay(nextDelay)
        }
    }

    val feed = load.feed
    val now = feed?.now
    val rows = remember(feed?.guide) { feed?.guide.orEmpty().filter { it.kind != "break" }.take(30) }
    val latestRows by rememberUpdatedState(rows)
    val latestGuideOpen by rememberUpdatedState(guideOpen)
    BackHandler {
        if (guideOpen) guideOpen = false else onExit()
    }
    LaunchedEffect(guideOpen, rows.size) {
        if (guideOpen && rows.isNotEmpty()) guideIndex = guideIndex.coerceIn(0, rows.lastIndex)
    }

    val context = LocalContext.current
    val player = remember { ExoPlayer.Builder(context).build() }
    DisposableEffect(Unit) { onDispose { player.release() } }
    LaunchedEffect(now?.entryId, now?.playback?.muxPlaybackId, now?.playback?.playbackToken, load.receivedAtMillis) {
        val playback = now?.playback
        if (playback == null) {
            player.pause()
            player.clearMediaItems()
            return@LaunchedEffect
        }
        val elapsedSeconds = ((System.currentTimeMillis() - load.receivedAtMillis).coerceAtLeast(0) / 1000.0)
        player.setMediaItem(MediaItem.Builder().setUri(playback.hlsUrl()).setMimeType(MimeTypes.APPLICATION_M3U8).build())
        player.prepare()
        player.seekTo(((playback.offsetSeconds + elapsedSeconds) * 1000).toLong())
        player.playWhenReady = true
    }
    DisposableEffect(remoteKeys, player) {
        val unregister = remoteKeys.register { event ->
            if (event.action != KeyEvent.ACTION_DOWN) return@register false
            when {
                latestGuideOpen && event.keyCode == KeyEvent.KEYCODE_DPAD_UP -> {
                    guideIndex = (guideIndex - 1).coerceAtLeast(0); true
                }
                latestGuideOpen && event.keyCode == KeyEvent.KEYCODE_DPAD_DOWN -> {
                    guideIndex = (guideIndex + 1).coerceAtMost(latestRows.lastIndex.coerceAtLeast(0)); true
                }
                latestGuideOpen && (event.keyCode in PlayerSelectKeys || event.keyCode == KeyEvent.KEYCODE_DPAD_LEFT) -> {
                    guideOpen = false; true
                }
                !latestGuideOpen && event.keyCode == KeyEvent.KEYCODE_DPAD_DOWN && latestRows.isNotEmpty() -> {
                    guideOpen = true
                    guideIndex = latestRows.indexOfFirst { it.onNow }.coerceAtLeast(0)
                    true
                }
                event.keyCode in PlayerSelectKeys || event.keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> {
                    if (player.isPlaying) player.pause() else player.play(); true
                }
                event.keyCode == KeyEvent.KEYCODE_MEDIA_PLAY -> { player.play(); true }
                event.keyCode == KeyEvent.KEYCODE_MEDIA_PAUSE -> { player.pause(); true }
                else -> false
            }
        }
        onDispose(unregister)
    }

    Box(
        Modifier.fillMaxSize().background(ProTvColors.Black)
            .focusRequester(focus).focusable(),
    ) {
        AndroidView(
            factory = {
                PlayerView(it).apply {
                    this.player = player
                    useController = false
                    isFocusable = false
                }
            },
            update = { it.player = player },
            modifier = Modifier.fillMaxSize(),
        )
        if (now?.playback == null) {
            Column(
                Modifier.fillMaxSize().padding(48.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                ProTvWordmark(fontSize = 38.sp)
                Spacer(Modifier.height(20.dp))
                Text("LIVE", color = ProTvColors.Cyan, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(12.dp))
                Text(now?.title ?: "PROtv LIVE", color = ProTvColors.White, fontSize = 32.sp, fontWeight = FontWeight.Bold)
                Text(load.error ?: now?.subtitle.orEmpty(), color = ProTvColors.Silver, fontSize = 18.sp)
                feed?.next?.let {
                    Spacer(Modifier.height(20.dp))
                    Text("Up next: ${it.startLabel.takeLastWhile { char -> char != ',' }} · ${it.title}",
                        color = ProTvColors.Cyan, fontSize = 17.sp)
                }
            }
        } else {
            Column(
                Modifier.align(Alignment.TopStart).padding(28.dp)
                    .background(Color.Black.copy(alpha = .62f), RoundedCornerShape(10.dp))
                    .padding(horizontal = 18.dp, vertical = 12.dp),
            ) {
                Text("ON NOW", color = ProTvColors.Cyan, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                Text(now.title, color = ProTvColors.White, fontSize = 28.sp, fontWeight = FontWeight.Bold)
                if (now.subtitle.isNotBlank()) Text(now.subtitle, color = ProTvColors.Silver, fontSize = 15.sp)
                feed?.next?.let { Text("Up next: ${it.title}", color = ProTvColors.Muted, fontSize = 14.sp) }
                Text("SELECT  Play/Pause     ▼  Guide     MENU  Back", color = ProTvColors.Muted, fontSize = 12.sp)
            }
        }
        if (guideOpen) LiveGuide(rows, guideIndex, Modifier.align(Alignment.CenterEnd))
        LaunchedEffect(Unit) { focus.requestFocus() }
    }
}

private fun LivePlayback.hlsUrl(): String {
    require(muxPlaybackId.matches(Regex("[A-Za-z0-9]+"))) { "Invalid LIVE playback ID" }
    val base = "https://stream.mux.com/$muxPlaybackId.m3u8"
    return playbackToken?.takeIf { it.matches(Regex("[A-Za-z0-9_.-]+")) }?.let { "$base?token=$it" } ?: base
}

@Composable
private fun LiveGuide(rows: List<LiveItem>, selected: Int, modifier: Modifier = Modifier) {
    Column(
        modifier.width(560.dp).fillMaxSize().background(ProTvColors.Midnight.copy(alpha = .96f))
            .border(1.dp, ProTvColors.ElectricBlue, RoundedCornerShape(8.dp)).padding(22.dp),
    ) {
        Text("PROtv LIVE Guide", color = ProTvColors.White, fontSize = 28.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(14.dp))
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            itemsIndexed(rows, key = { _, item -> item.entryId.ifBlank { item.startAt } }) { index, item ->
                val active = index == selected
                Row(
                    Modifier.fillMaxWidth().background(
                        if (active) ProTvColors.ElectricBlue else ProTvColors.Navy,
                        RoundedCornerShape(6.dp),
                    ).padding(horizontal = 14.dp, vertical = 11.dp),
                ) {
                    Text(if (item.onNow) "ON NOW" else item.startLabel.substringAfterLast(", "),
                        color = if (active) Color.White else ProTvColors.Cyan, fontSize = 14.sp,
                        modifier = Modifier.width(105.dp))
                    Text(item.title, color = ProTvColors.White, fontSize = 16.sp, maxLines = 1,
                        overflow = TextOverflow.Ellipsis)
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        Text("▲▼ Browse   SELECT  Close guide   MENU  Leave LIVE", color = ProTvColors.Muted, fontSize = 12.sp)
    }
}
