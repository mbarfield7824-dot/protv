package com.protv.firetv.ui.home

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Button
import androidx.tv.material3.ButtonDefaults
import androidx.tv.material3.LocalContentColor
import androidx.tv.material3.Text
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.protv.firetv.R
import com.protv.firetv.ui.theme.ProTvColors
import com.protv.firetv.ui.theme.ProTvSpacing

/** Copy column width, matching the mockup's left-hand readability block. */
private val HeroTextWidth = 470.dp

/**
 * Screen-level cinematic artwork for the featured title. This is deliberately unbounded: the
 * caller stretches it across the whole home surface so the brand, navigation, hero copy and the
 * first rail all sit inside one continuous image field rather than on top of a hero rectangle.
 */
@Composable
fun HeroBackdrop(featured: HomeFeatured, modifier: Modifier = Modifier) {
    HeroArtwork(featured, modifier)
}

/**
 * The hero's text block: kicker, title, metadata, synopsis, Play and the featured indicator.
 * It carries no artwork and no fixed height so it can be laid over [HeroBackdrop].
 */
@Composable
fun HeroContent(
    featured: HomeFeatured,
    playFocusRequester: FocusRequester,
    upFocusRequester: FocusRequester?,
    downFocusRequester: FocusRequester?,
    onPlayFocused: () -> Unit,
    onPlay: () -> Unit,
    featuredPosition: Int,
    featuredCount: Int,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .padding(start = ProTvSpacing.SafeHorizontal)
            .width(HeroTextWidth),
    ) {
            Text(
                text = stringResource(R.string.hero_kicker),
                color = ProTvColors.Cyan,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = 1.sp,
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = featured.displayTitle,
                color = ProTvColors.White,
                fontSize = 42.sp,
                lineHeight = 46.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            if (featured.metadata.isNotEmpty()) {
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = featured.metadata.joinToString("  •  "),
                    color = ProTvColors.Silver,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (featured.description != null) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = featured.description,
                    color = ProTvColors.Silver,
                    fontSize = 15.sp,
                    lineHeight = 20.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Spacer(modifier = Modifier.height(16.dp))
            Button(
                onClick = onPlay,
                modifier = Modifier
                    .focusRequester(playFocusRequester)
                    // Explicit remote paths: UP returns to the current navigation item (composed
                    // alongside this button) and DOWN enters the first rail, instead of relying on
                    // geometric focus search across the layered composition.
                    .focusProperties {
                        up = upFocusRequester ?: FocusRequester.Cancel
                    }
                    .onPreviewKeyEvent {
                        if (it.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
                        when (it.key) {
                            Key.DirectionLeft -> onPrevious().let { true }
                            Key.DirectionRight -> onNext().let { true }
                            // Requested rather than declared so a not-yet-composed rail falls back
                            // to the default focus search instead of failing.
                            Key.DirectionDown ->
                                downFocusRequester != null &&
                                    runCatching { downFocusRequester.requestFocus() }.isSuccess
                            else -> false
                        }
                    }
                    .onPreviewKeyEvent {
                        if (it.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
                        when (it.key) {
                            Key.DirectionLeft -> onPrevious().let { true }
                            Key.DirectionRight -> onNext().let { true }
                            else -> false
                        }
                    }
                    .onFocusChanged { if (it.hasFocus) onPlayFocused() },
                colors = ButtonDefaults.colors(
                    containerColor = ProTvColors.Blue,
                    contentColor = ProTvColors.White,
                    focusedContainerColor = ProTvColors.ElectricBlue,
                    focusedContentColor = ProTvColors.Black,
                    pressedContainerColor = ProTvColors.Cyan,
                    pressedContentColor = ProTvColors.Black,
                ),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    PlayGlyph(LocalContentColor.current)
                    Spacer(modifier = Modifier.width(10.dp))
                    Text(stringResource(R.string.hero_play), fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                }
            }
            if (featuredCount > 1) {
                Spacer(modifier = Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    repeat(featuredCount) { index ->
                        Box(
                            modifier = Modifier
                                .size(width = if (index == featuredPosition) 22.dp else 7.dp, height = 5.dp)
                                .background(
                                    if (index == featuredPosition) ProTvColors.Cyan
                                    else ProTvColors.Muted.copy(alpha = 0.55f),
                                    RoundedCornerShape(3.dp),
                                ),
                        )
                    }
                }
            }
    }
}

/**
 * Full-surface cinematic artwork: anchored to the image's right/centre focal region, dimmed on the
 * left for copy legibility and faded into PROtv black at the bottom so the rails read as part of
 * the same field.
 */
@Composable
private fun HeroArtwork(featured: HomeFeatured, modifier: Modifier) {
    val context = LocalContext.current
    val sources = remember(featured.tile.id) { listOfNotNull(featured.stillUrl, featured.tile.artwork) }
    var sourceIndex by remember(featured.tile.id) { mutableIntStateOf(0) }
    val source = sources.getOrNull(sourceIndex)
    val isStill = source != null && source == featured.stillUrl

    Box(modifier = modifier.background(ProTvColors.Black)) {
        if (source != null) {
            val request = remember(featured.tile.id, sourceIndex) {
                ImageRequest.Builder(context)
                    .data(source)
                    .apply { if (!isStill) featured.tile.artworkCacheKey?.let { memoryCacheKey(it) } }
                    .crossfade(false)
                    .build()
            }
            AsyncImage(
                model = request,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                alignment = Alignment.CenterEnd,
                modifier = Modifier.fillMaxSize(),
                onError = { sourceIndex++ },
            )
        }
        Box(modifier = Modifier.fillMaxSize().background(ProTvColors.Black.copy(alpha = 0.18f)))
        Box(
            modifier = Modifier.fillMaxSize().background(
                Brush.horizontalGradient(
                    0f to ProTvColors.Black.copy(alpha = 0.95f),
                    0.30f to ProTvColors.Black.copy(alpha = 0.74f),
                    0.62f to Color.Transparent,
                ),
            ),
        )
        Box(
            modifier = Modifier.fillMaxSize().background(
                Brush.verticalGradient(
                    0f to ProTvColors.Black.copy(alpha = 0.58f),
                    0.16f to ProTvColors.Black.copy(alpha = 0.14f),
                    0.45f to ProTvColors.Black.copy(alpha = 0.30f),
                    0.66f to ProTvColors.Black.copy(alpha = 0.82f),
                    0.82f to ProTvColors.Black.copy(alpha = 0.96f),
                    1f to ProTvColors.Black,
                ),
            ),
        )
    }
}

@Composable
private fun PlayGlyph(color: Color) {
    Canvas(modifier = Modifier.size(14.dp)) {
        val path = Path().apply {
            moveTo(size.width * 0.12f, 0f)
            lineTo(size.width, size.height / 2f)
            lineTo(size.width * 0.12f, size.height)
            close()
        }
        drawPath(path, color)
    }
}
