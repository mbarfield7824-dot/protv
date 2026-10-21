package com.protv.firetv.ui.home

import com.protv.firetv.account.ViewerAccountState
import com.protv.firetv.account.WatchProgressEntry
import org.junit.Assert.assertEquals
import org.junit.Test

class CatalogSearchTest {
    @Test
    fun searchesTitleCategoryAndDescriptionAcrossAllTerms() {
        val tiles = listOf(
            tile("drama", "A Quiet Story", "Drama", "A singer follows her dreams."),
            tile("horror", "Night Road", "Horror", "A quiet town faces a mystery."),
        )

        assertEquals(listOf("drama"), searchCatalog(tiles, "singer drama").map(HomeTile::id))
        assertEquals(listOf("horror"), searchCatalog(tiles, "quiet mystery").map(HomeTile::id))
        assertEquals(emptyList<String>(), searchCatalog(tiles, "quiet comedy").map(HomeTile::id))
    }

    @Test
    fun emptySearchDoesNotReturnTheEntireCatalog() {
        assertEquals(emptyList<HomeTile>(), searchCatalog(listOf(tile("one", "Title", "", "")), "  "))
    }

    @Test
    fun searchesCategoryEvenWhenTheHomeRailHidesItsCategoryLabel() {
        val tile = HomeTile("one", "A Quiet Story", null, null, null, null, "Drama")

        assertEquals(listOf("one"), searchCatalog(listOf(tile), "drama").map(HomeTile::id))
    }

    @Test
    fun personalizedRailsShowFavoritesAndResumableProgressForSignedInViewers() {
        val title = tile("one", "Title", "Drama", "")
        val catalog = listOf(HomeRail("drama", "Drama", listOf(title)))
        val account = ViewerAccountState(
            favorites = setOf("one"),
            progress = mapOf("one" to WatchProgressEntry(30.0, 100.0, 30, 1000)),
        )

        val rails = buildPersonalizedRails(catalog, account, signedIn = true)

        assertEquals(listOf("continue-watching", "my-list", "watch-history", "drama"), rails.map(HomeRail::key))
        assertEquals(30.0, rails.first().tiles.single().resumePositionSeconds!!, 0.0)
        assertEquals(catalog, buildPersonalizedRails(catalog, account, signedIn = false))
    }

    @Test
    fun completedTitlesAreNotIncludedInContinueWatching() {
        val catalog = listOf(HomeRail("drama", "Drama", listOf(tile("one", "Title", "Drama", ""))))
        val account = ViewerAccountState(
            progress = mapOf("one" to WatchProgressEntry(100.0, 100.0, 100, 1000)),
        )

        val rails = buildPersonalizedRails(catalog, account, true)
        assertEquals(listOf("watch-history", "drama"), rails.map(HomeRail::key))
        assertEquals(null, rails.first().tiles.single().resumePositionSeconds)
    }

    private fun tile(id: String, title: String, category: String, description: String) =
        HomeTile(id, title, category, null, null, null, description)
}
