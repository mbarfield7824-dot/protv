package com.protv.firetv.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.tv.material3.Button
import androidx.tv.material3.ButtonDefaults
import androidx.tv.material3.Text
import com.protv.firetv.account.ViewerAccountState
import com.protv.firetv.R
import com.protv.firetv.ui.home.CardWidth
import com.protv.firetv.ui.home.ContentCard
import com.protv.firetv.ui.home.HomeController
import com.protv.firetv.ui.home.HomeDestination
import com.protv.firetv.ui.home.HomeRail
import com.protv.firetv.ui.home.HomeState
import com.protv.firetv.ui.home.HomeTile
import com.protv.firetv.ui.home.PremiumHome
import com.protv.firetv.ui.home.NavigationDrawer
import com.protv.firetv.ui.home.openDrawerOnLeft
import com.protv.firetv.ui.home.buildPersonalizedRails
import com.protv.firetv.ui.home.searchCatalog
import com.protv.firetv.ui.home.visibleDestinations
import com.protv.firetv.ui.theme.ProTvButtonShape
import com.protv.firetv.ui.theme.ProTvButtons
import com.protv.firetv.ui.theme.ProTvColors
import com.protv.firetv.ui.theme.ProTvTheme
import com.protv.firetv.ui.theme.ProTvWordmark

@Composable
fun ProTvScreen(
    controller: HomeController,
    onSelect: (HomeTile) -> Unit,
    onExit: () -> Unit,
    accountLabel: String? = null,
    onAccountClick: () -> Unit = {},
    viewerAccountState: ViewerAccountState = ViewerAccountState(),
    onAccountRetry: () -> Unit = {},
    onRefreshClick: () -> Unit = {},
) {
    LaunchedEffect(controller) { controller.onHomeShown() }
    var showExitDialog by remember { mutableStateOf(false) }
    var searchOpen by remember { mutableStateOf(false) }
    BackHandler(enabled = !searchOpen && !showExitDialog) {
        if (controller.destination != HomeDestination.Home) controller.selectDestination(HomeDestination.Home)
        else showExitDialog = true
    }
    val state = controller.state
    val loaded = state as? HomeState.Loaded
    val rails = buildPersonalizedRails(loaded?.rails.orEmpty(), viewerAccountState, accountLabel != null)
    val destinations = remember(rails) { visibleDestinations(rails) }
    // A refreshed catalog can empty the section being viewed; return Home rather than show a dead end.
    LaunchedEffect(destinations, loaded != null) {
        if (loaded != null && controller.destination !in destinations) controller.selectDestination(HomeDestination.Home)
    }
    ProTvTheme {
        NavigationDrawer(
            destination = controller.destination,
            onSelect = { next ->
                controller.selectDestination(next)
                searchOpen = next == HomeDestination.Search
            },
            destinations = destinations,
        ) { openDrawer, drawerOpen ->
            Box(Modifier.fillMaxSize()) {
                PremiumHome(
                    controller = controller,
                    rails = rails,
                    featuredTitles = loaded?.featuredTitles.orEmpty(),
                    onSelect = onSelect,
                    accountLabel = accountLabel,
                    accountError = viewerAccountState.error,
                    accountLoading = viewerAccountState.loading,
                    onAccountClick = onAccountClick,
                    onAccountRetry = onAccountRetry,
                    onRefreshClick = onRefreshClick,
                    onOpenDrawer = openDrawer,
                    drawerOpen = drawerOpen || searchOpen,
                    catalogLoading = state == HomeState.Loading,
                    catalogError = when (state) {
                        HomeState.Failed -> stringResource(R.string.catalog_error)
                        HomeState.Unconfigured -> stringResource(R.string.catalog_unconfigured)
                        else -> null
                    },
                )
                if (searchOpen) {
                    SearchCatalogScreen(
                        tiles = rails.flatMap(HomeRail::tiles).distinctBy { it.id },
                        onSelect = { tile -> searchOpen = false; onSelect(tile) },
                        onClose = { searchOpen = false; controller.selectDestination(HomeDestination.Home) },
                        onOpenDrawer = openDrawer,
                    )
                }
                if (showExitDialog) ExitConfirmation({ showExitDialog = false }, onExit)
            }
        }
    }
}

@Composable
private fun SearchCatalogScreen(
    tiles: List<HomeTile>,
    onSelect: (HomeTile) -> Unit,
    onClose: () -> Unit,
    onOpenDrawer: (FocusRequester) -> Unit,
) {
    BackHandler(onBack = onClose)
    var query by remember { mutableStateOf("") }
    val inputRequester = remember { FocusRequester() }
    val firstResultRequester = remember { FocusRequester() }
    val backRequester = remember { FocusRequester() }
    val gridState = androidx.compose.foundation.lazy.grid.rememberLazyGridState()
    val results = remember(tiles, query) { searchCatalog(tiles, query) }
    var fieldFocused by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { withFrameNanos { }; backRequester.requestFocus() }
    Column(
        Modifier.fillMaxSize().background(
            Brush.verticalGradient(listOf(ProTvColors.Midnight, ProTvColors.Indigo, ProTvColors.Black)),
        ),
    ) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 40.dp, vertical = 24.dp), verticalAlignment = Alignment.CenterVertically) {
            Button(onClick = onClose, modifier = Modifier.focusRequester(backRequester).openDrawerOnLeft(backRequester, onOpenDrawer),
                colors = ProTvButtons.secondary(), shape = ButtonDefaults.shape(ProTvButtonShape)) { Text("Back") }
            Spacer(Modifier.width(20.dp))
            ProTvWordmark(fontSize = 26.sp)
            Spacer(Modifier.width(24.dp))
            BasicTextField(
                value = query,
                onValueChange = { query = it.take(200) },
                singleLine = true,
                textStyle = TextStyle(color = ProTvColors.White, fontSize = 20.sp),
                cursorBrush = SolidColor(ProTvColors.Cyan),
                modifier = Modifier.weight(1f).focusRequester(inputRequester)
                    .focusProperties { if (results.isNotEmpty()) down = firstResultRequester }
                    .onFocusChanged { fieldFocused = it.hasFocus }
                    .background(ProTvColors.Navy, RoundedCornerShape(8.dp))
                    .border(2.dp, if (fieldFocused) ProTvColors.ElectricBlue else ProTvColors.ControlBorder, RoundedCornerShape(8.dp))
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                decorationBox = { field ->
                    Box {
                        if (query.isEmpty()) Text("Search titles, categories, or descriptions", color = ProTvColors.Muted, fontSize = 16.sp)
                        field()
                    }
                },
            )
        }
        if (results.isEmpty()) {
            Text(if (query.isBlank()) "Search the live PROtv catalog." else "No matching titles were found.",
                color = ProTvColors.Silver, fontSize = 18.sp, modifier = Modifier.padding(horizontal = 40.dp))
        } else {
            LazyVerticalGrid(
                columns = GridCells.Adaptive(CardWidth),
                state = gridState,
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 40.dp, vertical = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalArrangement = Arrangement.spacedBy(20.dp),
            ) {
                items(results, key = { it.id }) { tile ->
                    val requester = if (tile.id == results.first().id) firstResultRequester else remember(tile.id) { FocusRequester() }
                    val firstInRow by remember(gridState, tile.id) {
                        derivedStateOf {
                            gridState.layoutInfo.visibleItemsInfo.firstOrNull { it.key == tile.id }?.column == 0
                        }
                    }
                    ContentCard(tile,
                        requester, onFocused = {}, onClick = { onSelect(tile) },
                        modifier = if (firstInRow) Modifier.openDrawerOnLeft(requester, onOpenDrawer) else Modifier)
                }
            }
        }
    }
}

@Composable
private fun ExitConfirmation(onStay: () -> Unit, onExit: () -> Unit) {
    val requester = remember { FocusRequester() }
    Dialog(onDismissRequest = onStay) {
        Column(
            Modifier.background(ProTvColors.Midnight, RoundedCornerShape(14.dp)).padding(28.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            ProTvWordmark(fontSize = 26.sp)
            Text("Exit PROtv?", color = ProTvColors.White, fontSize = 26.sp, fontWeight = FontWeight.Bold)
            Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Button(onClick = onStay, modifier = Modifier.focusRequester(requester), colors = ProTvButtons.primary()) { Text("Stay") }
                Button(onClick = onExit, colors = ProTvButtons.secondary()) { Text("Exit") }
            }
        }
        LaunchedEffect(Unit) { withFrameNanos { }; requester.requestFocus() }
    }
}
