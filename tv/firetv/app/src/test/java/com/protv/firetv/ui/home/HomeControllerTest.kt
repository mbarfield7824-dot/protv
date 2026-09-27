package com.protv.firetv.ui.home

import com.protv.firetv.data.api.CatalogApi
import com.protv.firetv.data.api.CatalogItem
import com.protv.firetv.data.api.CatalogRepository
import com.protv.firetv.data.api.CatalogResponse
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class HomeControllerTest {
    private fun repository(items: List<CatalogItem>) = CatalogRepository(object : CatalogApi {
        override suspend fun browse() = CatalogResponse(items)
    })

    @Test
    fun firstLoadCompletesBeforeTheHomeListIsLaidOutAndTargetsTheFirstRailTitle() {
        val controller = HomeController(
            repository(listOf(CatalogItem("drama-1", "D", "Drama", "", "", ""), CatalogItem("black-1", "B", "Black Cinema", "", "", ""))),
            "https://api.example/api/",
        )

        runBlocking { withTimeout(5_000) { controller.load() } }

        val state = controller.state as HomeState.Loaded
        assertEquals(listOf("Black Cinema", "Drama"), state.rails.map { it.title })
        assertEquals("black-1", controller.focusedTileId)
        assertTrue(controller.restorePending)
    }

    @Test
    fun rememberedFocusSurvivesLeavingAndReturningToHome() {
        val controller = HomeController(
            repository(listOf(CatalogItem("drama-1", "D", "Drama", "", "", ""), CatalogItem("drama-2", "E", "Drama", "", "", ""))),
            "https://api.example/api/",
        )
        runBlocking { withTimeout(5_000) { controller.load() } }
        val loaded = controller.state

        controller.onTileFocused("drama-2")
        controller.onHomeShown()

        assertEquals(loaded, controller.state)
        assertEquals("drama-2", controller.focusedTileId)
        assertTrue(controller.restorePending)
    }

    @Test
    fun heroPlayIsTheInitialFocusAndFocusRestoreFollowsTheLastFocusedControl() {
        val controller = HomeController(
            repository(
                listOf(
                    CatalogItem("drama-1", "D", "Drama", "", "", ""),
                    CatalogItem(FEATURED_TITLE_IDS[1], "Carnival", "Horror", "", "", ""),
                )
            ),
            "https://api.example/api/",
        )
        runBlocking { withTimeout(5_000) { controller.load() } }

        val featured = (controller.state as HomeState.Loaded).featured
        assertEquals(FEATURED_TITLE_IDS[1], featured?.tile?.id)
        assertTrue(controller.heroFocused)

        controller.onTileFocused("drama-1")
        controller.onHomeShown()
        assertFalse(controller.heroFocused)
        assertEquals("drama-1", controller.focusedTileId)

        controller.onHeroFocused()
        controller.onHomeShown()
        assertTrue(controller.heroFocused)
        assertTrue(controller.restorePending)
    }

    @Test
    fun emptyCatalogHasNoHeroToFocus() {
        val controller = HomeController(repository(emptyList()), "https://api.example/api/")
        runBlocking { withTimeout(5_000) { controller.load() } }

        assertNull((controller.state as HomeState.Loaded).featured)
        assertFalse(controller.heroFocused)
    }
}
