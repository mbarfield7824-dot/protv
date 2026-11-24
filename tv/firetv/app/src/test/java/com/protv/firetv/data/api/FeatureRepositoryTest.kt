package com.protv.firetv.data.api

import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.TimeUnit

class FeatureRepositoryTest {
    @Test
    fun requestsAndValidatesFireTvComingSoonAndLivePolicies() {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setBody(
                """{"policy":"firetv-coming-soon-v1","items":[{"id":"promo-1","kind":"upcoming","title":"A Premiere","description":"Soon","artwork":"https://img.example/a.jpg","premiereLabel":"Premieres Dec 3","trailerAvailable":true,"promotion":true,"promotionId":"promo-1"}]}"""
            ))
            server.enqueue(MockResponse().setBody(
                """{"channel":{"policy":"firetv-live-v1","platform":"firetv","status":"public"},"serverTimeMs":1,"refreshAfterMs":5000,"now":{"entryId":"slot","kind":"program","title":"The Lost Camp","playback":{"muxPlaybackId":"abc123","offsetSeconds":42.5}},"guide":[]}"""
            ))
            server.start()
            val repository = FeatureApiClient.create(server.url("/api/").toString())

            val upcoming = runBlocking { repository.comingSoon() }
            assertEquals("A Premiere", upcoming.single().title)
            assertTrue(upcoming.single().trailerAvailable)
            val first = server.takeRequest(5, TimeUnit.SECONDS)!!
            assertEquals("/api/v1/catalog/coming-soon", first.path)
            assertEquals("firetv", first.getHeader("X-PROtv-Platform"))

            val live = runBlocking { repository.live() }
            assertEquals("The Lost Camp", live.now.title)
            assertEquals(42.5, live.now.playback!!.offsetSeconds, 0.0)
            val second = server.takeRequest(5, TimeUnit.SECONDS)!!
            assertEquals("/api/v1/linear/channel?platform=firetv", second.path)
        }
    }

    @Test
    fun failsClosedWhenPolicyMarkersAreMissing() {
        val repository = FeatureRepository(object : FeatureApi {
            override suspend fun comingSoon() = ComingSoonResponse()
            override suspend fun live() = LiveFeed(
                LiveChannel(),
                0,
                1000,
                LiveItem(kind = "off-air", title = "PROtv LIVE"),
            )
        })
        assertThrows(IllegalArgumentException::class.java) { runBlocking { repository.comingSoon() } }
        assertThrows(IllegalArgumentException::class.java) { runBlocking { repository.live() } }
    }
}
