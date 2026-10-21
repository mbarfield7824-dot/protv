package com.protv.firetv.ui.home

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
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
import com.protv.firetv.ui.theme.ProTvAtmosphere
import com.protv.firetv.ui.theme.ProTvButtonShape
import com.protv.firetv.ui.theme.ProTvButtons
import com.protv.firetv.ui.theme.ProTvColors
import com.protv.firetv.ui.theme.ProTvSpacing
import com.protv.firetv.ui.theme.ProTvWordmark

/** Copy column width: the left-hand readability block of the cinematic field. */
private val HeroTextWidth = 470.dp

/** Height of the key-art poster shown when the featured title only has portrait artwork. */
private val HeroPosterHeight = 300.dp

private val TitleShadow = Shadow(color = Color.Black.copy(alpha = 0.7f), offset = Offset(0f, 3f), blurRadius = 14f)

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
 * The hero's text block: branded kicker, title, metadata chips, synopsis, Play and the featured
 * indicator. It carries no artwork and no fixed height so it can be laid over [HeroBackdrop].
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
    onMoreInfo: () -> Unit = {},
    onOpenDrawer: () -> Unit = {},
) {
    Column(
        modifier = modifier
            .padding(start = 20.dp, top = 22.dp, end = 12.dp)
            .width(HeroTextWidth),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(width = 26.dp, height = 3.dp)
                    .background(Brush.horizontalGradient(listOf(ProTvColors.Blue, ProTvColors.Cyan))),
            )
            Spacer(modifier = Modifier.width(10.dp))
            Text(
                text = stringResource(
                    if ((featured.tile.addedAt ?: 0) >= System.currentTimeMillis() - 30L * 24 * 60 * 60 * 1000)
                        R.string.hero_kicker_new else R.string.hero_kicker_lead,
                ).uppercase(),
                color = ProTvColors.Silver,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = 2.sp,
            )
            Spacer(modifier = Modifier.width(7.dp))
            ProTvWordmark(fontSize = 17.sp)
        }
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = featured.displayTitle,
            color = ProTvColors.White,
            style = TextStyle(shadow = TitleShadow),
            fontSize = 36.sp,
            lineHeight = 39.sp,
            fontWeight = FontWeight.ExtraBold,
            letterSpacing = (-0.5).sp,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        if (featured.metadata.isNotEmpty()) {
            Spacer(modifier = Modifier.height(8.dp))
            MetadataChips(featured.metadata, featured.category)
        }
        if (featured.description != null) {
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = featured.description,
                color = ProTvColors.Silver,
                style = TextStyle(shadow = TitleShadow),
                fontSize = 13.sp,
                lineHeight = 17.sp,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(modifier = Modifier.height(12.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Button(
                onClick = onPlay,
                modifier = Modifier
                    .focusRequester(playFocusRequester)
                    .focusProperties {
                        up = upFocusRequester ?: FocusRequester.Cancel
                    }
                    .onPreviewKeyEvent {
                        if (it.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
                        when (it.key) {
                            Key.DirectionLeft -> {
                                if (it.nativeKeyEvent.repeatCount == 0) onOpenDrawer()
                                true
                            }
                            // Requested rather than declared so a not-yet-composed rail falls back
                            // to the default focus search instead of failing.
                            Key.DirectionDown ->
                                downFocusRequester != null &&
                                    runCatching { downFocusRequester.requestFocus() }.isSuccess
                            else -> false
                        }
                    }
                    .onFocusChanged { if (it.hasFocus) onPlayFocused() },
                shape = ButtonDefaults.shape(ProTvButtonShape),
                colors = ProTvButtons.primary(),
                scale = ButtonDefaults.scale(focusedScale = 1.06f),
                contentPadding = PaddingValues(horizontal = 22.dp, vertical = 8.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    PlayGlyph(LocalContentColor.current)
                    Spacer(modifier = Modifier.width(12.dp))
                    Text(stringResource(R.string.hero_play), fontSize = 16.sp, fontWeight = FontWeight.Bold)
                }
            }
            Spacer(modifier = Modifier.width(12.dp))
            Button(
                onClick = onMoreInfo,
                modifier = Modifier.focusProperties {
                    down = downFocusRequester ?: FocusRequester.Default
                }.onFocusChanged { if (it.hasFocus) onPlayFocused() },
                colors = ProTvButtons.secondary(),
                border = ProTvButtons.secondaryBorder(),
                shape = ButtonDefaults.shape(ProTvButtonShape),
                contentPadding = PaddingValues(horizontal = 18.dp, vertical = 8.dp),
            ) { Text("More Info", fontSize = 15.sp) }
            if (featuredCount > 1) {
                Spacer(Modifier.width(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Button(onClick = onPrevious, contentPadding = PaddingValues(horizontal = 6.dp, vertical = 2.dp),
                        colors = ProTvButtons.secondary(), shape = ButtonDefaults.shape(ProTvButtonShape)) {
                        Text("<", fontSize = 12.sp)
                    }
                    FeaturedIndicator(featuredPosition, featuredCount)
                    Button(onClick = onNext, contentPadding = PaddingValues(horizontal = 6.dp, vertical = 2.dp),
                        colors = ProTvButtons.secondary(), shape = ButtonDefaults.shape(ProTvButtonShape)) {
                        Text(">", fontSize = 12.sp)
                    }
                }
            }
        }
    }
}

/** Website-style metadata pills: the category is highlighted in brand blue, the rest outlined. */
@Composable
private fun MetadataChips(metadata: List<String>, category: String?) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        metadata.forEach { value ->
            val highlighted = value == category
            val shape = RoundedCornerShape(50)
            Text(
                text = value,
                color = ProTvColors.White,
                fontSize = 13.sp,
                fontWeight = if (highlighted) FontWeight.Bold else FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier
                    .clip(shape)
                    .background(
                        if (highlighted) {
                            Brush.horizontalGradient(listOf(ProTvColors.Blue, ProTvColors.BlueBright))
                        } else {
                            Brush.horizontalGradient(
                                listOf(ProTvColors.Black.copy(alpha = 0.45f), ProTvColors.Black.copy(alpha = 0.45f)),
                            )
                        },
                    )
                    .border(
                        BorderStroke(1.dp, if (highlighted) ProTvColors.ElectricBlue else ProTvColors.ControlBorder),
                        shape,
                    )
                    .padding(horizontal = 12.dp, vertical = 4.dp),
            )
        }
    }
}

/** Non-focusable position dots between the explicit previous/next actions. */
@Composable
private fun FeaturedIndicator(position: Int, count: Int) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            repeat(count) { index ->
                Box(
                    modifier = Modifier
                        .size(width = if (index == position) 24.dp else 8.dp, height = 6.dp)
                        .background(
                            if (index == position) {
                                Brush.horizontalGradient(listOf(ProTvColors.ElectricBlue, ProTvColors.Cyan))
                            } else {
                                Brush.horizontalGradient(
                                    listOf(ProTvColors.Muted.copy(alpha = 0.5f), ProTvColors.Muted.copy(alpha = 0.5f)),
                                )
                            },
                            RoundedCornerShape(3.dp),
                        ),
                )
            }
        }
    }
}

/**
 * Full-surface cinematic field. Landscape art (the catalog backdrop or a Mux still) fills the
 * right of the screen and fades into the brand atmosphere; portrait-only titles get a framed key-art
 * poster on the brand atmosphere; with no artwork at all the branded atmosphere and a
 * large PROtv watermark remain, so the hero is never an empty black field.
 */
@Composable
private fun HeroArtwork(featured: HomeFeatured, modifier: Modifier) {
    val sources = remember(featured) { heroBackdropSources(featured) }
    var sourceIndex by remember(featured) { mutableIntStateOf(0) }
    val source = sources.getOrNull(sourceIndex)
    val isPoster = source != null && source == featured.tile.artwork &&
        source != featured.stillUrl && source != featured.backdropArtwork

    Box(modifier = modifier) {
        ProTvAtmosphere(Modifier.fillMaxSize())
        when {
            source == null -> BrandWatermark(Modifier.align(Alignment.CenterEnd))
            isPoster -> PosterKeyArt(
                source = source,
                cacheKey = featured.tile.artworkCacheKey,
                onError = { sourceIndex++ },
            )
            else -> LandscapeArt(
                source = source,
                onError = { sourceIndex++ },
                modifier = Modifier.align(Alignment.TopEnd),
            )
        }
        // Copy legibility on the left and a fade into the rails at the bottom; lighter than a
        // full-screen dim so the artwork stays vivid.
        Box(
            modifier = Modifier.fillMaxSize().background(
                Brush.horizontalGradient(
                    0f to ProTvColors.Black.copy(alpha = 0.82f),
                    0.32f to ProTvColors.Black.copy(alpha = 0.5f),
                    0.58f to Color.Transparent,
                ),
            ),
        )
        Box(
            modifier = Modifier.fillMaxSize().background(
                Brush.verticalGradient(
                    0f to ProTvColors.Black.copy(alpha = 0.5f),
                    0.16f to Color.Transparent,
                    0.62f to Color.Transparent,
                    0.86f to ProTvColors.Black.copy(alpha = 0.88f),
                    1f to ProTvColors.Black,
                ),
            ),
        )
    }
}

@Composable
private fun LandscapeArt(source: Any, onError: () -> Unit, modifier: Modifier) {
    val context = LocalContext.current
    val request = remember(source) {
        ImageRequest.Builder(context).data(source).crossfade(true).build()
    }
    Box(modifier = modifier.fillMaxWidth(0.72f).fillMaxHeight(0.84f)) {
        AsyncImage(
            model = request,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
            onError = { onError() },
        )
        // Feather the left and bottom edges into the atmosphere instead of a hard image edge.
        Box(
            Modifier.fillMaxSize().background(
                Brush.horizontalGradient(
                    0f to ProTvColors.Midnight,
                    0.28f to ProTvColors.Midnight.copy(alpha = 0.55f),
                    0.55f to Color.Transparent,
                ),
            ),
        )
        Box(
            Modifier.fillMaxSize().background(
                Brush.verticalGradient(
                    0.55f to Color.Transparent,
                    1f to ProTvColors.Indigo,
                ),
            ),
        )
    }
}

@Composable
private fun PosterKeyArt(source: Any, cacheKey: String?, onError: () -> Unit) {
    Box(modifier = Modifier.fillMaxSize()) {
        Box(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(top = 104.dp, end = ProTvSpacing.SafeHorizontal + 24.dp)
                .height(HeroPosterHeight)
                .aspectRatio(2f / 3f)
                .background(ProTvColors.BlueGlow, RoundedCornerShape(14.dp))
                .padding(3.dp),
        ) {
            ArtworkFrame(
                source = source,
                cacheKey = cacheKey,
                onError = onError,
                targetAspectRatio = 2f / 3f,
                modifier = Modifier
                    .fillMaxSize()
                    .clip(RoundedCornerShape(12.dp))
                    .border(BorderStroke(1.dp, ProTvColors.White.copy(alpha = 0.28f)), RoundedCornerShape(12.dp)),
            )
        }
    }
}

@Composable
private fun BrandWatermark(modifier: Modifier) {
    ProTvWordmark(
        fontSize = 210.sp,
        modifier = modifier
            .padding(end = ProTvSpacing.SafeHorizontal)
            .graphicsLayer { alpha = 0.09f },
    )
}

@Composable
private fun PlayGlyph(color: Color) {
    Canvas(modifier = Modifier.size(15.dp)) {
        val path = Path().apply {
            moveTo(size.width * 0.12f, 0f)
            lineTo(size.width, size.height / 2f)
            lineTo(size.width * 0.12f, size.height)
            close()
        }
        drawPath(path, color)
    }
}
