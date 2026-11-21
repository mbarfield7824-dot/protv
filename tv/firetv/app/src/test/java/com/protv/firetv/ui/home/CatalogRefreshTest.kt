package com.protv.firetv.ui.home

import com.protv.firetv.data.api.CatalogApi
import com.protv.firetv.data.api.CatalogItem
import com.protv.firetv.data.api.CatalogRepository
import com.protv.firetv.data.api.CatalogResponse
import java.io.IOException
import java.time.Instant
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class CatalogRefreshTest {
    private fun ms(iso: String) = Instant.parse(iso).toEpochMilli()

    /** A catalog service whose answer can change between calls, or fail. */
    private class FakeCatalog(var items: List<CatalogItem>) : CatalogApi {
        var calls = 0
        var failing = false
        override suspend fun browse(): CatalogResponse {
            calls++
            if (failing) throw IOException("offline")
            return CatalogResponse(items)
        }
    }

    private val drama1 = CatalogItem("drama-1", "D", "Drama", "", "", "")
    private val drama2 = CatalogItem("drama-2", "E", "Drama", "", "", "")
    private val episode = CatalogItem("creator_episode_ironborn-1", "Episode 1", "Drama", "", "", "")

    private fun loaded(api: FakeCatalog): HomeController {
        val controller = HomeController(CatalogRepository(api), "https://api.example/api/")
        runBlocking { withTimeout(5_000) { controller.load() } }
        return controller
    }

    @Test
    fun an8PmEasternPremiereIsPickedUpWithinTwoMinutesInWinterAndSummer() {
        // Winter: 8 PM EST = 01:00 UTC. Catalog read at 7:50 PM.
        val winterLoad = ms("2026-12-04T00:50:00Z")
        assertFalse(CatalogRefreshPolicy.isDue(winterLoad, winterLoad, ms("2026-12-04T01:00:30Z")))
        assertTrue(CatalogRefreshPolicy.isDue(winterLoad, winterLoad, ms("2026-12-04T01:01:00Z")))
        // Summer: 8 PM EDT = 00:00 UTC.
        val summerLoad = ms("2027-06-02T23:52:00Z")
        assertTrue(CatalogRefreshPolicy.isDue(summerLoad, summerLoad, ms("2027-06-03T00:01:00Z")))
        // Once read after the slot, the next check waits for the next slot or for 15 minutes.
        val after = ms("2026-12-04T01:01:10Z")
        assertFalse(CatalogRefreshPolicy.isDue(after, after, ms("2026-12-04T01:10:00Z")))
        assertTrue(CatalogRefreshPolicy.isDue(after, after, ms("2026-12-04T01:16:10Z")))
    }

    @Test
    fun aStaleCatalogIsCheckedOnReturnAndFailuresRetryAtMostOnceAMinute() {
        val load = ms("2026-12-01T15:05:00Z")
        assertFalse(CatalogRefreshPolicy.isDue(load, load, ms("2026-12-01T15:19:00Z")))
        assertTrue(CatalogRefreshPolicy.isDue(load, load, ms("2026-12-01T15:20:00Z")))
        val failedAt = ms("2026-12-01T15:20:00Z")
        assertFalse(CatalogRefreshPolicy.isDue(load, failedAt, ms("2026-12-01T15:20:30Z")))
        assertTrue(CatalogRefreshPolicy.isDue(load, failedAt, ms("2026-12-01T15:21:00Z")))
        assertFalse("never before a first load", CatalogRefreshPolicy.isDue(0L, 0L, ms("2026-12-01T15:21:00Z")))
        // The device clock moved backwards after a load: the next check is not blocked.
        val ahead = ms("2026-12-04T01:01:00Z")
        assertTrue(CatalogRefreshPolicy.isDue(ahead, ahead, ms("2026-11-21T06:15:00Z")))
    }

    @Test
    fun aNewEpisodeAppearsWithoutLoadingAndKeepsTheFocusedTitle() {
        val api = FakeCatalog(listOf(drama1, drama2))
        val controller = loaded(api)
        controller.onTileFocused("drama-2", "Drama")
        controller.onHomeShown()
        val loadedAt = controller.catalogLoadedAtMillis

        api.items = listOf(drama1, drama2, episode)
        val changed = runBlocking { controller.refreshIfDue(loadedAt + CatalogRefreshPolicy.STALE_MILLIS) }

        assertTrue(changed)
        val state = controller.state as HomeState.Loaded
        assertTrue(state.rails.flatMap { it.tiles }.any { it.id == episode.id })
        assertEquals("drama-2", controller.focusedTileId)
        assertEquals(loadedAt + CatalogRefreshPolicy.STALE_MILLIS, controller.catalogLoadedAtMillis)
    }

    @Test
    fun anUnchangedCatalogOrAFailedCheckLeavesTheScreenExactlyAsItWas() {
        val api = FakeCatalog(listOf(drama1, drama2))
        val controller = loaded(api)
        val before = controller.state
        val loadedAt = controller.catalogLoadedAtMillis

        assertFalse(runBlocking { controller.refreshIfDue(loadedAt + CatalogRefreshPolicy.STALE_MILLIS) })
        assertSame(before, controller.state)

        api.failing = true
        val later = loadedAt + 2 * CatalogRefreshPolicy.STALE_MILLIS
        assertFalse(runBlocking { controller.refreshIfDue(later) })
        assertSame("the catalog on screen is kept", before, controller.state)
        // Not retried within the minute.
        val calls = api.calls
        assertFalse(runBlocking { controller.refreshIfDue(later + 30_000) })
        assertEquals(calls, api.calls)
    }

    @Test
    fun aWithdrawnFocusedTitleMovesFocusToTheFirstTitle() {
        val api = FakeCatalog(listOf(drama1, drama2))
        val controller = loaded(api)
        controller.onTileFocused("drama-2", "Drama")
        api.items = listOf(drama1)

        assertTrue(runBlocking { controller.refreshIfDue(controller.catalogLoadedAtMillis + CatalogRefreshPolicy.STALE_MILLIS) })

        assertEquals("drama-1", controller.focusedTileId)
        assertTrue(controller.restorePending)
    }

    @Test
    fun nothingIsCheckedBeforeTheFirstLoadOrWhileTheCatalogFailedToLoad() {
        val api = FakeCatalog(listOf(drama1))
        api.failing = true
        val controller = loaded(api)
        assertTrue(controller.state is HomeState.Failed)
        val calls = api.calls
        assertFalse(runBlocking { controller.refreshIfDue(System.currentTimeMillis() + CatalogRefreshPolicy.STALE_MILLIS) })
        assertEquals(calls, api.calls)
    }
}
