package com.protv.firetv.ui.home

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Border
import androidx.tv.material3.Card
import androidx.tv.material3.CardDefaults
import androidx.tv.material3.Text
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.protv.firetv.R
import com.protv.firetv.ui.theme.ProTvColors

/** Mockup card footprint: a tighter 16:9 tile so several rail cards share the first viewport. */
val CardWidth = 150.dp
private val CardShape = RoundedCornerShape(6.dp)

@Composable
fun ContentCard(
    tile: HomeTile,
    focusRequester: FocusRequester,
    onFocused: () -> Unit,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val interactionSource = remember { MutableInteractionSource() }
    val focused by interactionSource.collectIsFocusedAsState()

    Column(modifier = modifier.width(CardWidth)) {
        Card(
            onClick = onClick,
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(16f / 9f)
                .focusRequester(focusRequester)
                .onFocusChanged { if (it.isFocused || it.hasFocus) onFocused() },
            shape = CardDefaults.shape(CardShape),
            colors = CardDefaults.colors(
                containerColor = ProTvColors.Midnight,
                focusedContainerColor = ProTvColors.Navy,
                pressedContainerColor = ProTvColors.Navy,
            ),
            scale = CardDefaults.scale(focusedScale = 1.05f, pressedScale = 1.02f),
            border = CardDefaults.border(
                border = Border(BorderStroke(1.dp, ProTvColors.Line), shape = CardShape),
                focusedBorder = Border(BorderStroke(2.dp, ProTvColors.Cyan), shape = CardShape),
                pressedBorder = Border(BorderStroke(2.dp, ProTvColors.ElectricBlue), shape = CardShape),
            ),
            interactionSource = interactionSource,
        ) {
            CardArtwork(tile)
        }
        Spacer(modifier = Modifier.height(6.dp))
        Text(
            text = tile.title.ifBlank { stringResource(R.string.title_unavailable) },
            color = if (focused) ProTvColors.White else ProTvColors.Silver,
            fontSize = 13.sp,
            fontWeight = if (focused) FontWeight.SemiBold else FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (tile.meta != null) {
            Text(
                text = tile.meta,
                color = ProTvColors.Muted,
                fontSize = 11.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun CardArtwork(tile: HomeTile) {
    var failed by remember(tile.id) { mutableStateOf(false) }
    var usingFallback by remember(tile.id) { mutableStateOf(false) }
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        if ((tile.artwork == null && tile.fallbackArtwork == null) || (failed && usingFallback)) {
            Text(
                text = "PROtv\n${tile.title}",
                color = ProTvColors.White,
                fontSize = 17.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(16.dp),
            )
        } else if (tile.artwork == null || usingFallback) {
            ArtworkImage(tile, tile.fallbackArtwork, onError = {
                usingFallback = true
                failed = true
            })
        } else {
            ArtworkImage(tile, tile.artwork, onError = {
                if (tile.fallbackArtwork != null) usingFallback = true else failed = true
            })
        }
    }
}

/**
 * Landscape artwork is cropped full-bleed. Strongly portrait artwork (posters) would lose its
 * title block under a crop, so it is presented adaptively: the same image cropped and darkened
 * behind, and the whole image fitted on top. No blur — API 25 renders both layers cheaply from
 * one cached bitmap.
 */
@Composable
private fun ArtworkImage(tile: HomeTile, source: Any?, onError: () -> Unit) {
    val context = LocalContext.current
    val request = remember(tile.id, source) {
        ImageRequest.Builder(context)
            .data(source)
            .apply {
                if (source === tile.artwork) {
                    tile.artworkCacheKey?.let { memoryCacheKey(it) }
                }
            }
            .allowRgb565(true)
            .crossfade(false)
            .build()
    }
    var portrait by remember(tile.id, source) { mutableStateOf(false) }
    Box(modifier = Modifier.fillMaxSize()) {
        AsyncImage(
            model = request,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
            onSuccess = { state ->
                val drawable = state.result.drawable
                portrait = drawable.intrinsicWidth > 0 &&
                    drawable.intrinsicHeight > drawable.intrinsicWidth * PortraitRatio
            },
            onError = { onError() },
        )
        if (portrait) {
            Box(modifier = Modifier.fillMaxSize().background(ProTvColors.Black.copy(alpha = 0.62f)))
            AsyncImage(
                model = request,
                contentDescription = null,
                contentScale = ContentScale.Fit,
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

/** Above this height:width ratio a crop would cut a poster's title block, so fit it instead. */
private const val PortraitRatio = 1.15f
