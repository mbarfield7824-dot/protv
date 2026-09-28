package com.protv.firetv.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.BringIntoViewSpec
import androidx.compose.foundation.gestures.LocalBringIntoViewSpec
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.runtime.rememberCoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
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
import com.protv.firetv.ui.home.HeroBackdrop
import com.protv.firetv.ui.home.HeroContent
import com.protv.firetv.ui.home.HomeController
import com.protv.firetv.ui.home.HomeFeatured
import com.protv.firetv.ui.home.HomeRail
import com.protv.firetv.ui.home.HomeState
import com.protv.firetv.ui.home.HomeTile
import com.protv.firetv.ui.theme.ProTvColors
import com.protv.firetv.ui.theme.ProTvSpacing
import com.protv.firetv.ui.theme.ProTvTheme

private val RailSpacing = 26.dp

/** Tighter gap than [RailSpacing] so the first rail visually rides inside the hero's lower field. */
private val HeroToRailSpacing = 20.dp
private val CardSpacing = 14.dp

/** A focused row is only scrolled when it would sit above this margin. */
private val RowFocusPivot = 120.dp

/** A focused row is only scrolled when it would sit below this margin. */
private val RowBottomMargin = 36.dp

/** Minimum distance kept between a focused card and the left/right screen edge. */
private val RowEdgeMargin = 56.dp

/** How far the list scrolls before the cinematic backdrop has faded fully into black. */
private val BackdropFadeDistance = 240.dp

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

/**
 * One layered screen, as in the approved mockup: the featured artwork is the screen's background,
 * and the brand, navigation, hero copy and rails are drawn over it. Nothing here is a panel — the
 * artwork is never bounded by a hero rectangle and there is no opaque header or navigation band.
 */
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
        HomeBringIntoViewSpec(
            topMarginPx = with(density) { RowFocusPivot.toPx() },
            bottomMarginPx = with(density) { RowBottomMargin.toPx() },
            listState = controller.listState,
        ) { controller.heroFocused }
    }
    val horizontalSpec = remember(density) { EdgeBringIntoViewSpec(with(density) { RowEdgeMargin.toPx() }) }
    val fadePx = with(density) { BackdropFadeDistance.toPx() }
    val playFocusRequester = remember { FocusRequester() }
    val firstCardRequesters = remember(rails) { rails.associate { it.key to FocusRequester() } }
    val navRequesters = remember(rails) { List(rails.size + 1) { FocusRequester() } }
    var selectedNavIndex by remember(rails) { mutableIntStateOf(0) }

    val featured = featuredTitles.getOrNull(
        controller.featuredIndex.coerceIn(0, featuredTitles.lastIndex.coerceAtLeast(0)),
    )
    val firstRailRequester = rails.firstOrNull()?.let { firstCardRequesters.getValue(it.key) }
    val heroPlayRequester = playFocusRequester.takeIf { featured != null }

    Box(modifier = Modifier.fillMaxSize()) {
        if (featured != null) {
            HeroBackdrop(
                featured = featured,
                modifier = Modifier
                    .fillMaxSize()
                    .graphicsLayer {
                        // Deferred read: the backdrop dims as the viewer leaves the first viewport
                        // without recomposing the list.
                        alpha = if (controller.listState.firstVisibleItemIndex > 0) {
                            0f
                        } else {
                            (1f - controller.listState.firstVisibleItemScrollOffset / fadePx).coerceIn(0f, 1f)
                        }
                    },
            )
        }
        CompositionLocalProvider(LocalBringIntoViewSpec provides verticalSpec) {
            LazyColumn(
                state = controller.listState,
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(top = ProTvSpacing.SafeVertical, bottom = 96.dp),
                verticalArrangement = Arrangement.spacedBy(0.dp),
            ) {
                // Brand, navigation and hero copy share the first item so hero focus can always
                // return the list to the top and so they read as one cinematic field.
                item(key = "top", contentType = "top") {
                    Column {
                        ProTvHeader(Modifier.padding(horizontal = ProTvSpacing.SafeHorizontal))
                        Spacer(modifier = Modifier.height(6.dp))
                        CompositionLocalProvider(LocalBringIntoViewSpec provides horizontalSpec) {
                            CategoryNavigation(
                                controller = controller,
                                rails = rails,
                                requesters = navRequesters,
                                selectedIndex = selectedNavIndex,
                                onSelectedIndexChange = { selectedNavIndex = it },
                                downFocusRequester = heroPlayRequester ?: firstRailRequester,
                                heroFocusRequester = heroPlayRequester,
                                firstCardRequesters = firstCardRequesters,
                            )
                        }
                        if (featured != null) {
                            Spacer(modifier = Modifier.height(14.dp))
                            HeroSlot(
                                controller = controller,
                                featured = featured,
                                featuredTitles = featuredTitles,
                                focusRequester = playFocusRequester,
                                upFocusRequester = navRequesters.getOrNull(selectedNavIndex),
                                downFocusRequester = firstRailRequester,
                                onSelect = onSelect,
                            )
                        }
                    }
                }
                itemsIndexed(rails, key = { _, rail -> rail.key }, contentType = { _, _ -> "rail" }) { index, rail ->
                    CompositionLocalProvider(LocalBringIntoViewSpec provides horizontalSpec) {
                        Box(modifier = Modifier.padding(top = if (index == 0) HeroToRailSpacing else RailSpacing)) {
                            CategoryRailRow(
                                controller = controller,
                                rail = rail,
                                firstCardFocusRequester = firstCardRequesters.getValue(rail.key),
                                upFocusRequester = if (index == 0) heroPlayRequester else null,
                                onSelect = onSelect,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun HeroSlot(
    controller: HomeController,
    featured: HomeFeatured,
    featuredTitles: List<HomeFeatured>,
    focusRequester: FocusRequester,
    upFocusRequester: FocusRequester?,
    downFocusRequester: FocusRequester?,
    onSelect: (HomeTile) -> Unit,
) {
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
    HeroContent(
        featured = featured,
        playFocusRequester = focusRequester,
        upFocusRequester = upFocusRequester,
        downFocusRequester = downFocusRequester,
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
    upFocusRequester: FocusRequester?,
    onSelect: (HomeTile) -> Unit,
) {
    Column {
        Text(
            text = rail.title,
            color = ProTvColors.White,
            fontSize = 21.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = ProTvSpacing.SafeHorizontal),
        )
        Spacer(modifier = Modifier.height(8.dp))
        LazyRow(
            state = controller.rowState(rail.key),
            contentPadding = PaddingValues(horizontal = ProTvSpacing.SafeHorizontal, vertical = 6.dp),
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
                    // The first rail returns to Play rather than searching geometrically past the
                    // hero copy.
                    modifier = if (upFocusRequester != null) {
                        Modifier.focusProperties { up = upFocusRequester }
                    } else {
                        Modifier
                    },
                )
            }
        }
    }
}

/**
 * Text-first navigation over the artwork: no band, no giant pills. The current category keeps a
 * restrained blue pill as in the mockup, and focus is shown with brighter text and a cyan
 * underline.
 */
@Composable
private fun CategoryNavigation(
    controller: HomeController,
    rails: List<HomeRail>,
    requesters: List<FocusRequester>,
    selectedIndex: Int,
    onSelectedIndexChange: (Int) -> Unit,
    downFocusRequester: FocusRequester?,
    heroFocusRequester: FocusRequester?,
    firstCardRequesters: Map<String, FocusRequester>,
) {
    val scope = rememberCoroutineScope()
    // A plain scrollable Row, not a LazyRow: every category stays composed so its focus requester
    // is always valid and every category remains reachable with LEFT/RIGHT.
    Row(
        modifier = Modifier
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = ProTvSpacing.SafeHorizontal - 10.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CategoryButton(
            label = stringResource(R.string.category_home),
            selected = selectedIndex == 0,
            focusRequester = requesters[0],
            downFocusRequester = downFocusRequester,
            onClick = {
                onSelectedIndexChange(0)
                scope.launch {
                    controller.listState.animateScrollToItem(0)
                    withFrameNanos { }
                    val target = heroFocusRequester ?: firstCardRequesters.values.firstOrNull()
                    runCatching { target?.requestFocus() }
                }
            },
        )
        rails.forEachIndexed { index, rail ->
            CategoryButton(
                label = rail.title,
                selected = selectedIndex == index + 1,
                focusRequester = requesters[index + 1],
                downFocusRequester = downFocusRequester,
                onClick = {
                    onSelectedIndexChange(index + 1)
                    scope.launch {
                        controller.listState.animateScrollToItem(index + 1)
                        withFrameNanos { }
                        runCatching { firstCardRequesters.getValue(rail.key).requestFocus() }
                    }
                },
            )
        }
    }
}

@Composable
private fun CategoryButton(
    label: String,
    selected: Boolean,
    focusRequester: FocusRequester,
    downFocusRequester: FocusRequester?,
    onClick: () -> Unit,
) {
    val interactionSource = remember { MutableInteractionSource() }
    val focused by interactionSource.collectIsFocusedAsState()
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .focusRequester(focusRequester)
            .focusProperties {
                up = FocusRequester.Cancel
                down = downFocusRequester ?: FocusRequester.Cancel
            }
            .clickable(interactionSource = interactionSource, indication = null, onClick = onClick)
            .background(
                color = if (selected) ProTvColors.Blue else Color.Transparent,
                shape = RoundedCornerShape(14.dp),
            )
            .padding(horizontal = 12.dp, vertical = 5.dp),
    ) {
        Text(
            label,
            color = if (focused || selected) ProTvColors.White else ProTvColors.Silver,
            fontSize = 14.sp,
            fontWeight = if (focused || selected) FontWeight.SemiBold else FontWeight.Normal,
        )
        Spacer(modifier = Modifier.height(3.dp))
        Box(
            modifier = Modifier
                .height(2.dp)
                .width(if (focused) 22.dp else 0.dp)
                .background(ProTvColors.Cyan, RoundedCornerShape(1.dp)),
        )
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
    // Single compact row (accent mark, wordmark, inline tagline) instead of a two-line stacked
    // block, so the brand identity reads as a slim strip over the hero field rather than a
    // separate opaque header band that eats first-viewport height.
    Row(
        modifier = modifier.padding(vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(width = 32.dp, height = 3.dp)
                .background(Brush.horizontalGradient(listOf(ProTvColors.Blue, ProTvColors.Cyan))),
        )
        Spacer(modifier = Modifier.width(10.dp))
        Text(
            text = buildAnnotatedString {
                withStyle(SpanStyle(color = ProTvColors.White)) { append(stringResource(R.string.wordmark_pro)) }
                withStyle(SpanStyle(color = ProTvColors.ElectricBlue)) { append(stringResource(R.string.wordmark_tv)) }
            },
            fontSize = 22.sp,
            fontWeight = FontWeight.Bold,
        )
        Spacer(modifier = Modifier.width(12.dp))
        Text(
            text = buildAnnotatedString {
                withStyle(SpanStyle(color = ProTvColors.Silver)) { append(stringResource(R.string.tagline_lead)) }
                append(" ")
                withStyle(SpanStyle(color = ProTvColors.White, fontWeight = FontWeight.SemiBold)) {
                    append(stringResource(R.string.tagline_emphasis))
                }
            },
            fontSize = 13.sp,
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
 * Rows are left where they are while they remain comfortably inside the viewport, so focusing the
 * first rail does not scroll the hero composition away; rows outside the viewport are brought to
 * the nearest margin. While the hero is focused the list returns to the very top.
 */
@OptIn(ExperimentalFoundationApi::class)
private class HomeBringIntoViewSpec(
    private val topMarginPx: Float,
    private val bottomMarginPx: Float,
    private val listState: LazyListState,
    private val heroFocused: () -> Boolean,
) : BringIntoViewSpec {
    override fun calculateScrollDistance(offset: Float, size: Float, containerSize: Float): Float {
        if (heroFocused() && listState.firstVisibleItemIndex == 0) {
            return -listState.firstVisibleItemScrollOffset.toFloat()
        }
        val bottom = containerSize - bottomMarginPx
        return when {
            offset < topMarginPx -> offset - topMarginPx
            offset + size > bottom -> offset + size - bottom
            else -> 0f
        }
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
