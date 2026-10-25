package com.protv.firetv.ui.home

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HomeNavigationTest {
    private fun tile(id: String, type: String, time: Long? = null) =
        HomeTile(id, id, null, null, null, null, contentType = type, addedAt = time)

    private val catalog = listOf(HomeRail("drama", "Drama", listOf(
        tile("old-film", "MOVIE", 1), tile("new-film", "ORIGINAL", 3),
        tile("show", "EPISODE"), tile("music", "MUSIC"), tile("podcast", "PODCAST_EPISODE"),
    )))

    @Test
    fun sidebarDestinationsFilterRealCatalogTypes() {
        assertEquals(listOf("old-film", "new-film"), destinationRails(catalog, HomeDestination.Movies).flatMap { it.tiles }.map { it.id })
        assertEquals("show", destinationRails(catalog, HomeDestination.TV).single().tiles.single().id)
        assertEquals("music", destinationRails(catalog, HomeDestination.Music).single().tiles.single().id)
        assertEquals("podcast", destinationRails(catalog, HomeDestination.Podcasts).single().tiles.single().id)
    }

    @Test
    fun newReleasesUseAddedDateAndHomeKeepsContinueWatchingFirst() {
        val recent = destinationRails(catalog, HomeDestination.NewReleases).single()
        assertEquals(listOf("new-film", "old-film"), recent.tiles.map { it.id })
        val rails = listOf(HomeRail("continue-watching", "Continue Watching", listOf(tile("resume", "MOVIE")))) + catalog
        assertEquals(listOf("continue-watching", "new-releases", "drama"), destinationRails(rails, HomeDestination.Home).map { it.key })
    }

    @Test
    fun emptyMusicPodcastsAndNewReleasesAreHiddenFromTheDrawer() {
        // Today's live catalog: movies and episodes, no music, podcasts or publish dates.
        val live = listOf(HomeRail("drama", "Drama", listOf(tile("film", "MOVIE"), tile("episode", "EPISODE"))))
        assertEquals(
            listOf(
                HomeDestination.Home, HomeDestination.Movies, HomeDestination.TV, HomeDestination.ContinueWatching,
                HomeDestination.MyList, HomeDestination.Search, HomeDestination.Settings,
            ),
            visibleDestinations(live),
        )
    }

    @Test
    fun tvIsHiddenWhileTheCatalogHasNoEpisodes() {
        // The Fire TV launch catalog: movies only.
        val moviesOnly = listOf(HomeRail("drama", "Drama", listOf(tile("film", "MOVIE"))))
        assertEquals(
            listOf(
                HomeDestination.Home, HomeDestination.Movies, HomeDestination.ContinueWatching,
                HomeDestination.MyList, HomeDestination.Search, HomeDestination.Settings,
            ),
            visibleDestinations(moviesOnly),
        )
    }

    @Test
    fun contentDependentSectionsReturnWhenTheCatalogHasTitles() {
        assertEquals(HomeDestination.entries, visibleDestinations(catalog))
    }

    @Test
    fun personalAndCoreSectionsStayVisibleEvenWhenEmpty() {
        val visible = visibleDestinations(emptyList())
        for (destination in listOf(
            HomeDestination.Home, HomeDestination.Movies, HomeDestination.ContinueWatching,
            HomeDestination.MyList, HomeDestination.Search, HomeDestination.Settings,
        )) {
            assertTrue("$destination should stay visible", destination in visible)
        }
    }

    @Test
    fun personalSectionsDoNotLeakIntoCatalogFilters() {
        val rails = listOf(HomeRail("my-list", "My List", listOf(tile("favorite", "MOVIE")))) + catalog
        assertFalse(destinationRails(rails, HomeDestination.Movies).flatMap { it.tiles }.any { it.id == "favorite" })
        assertEquals("favorite", destinationRails(rails, HomeDestination.MyList).single().tiles.single().id)
    }
}
