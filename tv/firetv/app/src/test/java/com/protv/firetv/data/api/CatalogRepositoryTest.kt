package com.protv.firetv.data.api

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertArrayEquals
import org.junit.Test
import retrofit2.HttpException
import java.util.concurrent.TimeUnit

class CatalogRepositoryTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun parsesViewerSafeEnvelopeWithoutUsingPrivateFields() {
        val response = json.decodeFromString<CatalogResponse>(
            """{"items":[{"id":"film-1","title":"A Viewer Title","category":"Documentary","thumbnailUrl":"","posterUrl":"https://images.example/poster.jpg","heroImageUrl":"","muxPlaybackId":"not-for-browse","rightsHolder":"private"}]}"""
        )

        assertEquals(1, response.items.size)
        val item = response.items.single()
        assertEquals("film-1", item.id)
        assertEquals("A Viewer Title", item.title)
        assertEquals("Documentary", item.category)
        assertEquals("https://images.example/poster.jpg", item.posterUrl)
        assertEquals("https://images.example/poster.jpg", item.artworkUrl("https://api.example/api/"))
    }

    @Test
    fun rejectsMalformedEnvelopeRatherThanShowingEmptyCatalog() {
        assertThrows(SerializationException::class.java) {
            json.decodeFromString<CatalogResponse>("""{"error":"The catalog is temporarily unavailable."}""")
        }
        assertThrows(SerializationException::class.java) {
            json.decodeFromString<CatalogResponse>("""{"items":[{"id":"film-1"}]}""")
        }
    }

    @Test
    fun preservesEmptyResponseAndRejectsUnstableIdentity() {
        runBlocking {
            assertEquals(emptyList<CatalogItem>(), CatalogRepository(fake(emptyList())).browse())
            val item = CatalogItem("film-1", "Title", "", "", "", "")
            assertThrows(IllegalArgumentException::class.java) {
                runBlocking { CatalogRepository(fake(listOf(item, item))).browse() }
            }
            assertThrows(IllegalArgumentException::class.java) {
                runBlocking { CatalogRepository(fake(listOf(item.copy(id = " ")))).browse() }
            }
        }
    }

    @Test
    fun resolvesRelativeArtworkAndHandlesMissingArtwork() {
        val item = CatalogItem("film-1", "Title", "", "/posters/film.jpg", "", "")
        assertEquals(
            "https://api.example/posters/film.jpg",
            item.artworkUrl("https://api.example/api/"),
        )
        assertNull(item.copy(thumbnailUrl = "").artworkUrl("https://api.example/api/"))
        assertNull(item.copy(thumbnailUrl = "file:///private.jpg").artworkUrl("https://api.example/api/"))
    }

    @Test
    fun decodesEmbeddedJpegArtworkForCoilWithoutAUrl() {
        val item = CatalogItem("film-1", "Title", "", "data:image/jpeg;base64,/9j/2Q==", "", "")
        assertArrayEquals(
            byteArrayOf(-1, -40, -1, -39),
            item.artworkModel("https://api.example/api/") as ByteArray,
        )
        assertThrows(IllegalArgumentException::class.java) {
            item.copy(thumbnailUrl = "data:image/jpeg;base64,invalid!").artworkModel("https://api.example/api/")
        }
    }

    @Test
    fun requestsPublicCatalogViewAllWithoutAuthorization() {
        MockWebServer().use { server ->
            server.enqueue(
                MockResponse().setBody(
                    """{"items":[{"id":"real-id","title":"From API","category":"","thumbnailUrl":"","posterUrl":"","heroImageUrl":""}]}"""
                )
            )
            server.start()

            val items = runBlocking { CatalogApiClient.create(server.url("/api/").toString()).browse() }
            assertEquals("real-id", items.single().id)
            val request = server.takeRequest(5, TimeUnit.SECONDS)
            assertNotNull(request)
            assertEquals("GET", request!!.method)
            assertEquals("/api/v1/catalog?view=all", request.path)
            assertNull(request.getHeader("Authorization"))
        }
    }

    @Test
    fun propagatesApiFailureInsteadOfReportingAnEmptyCatalog() {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setResponseCode(500).setBody("""{"error":"Unavailable"}"""))
            server.start()
            assertThrows(HttpException::class.java) {
                runBlocking { CatalogApiClient.create(server.url("/").toString()).browse() }
            }
        }
    }

    private fun fake(items: List<CatalogItem>) = object : CatalogApi {
        override suspend fun browse() = CatalogResponse(items)
    }
}
