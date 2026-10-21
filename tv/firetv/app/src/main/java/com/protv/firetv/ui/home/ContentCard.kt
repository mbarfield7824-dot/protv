package com.protv.firetv.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Border
import androidx.tv.material3.Card
import androidx.tv.material3.CardDefaults
import androidx.tv.material3.Glow
import androidx.tv.material3.Text
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.protv.firetv.R
import com.protv.firetv.data.api.ArtworkFit
import com.protv.firetv.data.api.artworkFitFor
import com.protv.firetv.ui.theme.ProTvColors
import com.protv.firetv.ui.theme.ProTvWordmark

/** Artwork-first tiles sized for full-width browsing with the drawer hidden. */
val CardWidth = 160.dp
val CardArtworkHeight = 204.dp
val CardTitleHeight = 34.dp
val CardMetaHeight = 16.dp
const val CardAspectRatio = 16f / 9f
const val PosterCardAspectRatio = 2f / 3f
const val SquareCardAspectRatio = 1f

/** The source image's dimensions, not the upload form's field name, decide card shape. */
internal fun cardAspectFor(imageRatio: Float?, posterStyle: Boolean): Float = when {
    imageRatio == null || !imageRatio.isFinite() || imageRatio <= 0f -> if (posterStyle) PosterCardAspectRatio else CardAspectRatio
    imageRatio < 0.85f -> PosterCardAspectRatio
    imageRatio <= 1.18f -> SquareCardAspectRatio
    else -> CardAspectRatio
}
private val CardShape = RoundedCornerShape(8.dp)

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

    // Every card occupies an identical slot; loaded images keep their original proportions.
    Column(modifier = modifier.width(CardWidth)) {
        Card(
            onClick = onClick,
            modifier = Modifier
                .fillMaxWidth()
                .height(CardArtworkHeight)
                .focusRequester(focusRequester)
                .onFocusChanged { if (it.isFocused || it.hasFocus) onFocused() },
            shape = CardDefaults.shape(CardShape),
            colors = CardDefaults.colors(
                containerColor = androidx.compose.ui.graphics.Color.Transparent,
                focusedContainerColor = androidx.compose.ui.graphics.Color.Transparent,
                pressedContainerColor = androidx.compose.ui.graphics.Color.Transparent,
            ),
            scale = CardDefaults.scale(focusedScale = 1.045f, pressedScale = 1.02f),
            border = CardDefaults.border(
                border = Border.None,
                focusedBorder = Border.None,
                pressedBorder = Border.None,
            ),
            glow = CardDefaults.glow(
                focusedGlow = Glow(elevationColor = ProTvColors.ElectricBlue, elevation = 12.dp),
            ),
            interactionSource = interactionSource,
        ) {
            CardArtwork(tile, focused)
        }
        // Fixed spacing clears the focused scale so the label never jumps or hides under the card.
        Spacer(modifier = Modifier.height(7.dp))
        Text(
            text = tile.title.ifBlank { stringResource(R.string.title_unavailable) },
            color = if (focused) ProTvColors.White else ProTvColors.Silver,
            fontSize = 12.sp,
            lineHeight = 16.sp,
            fontWeight = if (focused) FontWeight.Bold else FontWeight.Medium,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.fillMaxWidth().height(CardTitleHeight),
        )
        if (tile.meta != null) {
            Text(
                text = tile.meta,
                color = if (focused) ProTvColors.ElectricBlue else ProTvColors.Muted,
                fontSize = 11.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.height(CardMetaHeight),
            )
        } else {
            Spacer(Modifier.height(CardMetaHeight))
        }
    }
}

@Composable
private fun CardArtwork(tile: HomeTile, focused: Boolean) {
    var usingFallback by remember(tile.id) { mutableStateOf(tile.artwork == null) }
    var failed by remember(tile.id) { mutableStateOf(tile.artwork == null && tile.fallbackArtwork == null) }
    if (failed) {
        Box(Modifier.fillMaxSize().border(if (focused) 3.dp else 0.dp, ProTvColors.White, CardShape)) {
            BrandedTitlePanel(tile.title)
        }
        return
    }
    val source = if (usingFallback) tile.fallbackArtwork else tile.artwork
    ArtworkFrame(
        source = source,
        cacheKey = tile.artworkCacheKey.takeIf { !usingFallback },
        onError = { if (!usingFallback && tile.fallbackArtwork != null) usingFallback = true else failed = true },
        modifier = Modifier.fillMaxSize(),
        focused = focused,
        progressFraction = tile.progressFraction,
        targetAspectRatio = CardWidth.value / CardArtworkHeight.value,
    )
}

/**
 * Only one image is rendered. Contained art has its focus border on the actual image bounds.
 */
@Composable
internal fun ArtworkFrame(
    source: Any?,
    cacheKey: String?,
    onError: () -> Unit,
    modifier: Modifier = Modifier,
    targetAspectRatio: Float = CardAspectRatio,
    focused: Boolean = false,
    progressFraction: Float? = null,
    onImageAspectRatio: (Float) -> Unit = {},
) {
    val context = LocalContext.current
    val request = remember(source, cacheKey) {
        ImageRequest.Builder(context)
            .data(source)
            .apply { cacheKey?.let { memoryCacheKey(it) } }
            .allowRgb565(true)
            .crossfade(false)
            .build()
    }
    var fit by remember(source, targetAspectRatio) { mutableStateOf(ArtworkFit.Fit) }
    var imageAspectRatio by remember(source) { mutableFloatStateOf(targetAspectRatio) }
    BoxWithConstraints(
        modifier = modifier,
        contentAlignment = Alignment.Center,
    ) {
        val availableRatio = maxWidth / maxHeight
        val imageWidth = if (fit == ArtworkFit.Crop || imageAspectRatio >= availableRatio) maxWidth else maxHeight * imageAspectRatio
        val imageHeight = if (fit == ArtworkFit.Crop || imageAspectRatio <= availableRatio) maxHeight else maxWidth / imageAspectRatio
        Box(
            Modifier.size(imageWidth, imageHeight).clip(CardShape)
                .border(
                    if (focused) 3.dp else 0.dp,
                    if (focused) ProTvColors.White else androidx.compose.ui.graphics.Color.Transparent,
                    CardShape,
                ),
        ) {
            AsyncImage(
                model = request,
                contentDescription = null,
                contentScale = if (fit == ArtworkFit.Crop) ContentScale.Crop else ContentScale.Fit,
                modifier = Modifier.fillMaxSize(),
                onSuccess = { state ->
                    val drawable = state.result.drawable
                    fit = artworkFitFor(drawable.intrinsicWidth, drawable.intrinsicHeight, targetAspectRatio)
                    if (drawable.intrinsicWidth > 0 && drawable.intrinsicHeight > 0) {
                        imageAspectRatio = drawable.intrinsicWidth.toFloat() / drawable.intrinsicHeight
                        onImageAspectRatio(imageAspectRatio)
                    }
                },
                onError = { onError() },
            )
            progressFraction?.let { fraction ->
                Box(Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(4.dp).height(3.dp)
                    .background(ProTvColors.Muted, RoundedCornerShape(2.dp))) {
                    Box(Modifier.fillMaxWidth(fraction).height(3.dp)
                        .background(ProTvColors.ElectricBlue, RoundedCornerShape(2.dp)))
                }
            }
        }
    }
}

/** A designed card for titles without artwork: brand wordmark over the brand gradient. */
@Composable
private fun BrandedTitlePanel(title: String) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Brush.linearGradient(listOf(ProTvColors.Blue, ProTvColors.Navy, ProTvColors.Indigo))),
    ) {
        ProTvWordmark(fontSize = 18.sp, modifier = Modifier.align(Alignment.TopStart).padding(10.dp))
        Text(
            text = title.ifBlank { stringResource(R.string.title_unavailable) },
            color = ProTvColors.White,
            fontSize = 15.sp,
            lineHeight = 18.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            maxLines = 4,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.align(Alignment.Center).padding(horizontal = 10.dp),
        )
    }
}
