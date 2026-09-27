package com.protv.firetv.ui.home

import android.util.Log
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.protv.firetv.data.api.CatalogItem
import com.protv.firetv.data.api.CatalogRepository
import com.protv.firetv.data.api.artworkModel
import com.protv.firetv.data.api.descriptionText
import com.protv.firetv.data.api.muxStillArtwork
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
)

@Immutable
data class HomeRail(val key: String, val title: String, val tiles: List<HomeTile>)

@Immutable
class HomeFeatured(
    val tile: HomeTile,
    val description: String?,
    val metadata: List<String>,
    /** Landscape Mux still; [HomeTile.artwork] is the fallback when it is missing or fails. */
    val stillUrl: String?,
)

sealed interface HomeState {
    data object Loading : HomeState
    data object Unconfigured : HomeState
    data object Failed : HomeState
    data class Loaded(
        val rails: List<HomeRail>,
        val featured: HomeFeatured? = null,
        val featuredTitles: List<HomeFeatured> = featured?.let(::listOf).orEmpty(),
    ) : HomeState
}

/**
 * Owns the home catalog, scroll positions and last-focused title above the home/player swap,
 * so returning from playback restores the same screen without reloading.
 */
@Stable
class HomeController(private val repository: CatalogRepository?, private val apiBaseUrl: String) {
    var state by mutableStateOf<HomeState>(if (repository == null) HomeState.Unconfigured else HomeState.Loading)
        private set
    var reloadToken by mutableIntStateOf(0)
        private set
    var restorePending by mutableStateOf(false)
    var focusedTileId: String? = null
        private set

    /** True when the hero Play button, rather than a rail card, is the focus to restore. */
    var heroFocused: Boolean = false
        private set
    var featuredIndex by mutableIntStateOf(0)
        private set
    var rotationResetToken by mutableIntStateOf(0)
        private set

    val listState = LazyListState()
    private val rowStates = HashMap<String, LazyListState>()

    fun rowState(railKey: String): LazyListState = rowStates.getOrPut(railKey) { LazyListState() }

    fun retry() {
        reloadToken++
    }

    fun onHomeShown() {
        restorePending = true
    }

    fun onTileFocused(id: String) {
        focusedTileId = id
        heroFocused = false
        restorePending = false
    }

    fun onHeroFocused() {
        heroFocused = true
        restorePending = false
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
        val next = try {
            val items = repository.browse()
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
            rowStates.clear()
            listState.requestScrollToItem(0)
            focusedTileId = next.rails.firstOrNull()?.tiles?.firstOrNull()?.id
            heroFocused = next.featured != null
            featuredIndex = 0
            restorePending = true
        }
        state = next
    }

    private fun buildLoadedState(items: List<CatalogItem>): HomeState.Loaded {
        val featuredTitles = selectFeaturedTitles(items).map { item ->
            HomeFeatured(
                tile = tile(item, showCategory = false),
                description = sanitizeDescription(item.descriptionText),
                metadata = featuredMetadata(item),
                stillUrl = heroStillUrl(item),
            )
        }
        return HomeState.Loaded(buildHomeRails(items), featuredTitles.firstOrNull(), featuredTitles)
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
        return HomeTile(
            id = item.id,
            title = item.title,
            meta = item.category.trim().takeIf { showCategory && it.isNotEmpty() },
            artwork = artwork,
            artworkCacheKey = if (artwork is ByteArray) "protv-artwork:${item.id}" else null,
            fallbackArtwork = landscapeArtwork,
        )
    }

    private companion object {
        const val TAG = "PROtvCatalog"
    }
}
