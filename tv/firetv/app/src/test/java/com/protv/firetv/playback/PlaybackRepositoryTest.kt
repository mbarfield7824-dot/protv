package com.protv.firetv.playback

import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test
import retrofit2.HttpException
import kotlinx.serialization.SerializationException
import java.util.concurrent.TimeUnit

class PlaybackRepositoryTest {
    @Test
    fun usesSelectedCatalogIdInPublicPlaybackRequestAndBuildsMuxHlsUrl() {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setBody(
                """{"id":"title-42","streamType":"on-demand","muxPlaybackId":"abc123"}"""
            ))
            server.start()

            val url = runBlocking { PlaybackApiClient.create(server.url("/api/").toString()).hlsUrl("title-42") }
            assertEquals("https://stream.mux.com/abc123.m3u8", url)
            val request = server.takeRequest(5, TimeUnit.SECONDS)!!
            assertEquals("GET", request.method)
            assertEquals("/api/v1/catalog/titles/title-42/playback", request.path)
            assertNull(request.getHeader("Authorization"))
        }
    }

    @Test
    fun rejectsMalformedOrMismatchedPlaybackResponses() {
        for (body in listOf(
            """{"id":"wrong-id","streamType":"on-demand","muxPlaybackId":"valid123"}""",
            """{"id":"title-42","streamType":"live","muxPlaybackId":"valid123"}""",
            """{"id":"title-42","streamType":"on-demand","muxPlaybackId":" "}""",
            """{"id":"title-42","streamType":"on-demand","muxPlaybackId":"x/other"}""",
        )) {
            MockWebServer().use { server ->
                server.enqueue(MockResponse().setBody(body))
                server.start()
                assertThrows(IllegalArgumentException::class.java) {
                    runBlocking { PlaybackApiClient.create(server.url("/").toString()).hlsUrl("title-42") }
                }
            }
        }
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setBody("""{"id":"title-42","streamType":"on-demand"}"""))
            server.start()
            assertThrows(SerializationException::class.java) {
                runBlocking { PlaybackApiClient.create(server.url("/").toString()).hlsUrl("title-42") }
            }
        }
    }

    @Test
    fun invalidPlaybackIdCannotBecomeAnHlsUrl() {
        for (id in listOf("", "  ", "a/b", "a?token=x", "abc.def", "https://other.test")) {
            assertThrows(IllegalArgumentException::class.java) { muxHlsUrl(id) }
        }
        assertEquals("https://stream.mux.com/abc012.m3u8", muxHlsUrl("abc012"))
    }

    @Test
    fun propagatesPlaybackApiFailure() {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setResponseCode(404).setBody("""{"error":"Title not found."}"""))
            server.start()
            assertThrows(HttpException::class.java) {
                runBlocking { PlaybackApiClient.create(server.url("/").toString()).hlsUrl("missing") }
            }
        }
    }
}
