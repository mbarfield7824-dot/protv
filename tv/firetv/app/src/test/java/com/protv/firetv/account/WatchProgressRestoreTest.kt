package com.protv.firetv.account

import com.protv.firetv.ui.home.HomeRail
import com.protv.firetv.ui.home.HomeTile
import com.protv.firetv.ui.home.buildPersonalizedRails
import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WatchProgressRestoreTest {
    private class Store : WatchProgressStore {
        val viewers = mutableMapOf<String, Map<String, WatchProgressEntry>>()
        override fun read(viewerId: String) = viewers[viewerId].orEmpty()
        override fun write(viewerId: String, progress: Map<String, WatchProgressEntry>) { viewers[viewerId] = progress }
    }

    private class Auth(override val viewerId: String = "viewer-one") : ViewerAuthGateway {
        override val accountLabel = "Viewer"
        override suspend fun idToken() = "test-id-token"
        override suspend fun signInWithCustomToken(customToken: String) = accountLabel
        override fun signOut() = Unit
    }

    private class Api : ViewerAccountApi {
        var saved = emptyMap<String, WatchProgressEntry>()
        var failRead = false
        var failFavorites = false
        var failClear = false
        var readEmpty = false
        var waitForWrite: CompletableDeferred<Unit>? = null
        val writeStarted = CompletableDeferred<Unit>()
        override suspend fun favorites(authorization: String): List<String> {
            if (failFavorites) throw IOException("offline")
            return emptyList()
        }
        override suspend fun progress(authorization: String): Map<String, WatchProgressEntry> {
            if (failRead) throw IOException("offline")
            return if (readEmpty) emptyMap() else saved
        }
        override suspend fun setFavorite(authorization: String, videoId: String, request: FavoriteUpdateRequest) = Unit
        override suspend fun setProgress(authorization: String, videoId: String, request: WatchProgressRequest) {
            writeStarted.complete(Unit)
            waitForWrite?.await()
            saved = saved + (videoId to WatchProgressEntry(request.positionSeconds, request.durationSeconds, 10, 1))
        }
        override suspend fun clearProgress(authorization: String, videoId: String) {
            if (failClear) throw IOException("offline")
            saved = saved - videoId
        }
    }

    @Test
    fun shortSessionSurvivesControllerRecreationEvenWhenServerReturnsAnEmptyMap() = runBlocking {
        val store = Store()
        val api = Api().apply { readEmpty = true }
        val repository = ViewerAccountRepository(api)
        val first = ViewerAccountController(repository, Auth(), store)
        first.load()
        first.recordProgress("movie", 4.0, 1000.0)
        val restarted = ViewerAccountController(repository, Auth(), store)
        restarted.load()
        assertEquals(4.0, restarted.state.progress.getValue("movie").positionSeconds, 0.0)
        assertEquals(4.0, api.saved.getValue("movie").positionSeconds, 0.0)
        val tile = HomeTile("movie", "Movie", null, null, null, null)
        val rails = buildPersonalizedRails(listOf(HomeRail("drama", "Drama", listOf(tile))), restarted.state, true)
        assertEquals("continue-watching", rails.first().key)
        assertEquals(4.0, rails.first().tiles.single().resumePositionSeconds)
    }

    @Test
    fun cachedProgressIsVisibleWhenTheNetworkIsUnavailable() = runBlocking {
        val store = Store()
        val controller = ViewerAccountController(ViewerAccountRepository(Api().apply { failRead = true }), Auth(), store)
        controller.recordProgress("movie", 12.0, 100.0)
        val restarted = ViewerAccountController(ViewerAccountRepository(Api().apply { failRead = true }), Auth(), store)
        restarted.load()
        assertEquals(12.0, restarted.state.progress.getValue("movie").positionSeconds, 0.0)
        assertNotNull(restarted.state.error)
    }

    @Test
    fun cachedProgressIsIsolatedByFirebaseViewerIdNotDisplayLabel() = runBlocking {
        val store = Store()
        val repository = ViewerAccountRepository(Api())
        ViewerAccountController(repository, Auth("one"), store).recordProgress("movie", 10.0, 100.0)
        val other = ViewerAccountController(repository, Auth("two"), store)
        other.load()
        assertTrue(other.state.progress.isEmpty())
    }

    @Test
    fun newestTimestampWinsEvenWhenViewerSeeksBackward() {
        val remote = WatchProgressEntry(90.0, 1000.0, 9, 100)
        val local = WatchProgressEntry(10.0, 1000.0, 1, 200)
        assertEquals(local, mergeWatchProgress(mapOf("movie" to remote), mapOf("movie" to local))["movie"])
        assertEquals(local, mergeWatchProgress(mapOf("movie" to local), mapOf("movie" to remote))["movie"])
    }

    @Test
    fun favoritesFailureDoesNotPreventProgressRestoration() = runBlocking {
        val api = Api().apply {
            failFavorites = true
            saved = mapOf("movie" to WatchProgressEntry(10.0, 100.0, 10, 1))
        }
        val controller = ViewerAccountController(ViewerAccountRepository(api), Auth(), Store())
        controller.load()
        assertEquals(10.0, controller.state.progress.getValue("movie").positionSeconds, 0.0)
        assertNotNull(controller.state.error)
    }

    @Test
    fun inFlightNetworkSaveDoesNotOverwriteNewerLocalPosition() = runBlocking {
        val api = Api().apply { waitForWrite = CompletableDeferred() }
        val store = Store()
        val controller = ViewerAccountController(ViewerAccountRepository(api), Auth(), store)
        controller.recordProgress("movie", 10.0, 100.0)
        val save = launch { controller.saveProgress("movie", 10.0, 100.0) }
        api.writeStarted.await()
        controller.recordProgress("movie", 20.0, 100.0)
        requireNotNull(api.waitForWrite).complete(Unit)
        save.join()
        assertEquals(20.0, controller.state.progress.getValue("movie").positionSeconds, 0.0)
        assertEquals(20.0, store.read("viewer-one").getValue("movie").positionSeconds, 0.0)
    }

    @Test
    fun clearingProgressAlsoClearsItsRestartCheckpoint() = runBlocking {
        val store = Store()
        val controller = ViewerAccountController(ViewerAccountRepository(Api()), Auth(), store)
        controller.recordProgress("movie", 10.0, 100.0)
        controller.clearProgress("movie")
        assertTrue(store.read("viewer-one").isEmpty())
    }

    @Test
    fun failedClearRetainsTheRestartCheckpointAndReportsTheError() = runBlocking {
        val store = Store()
        val controller = ViewerAccountController(ViewerAccountRepository(Api().apply { failClear = true }), Auth(), store)
        controller.recordProgress("movie", 10.0, 100.0)
        controller.clearProgress("movie")
        assertEquals(10.0, store.read("viewer-one").getValue("movie").positionSeconds, 0.0)
        assertNotNull(controller.state.error)
    }
}
