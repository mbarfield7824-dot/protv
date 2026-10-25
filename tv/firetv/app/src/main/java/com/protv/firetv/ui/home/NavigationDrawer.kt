package com.protv.firetv.ui.home

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEvent
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.tv.material3.Border
import androidx.tv.material3.Button
import androidx.tv.material3.ButtonDefaults
import androidx.tv.material3.Glow
import androidx.tv.material3.Text
import com.protv.firetv.ui.theme.ProTvColors
import com.protv.firetv.ui.theme.ProTvWordmark
import kotlinx.coroutines.delay

internal const val DrawerAnimationMillis = 225

internal enum class DrawerKeyAction { Close, Consume, Navigate }

internal fun drawerKeyAction(key: Key): DrawerKeyAction = when (key) {
    Key.DirectionRight, Key.Back -> DrawerKeyAction.Close
    Key.DirectionLeft -> DrawerKeyAction.Consume
    else -> DrawerKeyAction.Navigate
}

internal fun Modifier.openDrawerOnLeft(
    requester: FocusRequester,
    onOpen: (FocusRequester) -> Unit,
): Modifier = onPreviewKeyEvent { event ->
    if (event.key != Key.DirectionLeft) false
    else {
        if (event.type == KeyEventType.KeyDown && event.nativeKeyEvent.repeatCount == 0) onOpen(requester)
        true
    }
}

/** A separate focus window keeps navigation modal without changing the content's layout or focus tree. */
@Composable
internal fun NavigationDrawer(
    destination: HomeDestination,
    onSelect: (HomeDestination) -> Unit,
    destinations: List<HomeDestination> = HomeDestination.entries,
    content: @Composable (openDrawer: (FocusRequester) -> Unit, drawerOpen: Boolean) -> Unit,
) {
    var returnFocus by remember { mutableStateOf<FocusRequester?>(null) }
    var expanded by remember { mutableStateOf(false) }
    var closing by remember { mutableStateOf(false) }
    var selected by remember { mutableStateOf<HomeDestination?>(null) }
    var pendingRestore by remember { mutableStateOf<FocusRequester?>(null) }
    val requesters = remember { HomeDestination.entries.associateWith { FocusRequester() } }
    LaunchedEffect(pendingRestore) {
        pendingRestore?.let {
            withFrameNanos { }
            it.requestFocus()
            pendingRestore = null
        }
    }
    content({ requester ->
        if (returnFocus == null) {
            returnFocus = requester
            selected = null
            closing = false
        }
    }, returnFocus != null)
    if (returnFocus == null) return

    val slide by animateFloatAsState(if (expanded) 0f else -1f, tween(DrawerAnimationMillis), label = "navigation drawer")
    fun close(next: HomeDestination? = null) {
        if (!closing) {
            selected = next
            closing = true
            expanded = false
        }
    }
    LaunchedEffect(closing) {
        if (closing) {
            delay(DrawerAnimationMillis.toLong())
            val restore = returnFocus
            val next = selected
            returnFocus = null
            if (next == null || next == destination) pendingRestore = restore
            if (next != null) onSelect(next)
        } else {
            withFrameNanos { }
            expanded = true
            // Only entries in `destinations` are composed, so focus one that is on screen.
            requesters.getValue(if (destination in destinations) destination else HomeDestination.Home).requestFocus()
        }
    }
    Dialog(
        onDismissRequest = { close() },
        properties = DialogProperties(usePlatformDefaultWidth = false, dismissOnClickOutside = false),
    ) {
        Box(
            Modifier.fillMaxSize().background(Color.Black.copy(alpha = (slide + 1f) * .55f))
                .onPreviewKeyEvent { event: KeyEvent ->
                    if (closing) true
                    else when (drawerKeyAction(event.key)) {
                        DrawerKeyAction.Close -> {
                            if (event.type == KeyEventType.KeyDown) close()
                            true
                        }
                        DrawerKeyAction.Consume -> true
                        DrawerKeyAction.Navigate -> false
                    }
                },
        ) {
            Column(
                Modifier.width(180.dp).fillMaxHeight()
                    .graphicsLayer { translationX = size.width * slide }
                    .background(Brush.verticalGradient(listOf(ProTvColors.Midnight, ProTvColors.Indigo, ProTvColors.Black)))
                    .padding(start = 10.dp, end = 10.dp, top = 22.dp, bottom = 12.dp),
            ) {
                ProTvWordmark(Modifier.padding(start = 10.dp, bottom = 22.dp), fontSize = 29.sp)
                destinations.forEach { entry ->
                    var focused by remember { mutableStateOf(false) }
                    Button(
                        onClick = { close(entry) },
                        modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp).height(32.dp)
                            .focusRequester(requesters.getValue(entry))
                            .onFocusChanged { focused = it.hasFocus }
                            .focusProperties {
                                left = FocusRequester.Cancel
                                right = FocusRequester.Cancel
                                if (entry == HomeDestination.Home) up = FocusRequester.Cancel
                                if (entry == HomeDestination.Settings) down = FocusRequester.Cancel
                            },
                        shape = ButtonDefaults.shape(RoundedCornerShape(6.dp)),
                        colors = ButtonDefaults.colors(
                            containerColor = if (entry == destination) ProTvColors.Violet.copy(alpha = .5f) else Color.Transparent,
                            contentColor = ProTvColors.Silver,
                            focusedContainerColor = ProTvColors.Blue,
                            focusedContentColor = ProTvColors.White,
                        ),
                        border = ButtonDefaults.border(
                            border = Border.None,
                            focusedBorder = Border(BorderStroke(1.dp, ProTvColors.ElectricBlue), shape = RoundedCornerShape(6.dp)),
                        ),
                        glow = ButtonDefaults.glow(focusedGlow = Glow(elevationColor = ProTvColors.ElectricBlue, elevation = 12.dp)),
                        scale = ButtonDefaults.scale(focusedScale = 1.02f),
                        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                    ) {
                        NavigationGlyph(entry)
                        Spacer(Modifier.width(9.dp))
                        Text(entry.label, fontSize = 11.sp, fontWeight = if (focused) FontWeight.Bold else FontWeight.Medium)
                    }
                }
            }
        }
    }
}
