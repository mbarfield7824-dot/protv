package com.protv.firetv.ui.home

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.BringIntoViewSpec
import androidx.compose.foundation.gestures.LocalBringIntoViewSpec
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.tv.material3.Button
import androidx.tv.material3.Text
import com.protv.firetv.ui.theme.ProTvAtmosphere
import com.protv.firetv.ui.theme.ProTvButtons
import com.protv.firetv.ui.theme.ProTvColors
import com.protv.firetv.R
import kotlinx.coroutines.delay

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun PremiumHome(
    controller: HomeController,
    rails: List<HomeRail>,
    featuredTitles: List<HomeFeatured>,
    onSelect: (HomeTile) -> Unit,
    accountLabel: String?,
    accountError: String?,
    accountLoading: Boolean,
    onAccountClick: () -> Unit,
    onAccountRetry: () -> Unit,
    onRefreshClick: () -> Unit,
    onOpenDrawer: (FocusRequester) -> Unit,
    drawerOpen: Boolean,
    catalogLoading: Boolean = false,
    catalogError: String? = null,
) {
    val destination = controller.destination
    val visibleRails = remember(rails, destination) { destinationRails(rails, destination) }
    val playRequester = remember { FocusRequester() }
    val settingsRequester = remember { FocusRequester() }
    val emptyRequester = remember { FocusRequester() }
    var emptyFocused by remember { mutableStateOf(false) }
    val rowRequesters = remember(visibleRails.map { it.key }) {
        visibleRails.associate { it.key to FocusRequester() }
    }
    var info by remember { mutableStateOf<HomeFeatured?>(null) }
    val featured = featuredTitles.getOrNull(controller.featuredIndex.coerceIn(0, featuredTitles.lastIndex.coerceAtLeast(0)))
    val showHero = destination == HomeDestination.Home && featured != null
    val firstCard = visibleRails.firstOrNull()?.let { rowRequesters.getValue(it.key) }
    val density = LocalDensity.current
    val verticalSpec = remember(density) {
        object : BringIntoViewSpec {
            override fun calculateScrollDistance(offset: Float, size: Float, containerSize: Float): Float {
                val margin = with(density) { 18.dp.toPx() }
                return when {
                    offset < margin -> offset - margin
                    offset + size > containerSize - margin -> offset + size - containerSize + margin
                    else -> 0f
                }
            }
        }
    }
    val horizontalSpec = remember(density) {
        object : BringIntoViewSpec {
            override fun calculateScrollDistance(offset: Float, size: Float, containerSize: Float): Float {
                val margin = with(density) { 20.dp.toPx() }
                return when {
                    offset < margin -> offset - margin
                    offset + size > containerSize - margin -> offset + size - containerSize + margin
                    else -> 0f
                }
            }
        }
    }
    LaunchedEffect(featuredTitles, controller.rotationResetToken, drawerOpen, info, controller.heroFocused) {
        while (featuredTitles.size > 1 && !drawerOpen && info == null && !controller.heroFocused) {
            delay(10_000)
            controller.rotateFeatured(featuredTitles.size)
        }
    }
    LaunchedEffect(destination, catalogLoading, controller.navigationToken) {
        if (drawerOpen) return@LaunchedEffect
        withFrameNanos { }
        if (controller.focusedTileId == null) {
            if (destination == HomeDestination.Settings) settingsRequester.requestFocus()
            else if (showHero) playRequester.requestFocus()
            else if (firstCard != null) firstCard.requestFocus()
            else emptyRequester.requestFocus()
        }
    }
    Box(Modifier.fillMaxSize().background(ProTvColors.Black)) {
        Box(Modifier.fillMaxSize()
            .focusRequester(emptyRequester)
            .onFocusChanged { emptyFocused = it.isFocused }
            .onKeyEvent {
                if (emptyFocused && it.key == Key.DirectionLeft) {
                    if (it.type == KeyEventType.KeyDown && it.nativeKeyEvent.repeatCount == 0) onOpenDrawer(emptyRequester)
                    true
                } else false
            }
            .focusProperties { canFocus = !showHero && firstCard == null && destination != HomeDestination.Settings }
            .focusable()) {
            if (showHero) {
                HeroBackdrop(featured, Modifier.fillMaxWidth().height(405.dp).graphicsLayer {
                    alpha = if (controller.listState.firstVisibleItemIndex > 0) 0f else 1f
                })
            } else ProTvAtmosphere(Modifier.fillMaxSize())
            CompositionLocalProvider(LocalBringIntoViewSpec provides verticalSpec) {
                LazyColumn(
                    state = controller.listState,
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(bottom = 28.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    item(key = "hero") {
                        Column {
                            if (accountError != null || catalogError != null) {
                                val retryRequester = remember { FocusRequester() }
                                Text(accountError ?: catalogError.orEmpty(), color = ProTvColors.Cyan, fontSize = 12.sp,
                                    modifier = Modifier.padding(20.dp))
                                Button(onClick = if (catalogError != null) onRefreshClick else onAccountRetry,
                                    modifier = Modifier.padding(start = 20.dp).focusRequester(retryRequester)
                                        .openDrawerOnLeft(retryRequester, onOpenDrawer)) { Text(stringResource(R.string.catalog_retry)) }
                            }
                            if (catalogLoading) Text(stringResource(R.string.catalog_loading), color = ProTvColors.Silver, modifier = Modifier.padding(24.dp))
                            if (showHero) {
                                HeroContent(
                                    featured, playRequester, null, firstCard,
                                    onPlayFocused = controller::onHeroFocused,
                                    onPlay = { onSelect(featured.tile.withResumeFrom(rails)) },
                                    featuredPosition = controller.featuredIndex,
                                    featuredCount = featuredTitles.size,
                                    onPrevious = { controller.browseFeaturedBackward(featuredTitles.size) },
                                    onNext = { controller.browseFeaturedForward(featuredTitles.size) },
                                    onMoreInfo = { info = featured },
                                    onOpenDrawer = { onOpenDrawer(playRequester) },
                                )
                                if (controller.restorePending && controller.heroFocused) {
                                    LaunchedEffect(Unit) {
                                        withFrameNanos { }
                                        playRequester.requestFocus()
                                    }
                                }
                            } else {
                                Text(destination.label, color = ProTvColors.White, fontSize = 28.sp, fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(start = 20.dp, top = 26.dp, bottom = 12.dp))
                            }
                        }
                    }
                    if (destination == HomeDestination.Settings) {
                        item {
                            Column(Modifier.padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                                Text(accountLabel?.let { "Signed in as $it" } ?: "Browse as a guest or link your PROtv account.",
                                    color = ProTvColors.Silver, fontSize = 15.sp)
                                Button(onClick = onAccountClick,
                                    modifier = Modifier.focusRequester(settingsRequester).openDrawerOnLeft(settingsRequester, onOpenDrawer)) {
                                    Text(if (accountLabel == null) stringResource(R.string.account_sign_in) else "Manage account")
                                }
                                val refreshRequester = remember { FocusRequester() }
                                val syncRequester = remember { FocusRequester() }
                                Button(onClick = onRefreshClick, modifier = Modifier.focusRequester(refreshRequester)
                                    .openDrawerOnLeft(refreshRequester, onOpenDrawer)) { Text("Refresh catalog") }
                                Button(onClick = onAccountRetry, modifier = Modifier.focusRequester(syncRequester)
                                    .openDrawerOnLeft(syncRequester, onOpenDrawer)) { Text("Sync My List & watch progress") }
                                Text("PROtv for Fire TV • 0.1.0\nPlayback controls hide after 2.75 seconds while playing.",
                                    color = ProTvColors.Muted, fontSize = 12.sp)
                            }
                        }
                    } else if (visibleRails.isEmpty() && !catalogLoading && catalogError == null) {
                        item {
                            Text(
                                when {
                                    accountLoading -> "Restoring your PROtv library..."
                                    destination in setOf(HomeDestination.ContinueWatching, HomeDestination.MyList) && accountLabel == null ->
                                        "Sign in from Settings to restore your library."
                                    destination == HomeDestination.NewReleases -> "Publish dates are not available in this catalog yet. Refresh after the catalog service update."
                                    destination == HomeDestination.ContinueWatching -> "Start a title and your progress will appear here."
                                    destination == HomeDestination.MyList -> "Titles you add to My List will appear here."
                                    else -> stringResource(R.string.catalog_empty)
                                },
                                color = ProTvColors.Silver, fontSize = 15.sp, modifier = Modifier.padding(20.dp),
                            )
                        }
                    }
                    itemsIndexed(visibleRails, key = { _, rail -> rail.key }) { railIndex, rail ->
                        Column {
                            Text(rail.title, color = ProTvColors.White, fontSize = 19.sp, fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(start = 20.dp, bottom = 4.dp))
                            CompositionLocalProvider(LocalBringIntoViewSpec provides horizontalSpec) {
                                LazyRow(
                                    state = controller.rowState(rail.key),
                                    contentPadding = PaddingValues(horizontal = 20.dp, vertical = 8.dp),
                                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                                ) {
                                    itemsIndexed(rail.tiles, key = { _, tile -> tile.id }) { tileIndex, tile ->
                                        val requester = if (tileIndex == 0) rowRequesters.getValue(rail.key) else remember { FocusRequester() }
                                        ContentCard(
                                            tile, requester, { controller.onTileFocused(tile.id, rail.key) }, { onSelect(tile.withResumeFrom(rails)) },
                                            (if (tileIndex == 0) Modifier.openDrawerOnLeft(requester, onOpenDrawer) else Modifier).focusProperties {
                                                if (railIndex == 0 && showHero) up = playRequester
                                            },
                                        )
                                        if (controller.restorePending && !controller.heroFocused && controller.focusedTileId == tile.id &&
                                            (controller.focusedRailKey == null || controller.focusedRailKey == rail.key)) {
                                            LaunchedEffect(Unit) {
                                                withFrameNanos { }
                                                requester.requestFocus()
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    info?.let { title ->
        TitleInfo(title, onClose = { info = null }, onPlay = { info = null; onSelect(title.tile.withResumeFrom(rails)) })
    }
}

private fun HomeTile.withResumeFrom(rails: List<HomeRail>): HomeTile =
    rails.firstOrNull { it.key == "continue-watching" }?.tiles?.firstOrNull { it.id == id } ?: this

@Composable
private fun TitleInfo(featured: HomeFeatured, onClose: () -> Unit, onPlay: () -> Unit) {
    val requester = remember { FocusRequester() }
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Column(
            Modifier.width(560.dp).background(ProTvColors.Midnight, RoundedCornerShape(14.dp))
                .border(1.dp, ProTvColors.ElectricBlue, RoundedCornerShape(14.dp)).padding(28.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(featured.displayTitle, fontSize = 28.sp, color = ProTvColors.White, fontWeight = FontWeight.Bold)
            Text(featured.metadata.joinToString("  •  "), fontSize = 14.sp, color = ProTvColors.Cyan)
            Text(featured.description ?: "No synopsis is available for this title.", color = ProTvColors.Silver, fontSize = 16.sp,
                maxLines = 7, overflow = TextOverflow.Ellipsis)
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(onClick = onPlay, modifier = Modifier.focusRequester(requester), colors = ProTvButtons.primary()) { Text("Play") }
                Button(onClick = onClose, colors = ProTvButtons.secondary()) { Text("Close") }
            }
        }
        LaunchedEffect(Unit) { withFrameNanos { }; requester.requestFocus() }
    }
}

@Composable
internal fun NavigationGlyph(destination: HomeDestination) {
    Canvas(Modifier.size(16.dp)) {
        val color = ProTvColors.White
        val stroke = Stroke(width = 1.5.dp.toPx())
        fun line(x1: Float, y1: Float, x2: Float, y2: Float) =
            drawLine(color, Offset(size.width * x1, size.height * y1), Offset(size.width * x2, size.height * y2), stroke.width)
        when (destination) {
            HomeDestination.Home -> {
                val roof = Path().apply { moveTo(0f, size.height * .45f); lineTo(size.width * .5f, 0f); lineTo(size.width, size.height * .45f) }
                drawPath(roof, color, style = stroke)
                drawRect(color, Offset(size.width * .2f, size.height * .4f), androidx.compose.ui.geometry.Size(size.width * .6f, size.height * .6f), style = stroke)
            }
            HomeDestination.Search -> { drawCircle(color, size.width * .3f, Offset(size.width * .4f, size.height * .4f), style = stroke); line(.65f, .65f, 1f, 1f) }
            HomeDestination.MyList -> { line(.1f, .5f, .9f, .5f); line(.5f, .1f, .5f, .9f) }
            HomeDestination.ContinueWatching -> { drawCircle(color, size.width * .43f, style = stroke); line(.5f, .2f, .5f, .5f); line(.5f, .5f, .75f, .65f) }
            HomeDestination.Music -> { line(.4f, .8f, .4f, .15f); line(.4f, .15f, .9f, .05f); line(.9f, .05f, .9f, .7f); drawCircle(color, size.width * .15f, Offset(size.width * .25f, size.height * .8f)); drawCircle(color, size.width * .15f, Offset(size.width * .75f, size.height * .7f)) }
            HomeDestination.Podcasts -> { drawRoundRect(color, Offset(size.width * .35f, 0f), androidx.compose.ui.geometry.Size(size.width * .3f, size.height * .65f), cornerRadius = androidx.compose.ui.geometry.CornerRadius(size.width * .15f), style = stroke); line(.2f, .5f, .2f, .8f); line(.2f, .8f, .8f, .8f); line(.8f, .8f, .8f, .5f); line(.5f, .8f, .5f, 1f) }
            HomeDestination.TV -> { drawRect(color, Offset(0f, size.height * .2f), androidx.compose.ui.geometry.Size(size.width, size.height * .65f), style = stroke); line(.3f, 1f, .7f, 1f) }
            HomeDestination.Movies -> { drawCircle(color, size.width * .44f, style = stroke); for (i in 0..3) { val x = if (i % 2 == 0) .35f else .65f; val y = if (i < 2) .35f else .65f; drawCircle(color, size.width * .08f, Offset(size.width * x, size.height * y)) } }
            HomeDestination.NewReleases -> {
                val star = Path()
                for (i in 0..9) {
                    val angle = Math.PI * i / 5 - Math.PI / 2
                    val radius = size.width * if (i % 2 == 0) .5f else .22f
                    val x = size.width / 2 + kotlin.math.cos(angle).toFloat() * radius
                    val y = size.height / 2 + kotlin.math.sin(angle).toFloat() * radius
                    if (i == 0) star.moveTo(x, y) else star.lineTo(x, y)
                }
                star.close(); drawPath(star, color)
            }
            HomeDestination.Settings -> { drawCircle(color, size.width * .4f, style = stroke); drawCircle(color, size.width * .13f, style = stroke); line(.5f, 0f, .5f, .15f); line(.5f, .85f, .5f, 1f); line(0f, .5f, .15f, .5f); line(.85f, .5f, 1f, .5f) }
        }
    }
}
