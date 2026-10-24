package com.protv.firetv.ui.home

import org.junit.Assert.assertEquals
import org.junit.Test

class HeroBackdropSourcesTest {
    private fun tile(artwork: Any?) = HomeTile(
        id = "film-1",
        title = "Title",
        meta = null,
        artwork = artwork,
        artworkCacheKey = null,
        fallbackArtwork = null,
    )

    private fun featured(artwork: Any?, still: String?, backdrop: Any? = null) = HomeFeatured(
        tile = tile(artwork),
        displayTitle = "Title",
        description = null,
        metadata = emptyList(),
        stillUrl = still,
        backdropArtwork = backdrop,
    )

    @Test
    fun prefersCatalogLandscapeBackdropThenMuxStillThenPoster() {
        assertEquals(
            listOf("https://img/backdrop.jpg", "https://mux/still.jpg", "https://img/poster.jpg"),
            heroBackdropSources(featured("https://img/poster.jpg", "https://mux/still.jpg", "https://img/backdrop.jpg")),
        )
    }

    @Test
    fun withoutABackdropTheMuxStillLeads() {
        assertEquals(
            listOf("https://mux/still.jpg", "https://img/poster.jpg"),
            heroBackdropSources(featured("https://img/poster.jpg", "https://mux/still.jpg")),
        )
    }

    @Test
    fun duplicatesAreRemovedAndMissingArtLeavesTheBrandedFallback() {
        assertEquals(
            listOf("https://img/same.jpg"),
            heroBackdropSources(featured("https://img/same.jpg", null, "https://img/same.jpg")),
        )
        assertEquals(emptyList<Any>(), heroBackdropSources(featured(null, null)))
    }

    @Test
    fun categoryDefaultsToNoneForExistingCallers() {
        assertEquals(null, featured(null, null).category)
    }
}
