package com.protv.firetv.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.gestures.BringIntoViewSpec
import androidx.compose.foundation.gestures.LocalBringIntoViewSpec
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Button
import androidx.tv.material3.ButtonDefaults
import androidx.tv.material3.Text
import com.protv.firetv.R
import com.protv.firetv.ui.home.CardWidth
import com.protv.firetv.ui.home.ContentCard
import com.protv.firetv.ui.home.FeaturedHero
import com.protv.firetv.ui.home.HomeController
import com.protv.firetv.ui.home.HomeFeatured
import com.protv.firetv.ui.home.HomeRail
import com.protv.firetv.ui.home.HomeState
import com.protv.firetv.ui.home.HomeTile
import com.protv.firetv.ui.theme.ProTvColors
import com.protv.firetv.ui.theme.ProTvSpacing
import com.protv.firetv.ui.theme.ProTvTheme

private val RailSpacing = 28.dp
private val CardSpacing = 18.dp

/** Where a focused card's top edge settles vertically, so each row lands in the same place. */
private val RowFocusPivot = 96.dp

/** Minimum distance kept between a focused card and the left/right screen edge. */
private val RowEdgeMargin = 56.dp

@Composable
fun ProTvScreen(controller: HomeController, onSelect: (HomeTile) -> Unit, onExit: () -> Unit) {
    LaunchedEffect(controller) { controller.onHomeShown() }
    var showExitDialog by remember { mutableStateOf(false) }
    BackHandler(enabled = !showExitDialog) { showExitDialog = true }
    BackHandler(enabled = showExitDialog) { showExitDialog = false }

    ProTvTheme {
        Box(modifier = Modifier.fillMaxSize().background(ProTvColors.Black)) {
            when (val state = controller.state) {
                HomeState.Loading -> LoadingHome()
                HomeState.Unconfigured -> StatusHome(stringResource(R.string.catalog_unconfigured), onRetry = null)
                HomeState.Failed -> StatusHome(stringResource(R.string.catalog_error), onRetry = controller::retry)
                is HomeState.Loaded ->
                    if (state.rails.isEmpty()) {
                        StatusHome(stringResource(R.string.catalog_empty), onRetry = controller::retry)
                    } else {
                        HomeRails(controller, state.rails, state.featuredTitles, onSelect)
                    }
            }
            if (showExitDialog) {
                ExitConfirmation(onStay = { showExitDialog = false }, onExit = onExit)
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun HomeRails(
    controller: HomeController,
    rails: List<HomeRail>,
    featuredTitles: List<HomeFeatured>,
    onSelect: (HomeTile) -> Unit,
) {
    val density = LocalDensity.current
    val verticalSpec = remember(density, controller) {
        HomeBringIntoViewSpec(with(density) { RowFocusPivot.toPx() }, controller.listState) { controller.heroFocused }
    }
    val horizontalSpec = remember(density) { EdgeBringIntoViewSpec(with(density) { RowEdgeMargin.toPx() }) }
    val heroFocusRequester = remember { FocusRequester() }
    val firstCardRequesters = remember(rails) { rails.associate { it.key to FocusRequester() } }

    CompositionLocalProvider(LocalBringIntoViewSpec provides verticalSpec) {
        LazyColumn(
            state = controller.listState,
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(top = ProTvSpacing.SafeVertical, bottom = 96.dp),
            verticalArrangement = Arrangement.spacedBy(RailSpacing),
        ) {
            // Header and hero share the first item so hero focus can always return the list to the top.
            item(key = "top", contentType = "top") {
                Column {
                    ProTvHeader(Modifier.padding(horizontal = ProTvSpacing.SafeHorizontal))
                    if (featuredTitles.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(8.dp))
                        HeroSlot(controller, featuredTitles, heroFocusRequester, onSelect)
                    }
                    CategoryNavigation(
                        controller = controller,
                        rails = rails,
                        heroFocusRequester = heroFocusRequester,
                        firstCardRequesters = firstCardRequesters,
                    )
                }
            }
            items(rails, key = { it.key }, contentType = { "rail" }) { rail ->
                CompositionLocalProvider(LocalBringIntoViewSpec provides horizontalSpec) {
                    CategoryRailRow(controller, rail, firstCardRequesters.getValue(rail.key), onSelect)
                }
            }
        }
    }
}

@Composable
private fun HeroSlot(
    controller: HomeController,
    featuredTitles: List<HomeFeatured>,
    focusRequester: FocusRequester,
    onSelect: (HomeTile) -> Unit,
) {
    val featured = featuredTitles[controller.featuredIndex.coerceIn(0, featuredTitles.lastIndex)]
    LaunchedEffect(featuredTitles, controller.rotationResetToken) {
        while (true) {
            delay(8_000)
            controller.rotateFeatured(featuredTitles.size)
        }
    }
    if (controller.restorePending && controller.heroFocused) {
        LaunchedEffect(Unit) {
            withFrameNanos { }
            runCatching { focusRequester.requestFocus() }
        }
    }
    FeaturedHero(
        featured = featured,
        playFocusRequester = focusRequester,
        onPlayFocused = controller::onHeroFocused,
        onPlay = { onSelect(featured.tile) },
        featuredPosition = controller.featuredIndex,
        featuredCount = featuredTitles.size,
        onPrevious = { controller.browseFeaturedBackward(featuredTitles.size) },
        onNext = { controller.browseFeaturedForward(featuredTitles.size) },
    )
}

@Composable
private fun CategoryRailRow(
    controller: HomeController,
    rail: HomeRail,
    firstCardFocusRequester: FocusRequester,
    onSelect: (HomeTile) -> Unit,
) {
    Column {
        Text(
            text = rail.title,
            color = ProTvColors.White,
            fontSize = 24.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = ProTvSpacing.SafeHorizontal),
        )
        Spacer(modifier = Modifier.height(10.dp))
        LazyRow(
            state = controller.rowState(rail.key),
            contentPadding = PaddingValues(horizontal = ProTvSpacing.SafeHorizontal, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(CardSpacing),
        ) {
            items(rail.tiles, key = { it.id }, contentType = { "tile" }) { tile ->
                val focusRequester = if (tile == rail.tiles.firstOrNull()) firstCardFocusRequester else remember { FocusRequester() }
                if (controller.restorePending && controller.focusedTileId == tile.id) {
                    LaunchedEffect(Unit) {
                        withFrameNanos { }
                        runCatching { focusRequester.requestFocus() }
                    }
                }
                ContentCard(
                    tile = tile,
                    focusRequester = focusRequester,
                    onFocused = { controller.onTileFocused(tile.id) },
                    onClick = { onSelect(tile) },
                )
            }
        }
    }
}

@Composable
private fun CategoryNavigation(
    controller: HomeController,
    rails: List<HomeRail>,
    heroFocusRequester: FocusRequester,
    firstCardRequesters: Map<String, FocusRequester>,
) {
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    LazyRow(
        modifier = Modifier.padding(
            top = 4.dp,
        ),
        contentPadding = PaddingValues(horizontal = ProTvSpacing.SafeHorizontal),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item(key = "category-home") {
            Button(
                onClick = {
                    scope.launch {
                        controller.listState.animateScrollToItem(0)
                        withFrameNanos { }
                        runCatching { heroFocusRequester.requestFocus() }
                    }
                },
                colors = ButtonDefaults.colors(
                    containerColor = ProTvColors.Navy,
                    focusedContainerColor = ProTvColors.ElectricBlue,
                ),
            ) {
                Text("Home", fontSize = 15.sp)
            }
        }
        items(rails, key = { "category-${it.key}" }) { rail ->
            Button(
                onClick = {
                    scope.launch {
                        val index = rails.indexOfFirst { it.key == rail.key }
                        controller.listState.animateScrollToItem(index + 1)
                        withFrameNanos { }
                        runCatching { firstCardRequesters.getValue(rail.key).requestFocus() }
                    }
                },
                colors = ButtonDefaults.colors(
                    containerColor = ProTvColors.Midnight,
                    focusedContainerColor = ProTvColors.ElectricBlue,
                ),
            ) {
                Text(rail.title, fontSize = 15.sp)
            }
        }
    }
}

@Composable
private fun ExitConfirmation(onStay: () -> Unit, onExit: () -> Unit) {
    val stayRequester = remember { FocusRequester() }
    LaunchedEffect(Unit) {
        withFrameNanos { }
        runCatching { stayRequester.requestFocus() }
    }
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(ProTvColors.Black.copy(alpha = 0.76f)),
        contentAlignment = androidx.compose.ui.Alignment.Center,
    ) {
        Column(
            modifier = Modifier
                .width(420.dp)
                .background(ProTvColors.Midnight, RoundedCornerShape(14.dp))
                .padding(32.dp),
        ) {
            Text("Exit PROtv?", color = ProTvColors.White, fontSize = 28.sp, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(24.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Button(
                    onClick = onStay,
                    modifier = Modifier.focusRequester(stayRequester),
                    colors = ButtonDefaults.colors(
                        containerColor = ProTvColors.Blue,
                        focusedContainerColor = ProTvColors.ElectricBlue,
                    ),
                ) { Text("Stay", fontSize = 18.sp) }
                Button(
                    onClick = onExit,
                    colors = ButtonDefaults.colors(
                        containerColor = ProTvColors.Navy,
                        focusedContainerColor = ProTvColors.ElectricBlue,
                    ),
                ) { Text("Exit", fontSize = 18.sp) }
            }
        }
    }
}

@Composable
private fun ProTvHeader(modifier: Modifier = Modifier) {
    Column(modifier = modifier) {
        Box(
            modifier = Modifier
                .size(width = 56.dp, height = 3.dp)
                .background(Brush.horizontalGradient(listOf(ProTvColors.Blue, ProTvColors.Cyan))),
        )
        Spacer(modifier = Modifier.height(14.dp))
        Text(
            text = buildAnnotatedString {
                withStyle(SpanStyle(color = ProTvColors.White)) { append(stringResource(R.string.wordmark_pro)) }
                withStyle(SpanStyle(color = ProTvColors.ElectricBlue)) { append(stringResource(R.string.wordmark_tv)) }
            },
            fontSize = 40.sp,
            fontWeight = FontWeight.Bold,
        )
        Text(
            text = buildAnnotatedString {
                withStyle(SpanStyle(color = ProTvColors.Silver)) { append(stringResource(R.string.tagline_lead)) }
                append(" ")
                withStyle(SpanStyle(color = ProTvColors.White, fontWeight = FontWeight.SemiBold)) {
                    append(stringResource(R.string.tagline_emphasis))
                }
            },
            fontSize = 18.sp,
        )
    }
}

@Composable
private fun LoadingHome() {
    Column(
        modifier = Modifier.padding(
            horizontal = ProTvSpacing.SafeHorizontal,
            vertical = ProTvSpacing.SafeVertical,
        ),
    ) {
        ProTvHeader()
        Spacer(modifier = Modifier.height(RailSpacing))
        Text(stringResource(R.string.catalog_loading), color = ProTvColors.Muted, fontSize = 16.sp)
        repeat(2) {
            Spacer(modifier = Modifier.height(RailSpacing))
            SkeletonBlock(width = 180.dp, height = 22.dp)
            Spacer(modifier = Modifier.height(20.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(CardSpacing)) {
                repeat(4) {
                    Box(
                        modifier = Modifier
                            .width(CardWidth)
                            .aspectRatio(16f / 9f)
                            .background(ProTvColors.Midnight, RoundedCornerShape(10.dp)),
                    )
                }
            }
        }
    }
}

@Composable
private fun SkeletonBlock(width: Dp, height: Dp) {
    Box(
        modifier = Modifier
            .size(width = width, height = height)
            .background(ProTvColors.Navy, RoundedCornerShape(6.dp)),
    )
}

@Composable
private fun StatusHome(message: String, onRetry: (() -> Unit)?) {
    Column(
        modifier = Modifier.padding(
            horizontal = ProTvSpacing.SafeHorizontal,
            vertical = ProTvSpacing.SafeVertical,
        ),
    ) {
        ProTvHeader()
        Spacer(modifier = Modifier.height(64.dp))
        Box(
            modifier = Modifier
                .width(560.dp)
                .background(ProTvColors.Midnight, RoundedCornerShape(12.dp))
                .padding(28.dp),
        ) {
            Column {
                Text(message, color = ProTvColors.Silver, fontSize = 20.sp)
                if (onRetry != null) {
                    Spacer(modifier = Modifier.height(24.dp))
                    RetryButton(onRetry)
                }
            }
        }
    }
}

@Composable
private fun RetryButton(onClick: () -> Unit) {
    val focusRequester = remember { FocusRequester() }
    LaunchedEffect(Unit) {
        withFrameNanos { }
        runCatching { focusRequester.requestFocus() }
    }
    Button(
        onClick = onClick,
        modifier = Modifier.focusRequester(focusRequester),
        colors = ButtonDefaults.colors(
            containerColor = ProTvColors.Blue,
            contentColor = ProTvColors.White,
            focusedContainerColor = ProTvColors.ElectricBlue,
            focusedContentColor = ProTvColors.Black,
        ),
    ) {
        Text(stringResource(R.string.catalog_retry))
    }
}

/**
 * Rail cards settle at a fixed pivot so every row lands in the same place; while the hero is
 * focused the list returns to the very top so the header and hero are shown together.
 */
@OptIn(ExperimentalFoundationApi::class)
private class HomeBringIntoViewSpec(
    private val pivotPx: Float,
    private val listState: LazyListState,
    private val heroFocused: () -> Boolean,
) : BringIntoViewSpec {
    override fun calculateScrollDistance(offset: Float, size: Float, containerSize: Float): Float =
        if (heroFocused() && listState.firstVisibleItemIndex == 0) {
            -listState.firstVisibleItemScrollOffset.toFloat()
        } else {
            offset - pivotPx
        }
}

@OptIn(ExperimentalFoundationApi::class)
private class EdgeBringIntoViewSpec(private val marginPx: Float) : BringIntoViewSpec {
    override fun calculateScrollDistance(offset: Float, size: Float, containerSize: Float): Float {
        val start = marginPx
        val end = containerSize - marginPx
        return when {
            offset < start -> offset - start
            offset + size > end -> offset + size - end
            else -> 0f
        }
    }
}
