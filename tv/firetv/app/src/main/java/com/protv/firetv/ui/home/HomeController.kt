package com.protv.firetv.ui.home

import android.util.Log
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.protv.firetv.account.ViewerAccountState
import com.protv.firetv.data.api.CatalogItem
import com.protv.firetv.data.api.CatalogRepository
import com.protv.firetv.data.api.artworkModel
import com.protv.firetv.data.api.descriptionText
import com.protv.firetv.data.api.creditsText
import com.protv.firetv.data.api.landscapeArtworkModel
import com.protv.firetv.data.api.muxStillArtwork
import com.protv.firetv.data.api.searchText
import com.protv.firetv.data.api.contentTypeText
import com.protv.firetv.data.api.catalogAddedAt
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerializationException
import retrofit2.HttpException

@Immutable
class HomeTile(
    val id: String,
    val title: String,
    val meta: String?,
    /** A URL string, decoded JPEG bytes, or null when the title has no usable artwork. */
    val artwork: Any?,
    val artworkCacheKey: String?,
    val fallbackArtwork: Any?,
    val searchText: String = "",
    val resumePositionSeconds: Double? = null,
    val contentType: String = "MOVIE",
    val category: String = "",
    val addedAt: Long? = null,
    val progressFraction: Float? = null,
    /** Prefer a full-height poster tile when dedicated catalog poster artwork exists. */
    val posterStyle: Boolean = false,
)

/** Prefer genuine catalog key art; use film stills only as a fallback. */
internal fun preferredRailArtwork(catalogArtwork: Any?, landscapeStill: String?): Pair<Any?, Any?> =
    if (catalogArtwork != null) catalogArtwork to landscapeStill else landscapeStill to null

@Immutable
data class HomeRail(val key: String, val title: String, val tiles: List<HomeTile>)

@Immutable
class HomeFeatured(
    val tile: HomeTile,
    /** Hero title with any trailing year removed; the year moves into [metadata]. */
    val displayTitle: String,
    val description: String?,
    val metadata: List<String>,
    /** Landscape Mux still; [HomeTile.artwork] is the fallback when it is missing or fails. */
    val stillUrl: String?,
    /** The catalog's dedicated landscape backdrop (`heroImageUrl`), preferred when present. */
    val backdropArtwork: Any? = null,
    /** The metadata entry that is the category, shown as the highlighted chip. */
    val category: String? = null,
    /** Required Creative Commons credit, shown on More Info. */
    val attribution: String? = null,
)

/**
 * Hero backdrop candidates, best first: the catalog's landscape backdrop, then the landscape Mux
 * still, then the card artwork (usually a poster). Each later entry is tried only if the previous
 * one is missing or fails to load; the branded atmosphere shows when none loads.
 */
fun heroBackdropSources(featured: HomeFeatured): List<Any> =
    listOfNotNull(featured.backdropArtwork, featured.stillUrl, featured.tile.artwork).distinct()

sealed interface HomeState {
    data object Loading : HomeState
    data object Unconfigured : HomeState
    data object Failed : HomeState
    data class Loaded(
        val rails: List<HomeRail>,
        val featured: HomeFeatured? = null,
        val featuredTitles: List<HomeFeatured> = featured?.let(::listOf).orEmpty(),
        /** Creative Commons credits by catalog ID, shown by the player. */
        val attributions: Map<String, String> = emptyMap(),
    ) : HomeState
}

/**
 * Owns the home catalog, scroll positions and last-focused title above the home/player swap,
 * so returning from playback restores the same screen without reloading.
 */
@Stable
class HomeController(private val repository: CatalogRepository?, private val apiBaseUrl: String) {
    var destination by mutableStateOf(HomeDestination.Home)
        private set
    var navigationToken by mutableIntStateOf(0)
        private set
    fun selectDestination(next: HomeDestination) {
        navigationToken++
        destination = next
        focusedTileId = null
        focusedRailKey = null
        heroFocused = next == HomeDestination.Home
        restorePending = true
        listState.requestScrollToItem(0)
    }
    var state by mutableStateOf<HomeState>(if (repository == null) HomeState.Unconfigured else HomeState.Loading)
        private set
    var reloadToken by mutableIntStateOf(0)
        private set
    var restorePending by mutableStateOf(false)
    var focusedTileId: String? = null
        private set
    var focusedRailKey: String? = null
        private set

    /** True when the hero Play button, rather than a rail card, is the focus to restore. */
    var heroFocused by mutableStateOf(false)
        private set
    var heroTopRestoreToken by mutableIntStateOf(0)
        private set
    var featuredIndex by mutableIntStateOf(0)
        private set
    var rotationResetToken by mutableIntStateOf(0)
        private set

    private val listStates = HashMap<HomeDestination, LazyListState>()
    val listState: LazyListState get() = listStates.getOrPut(destination) { LazyListState() }
    private val rowStates = HashMap<String, LazyListState>()

    fun rowState(railKey: String): LazyListState = rowStates.getOrPut("${destination.name}:$railKey") { LazyListState() }

    fun retry() {
        reloadToken++
    }

    /** When the catalog on screen was last read, and when a background check was last tried (milliseconds). */
    var catalogLoadedAtMillis = 0L
        private set
    private var lastRefreshAttemptMillis = 0L
    private var loadedItems: List<CatalogItem>? = null
    private var refreshing = false

    /**
     * Reads the catalog again in the background when [CatalogRefreshPolicy] says it is due. The screen never shows
     * Loading, a failed check keeps the catalog already on screen, and an unchanged catalog changes nothing. When new
     * titles arrive, the section, scroll positions and focused title are kept; if the focused title was withdrawn,
     * focus moves to the first title. Returns true when the catalog on screen changed.
     */
    suspend fun refreshIfDue(nowMillis: Long = System.currentTimeMillis()): Boolean {
        val repository = repository ?: return false
        if (refreshing || state !is HomeState.Loaded) return false
        if (!CatalogRefreshPolicy.isDue(catalogLoadedAtMillis, lastRefreshAttemptMillis, nowMillis)) return false
        refreshing = true
        lastRefreshAttemptMillis = nowMillis
        try {
            val items = try {
                repository.browse()
            } catch (error: IOException) {
                Log.w(TAG, "Catalog refresh failed; keeping the catalog on screen", error)
                return false
            } catch (error: HttpException) {
                Log.w(TAG, "Catalog refresh failed; keeping the catalog on screen", error)
                return false
            } catch (error: SerializationException) {
                Log.w(TAG, "Invalid catalog refresh; keeping the catalog on screen", error)
                return false
            } catch (error: IllegalArgumentException) {
                Log.w(TAG, "Invalid catalog refresh; keeping the catalog on screen", error)
                return false
            }
            catalogLoadedAtMillis = nowMillis
            if (items == loadedItems) return false
            val next = withContext(Dispatchers.Default) { buildLoadedState(items) }
            if (state !is HomeState.Loaded) return false
            loadedItems = items
            val ids = next.rails.flatMap { rail -> rail.tiles.map { it.id } }.toSet()
            val focused = focusedTileId
            if (focused != null && focused !in ids) {
                focusedTileId = next.rails.firstOrNull()?.tiles?.firstOrNull()?.id
                focusedRailKey = null
                restorePending = true
            }
            if (heroFocused && next.featured == null) {
                heroFocused = false
                restorePending = true
            }
            featuredIndex = if (next.featuredTitles.isEmpty()) 0 else featuredIndex.coerceAtMost(next.featuredTitles.lastIndex)
            state = next
            return true
        } finally {
            refreshing = false
        }
    }

    fun onHomeShown() {
        restorePending = true
    }

    fun onTileFocused(id: String, railKey: String? = null) {
        focusedTileId = id
        focusedRailKey = railKey
        heroFocused = false
        restorePending = false
    }

    fun onHeroFocused() {
        heroFocused = true
        restorePending = false
        heroTopRestoreToken++
    }

    fun rotateFeatured(featuredCount: Int) {
        featuredIndex = nextFeaturedIndex(featuredIndex, featuredCount)
    }

    fun browseFeaturedForward(featuredCount: Int) {
        featuredIndex = nextFeaturedIndex(featuredIndex, featuredCount)
        rotationResetToken++
    }

    fun browseFeaturedBackward(featuredCount: Int) {
        featuredIndex = previousFeaturedIndex(featuredIndex, featuredCount)
        rotationResetToken++
    }

    suspend fun load() {
        val repository = repository ?: run {
            state = HomeState.Unconfigured
            return
        }
        state = HomeState.Loading
        var lastBrowsed: List<CatalogItem>? = null
        val next = try {
            val items = repository.browse()
            lastBrowsed = items
            withContext(Dispatchers.Default) { buildLoadedState(items) }
        } catch (error: IOException) {
            Log.e(TAG, "Network error loading catalog", error)
            HomeState.Failed
        } catch (error: HttpException) {
            Log.e(TAG, "HTTP error loading catalog", error)
            HomeState.Failed
        } catch (error: SerializationException) {
            Log.e(TAG, "Invalid catalog response", error)
            HomeState.Failed
        } catch (error: IllegalArgumentException) {
            Log.e(TAG, "Invalid catalog data", error)
            HomeState.Failed
        }
        if (next is HomeState.Loaded) {
            catalogLoadedAtMillis = System.currentTimeMillis()
            loadedItems = lastBrowsed
            rowStates.clear()
            listState.requestScrollToItem(0)
            focusedTileId = next.rails.firstOrNull()?.tiles?.firstOrNull()?.id
            focusedRailKey = null
            heroFocused = destination == HomeDestination.Home && next.featured != null
            featuredIndex = 0
            restorePending = true
        }
        state = next
    }

    private fun buildLoadedState(items: List<CatalogItem>): HomeState.Loaded {
        val featuredTitles = selectFeaturedTitles(items).map { item ->
            HomeFeatured(
                tile = tile(item, showCategory = false),
                displayTitle = heroTitle(item),
                description = sanitizeDescription(item.descriptionText),
                metadata = featuredMetadata(item),
                stillUrl = heroStillUrl(item),
                backdropArtwork = try {
                    item.landscapeArtworkModel(apiBaseUrl)
                } catch (error: IllegalArgumentException) {
                    Log.w(TAG, "Invalid embedded backdrop for catalog ID ${item.id}", error)
                    null
                },
                category = item.category.trim().takeIf { it.isNotEmpty() },
                attribution = attributionText(item.descriptionText, item.creditsText),
            )
        }
        val attributions = items.mapNotNull { item ->
            attributionText(item.descriptionText, item.creditsText)?.let { item.id to it }
        }.toMap()
        return HomeState.Loaded(buildHomeRails(items), featuredTitles.firstOrNull(), featuredTitles, attributions)
    }

    private fun buildHomeRails(items: List<CatalogItem>): List<HomeRail> =
        buildCategoryRails(items).map { rail ->
            HomeRail(rail.key, rail.title, rail.items.map { item -> tile(item, rail.showItemCategory) })
        }

    private fun tile(item: CatalogItem, showCategory: Boolean): HomeTile {
        val artwork = try {
            item.artworkModel(apiBaseUrl)
        } catch (error: IllegalArgumentException) {
            Log.w(TAG, "Invalid embedded artwork for catalog ID ${item.id}", error)
            null
        }
        // Verified catalog art (poster/thumbnail) is primary; an unreviewed Mux still is only a
        // fallback for titles whose catalog artwork is missing or fails to load.
        val landscapeArtwork = item.muxStillArtwork()
        // Preserve genuine movie artwork rather than replacing posters with film stills.
        // When source artwork is missing or fails, use an authorized Mux still.
        val (railArtwork, railFallback) = preferredRailArtwork(artwork, landscapeArtwork)
        return HomeTile(
            id = item.id,
            title = item.title,
            meta = item.category.trim().takeIf { showCategory && it.isNotEmpty() },
            artwork = railArtwork,
            artworkCacheKey = if (railArtwork is ByteArray) "protv-artwork:${item.id}" else null,
            fallbackArtwork = railFallback,
            posterStyle = item.posterUrl.isNotBlank(),
            searchText = "${item.category} ${item.searchText}".trim(),
            contentType = item.contentTypeText ?: "MOVIE",
            category = item.category,
            addedAt = item.catalogAddedAt,
        )
    }

    private companion object {
        const val TAG = "PROtvCatalog"
    }
}

fun searchCatalog(tiles: List<HomeTile>, query: String): List<HomeTile> {
    val terms = query.trim().lowercase().split(Regex("\\s+")).filter(String::isNotBlank)
    if (terms.isEmpty()) return emptyList()
    return tiles.filter { tile ->
        val searchableText = listOf(tile.title, tile.meta.orEmpty(), tile.searchText)
            .joinToString(" ")
            .lowercase()
        terms.all(searchableText::contains)
    }
}

fun buildPersonalizedRails(
    catalogRails: List<HomeRail>,
    account: ViewerAccountState,
    signedIn: Boolean,
): List<HomeRail> {
    if (!signedIn) return catalogRails
    val tilesById = catalogRails.flatMap(HomeRail::tiles).associateBy(HomeTile::id)
    val continueWatching = account.progress.entries
        .filter { (_, progress) -> progress.positionSeconds > 0 && progress.progressPercent < 95 }
        .sortedByDescending { (_, progress) -> progress.updatedAt }
        .mapNotNull { (id, progress) ->
            tilesById[id]?.let { tile ->
                HomeTile(
                    id = tile.id,
                    title = tile.title,
                    meta = "${formatRuntime((progress.durationSeconds - progress.positionSeconds).toInt()) ?: "0m"} left",
                    artwork = tile.artwork,
                    artworkCacheKey = tile.artworkCacheKey,
                    fallbackArtwork = tile.fallbackArtwork,
                    searchText = tile.searchText,
                    resumePositionSeconds = progress.positionSeconds,
                    contentType = tile.contentType,
                    category = tile.category,
                    addedAt = tile.addedAt,
                    posterStyle = tile.posterStyle,
                    progressFraction = (progress.positionSeconds / progress.durationSeconds).toFloat().coerceIn(0f, 1f),
                )
            }
        }
    val favorites = account.favorites.mapNotNull(tilesById::get)
    val history = account.progress.entries
        .filter { (_, progress) -> progress.positionSeconds > 0 }
        .sortedByDescending { (_, progress) -> progress.updatedAt }
        .mapNotNull { (id, progress) ->
            tilesById[id]?.let { tile ->
                HomeTile(
                    id = tile.id,
                    title = tile.title,
                    meta = if (progress.progressPercent >= 95) "Watched" else "${progress.progressPercent}% watched",
                    artwork = tile.artwork,
                    artworkCacheKey = tile.artworkCacheKey,
                    fallbackArtwork = tile.fallbackArtwork,
                    searchText = tile.searchText,
                    resumePositionSeconds = progress.positionSeconds.takeIf { progress.progressPercent < 95 },
                    contentType = tile.contentType,
                    category = tile.category,
                    addedAt = tile.addedAt,
                    posterStyle = tile.posterStyle,
                )
            }
        }
    return buildList {
        if (continueWatching.isNotEmpty()) {
            add(HomeRail("continue-watching", "Continue Watching", continueWatching))
        }
        if (favorites.isNotEmpty()) {
            add(HomeRail("my-list", "My List", favorites))
        }
        if (history.isNotEmpty()) {
            add(HomeRail("watch-history", "Watch History", history))
        }
        addAll(catalogRails)
    }
}
