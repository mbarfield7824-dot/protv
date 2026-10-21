package com.protv.firetv.account

import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assert.assertThrows
import org.junit.Test
import java.util.concurrent.TimeUnit
import retrofit2.HttpException

class ViewerAccountRepositoryTest {
    @Test
    fun usesAuthenticatedFavoriteAndProgressEndpoints() = runBlocking {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setBody("""["title-1"]"""))
            server.enqueue(MockResponse().setBody(
                """{"title-1":{"positionSeconds":30,"durationSeconds":100,"progressPercent":30,"updatedAt":1234}}"""
            ))
            server.enqueue(MockResponse().setBody("""{"videoId":"title-2","favorite":true}"""))
            server.enqueue(MockResponse().setBody(
                """{"videoId":"title-2","positionSeconds":45,"durationSeconds":120,"progressPercent":38,"updatedAt":1235}"""
            ))
            server.enqueue(MockResponse().setBody("""{"videoId":"title-2","removed":true}"""))
            server.start()

            val repository = ViewerAccountApiClient.create(server.url("/api/").toString())
            assertEquals(setOf("title-1"), repository.favorites("id-token"))
            assertEquals(30, repository.progress("id-token").getValue("title-1").progressPercent)
            repository.setFavorite("id-token", "title-2", true)
            repository.setProgress("id-token", "title-2", 45.0, 120.0)
            repository.clearProgress("id-token", "title-2")

            val expected = listOf(
                "GET" to "/api/users/me/favorites",
                "GET" to "/api/users/me/progress",
                "PUT" to "/api/users/me/favorites/title-2",
                "PUT" to "/api/users/me/progress/title-2",
                "DELETE" to "/api/users/me/progress/title-2",
            )
            val requests = expected.map { (method, path) ->
                val request = server.takeRequest(5, TimeUnit.SECONDS)
                assertNotNull(request)
                assertEquals(method, request!!.method)
                assertEquals(path, request.path)
                assertEquals("Bearer id-token", request.getHeader("Authorization"))
                request
            }
            assertEquals("""{"favorite":true}""", requests[2].body.readUtf8())
            val progressBody = requests[3].body.readUtf8()
            assertTrue(progressBody.contains("\"positionSeconds\":45.0"))
            assertTrue(progressBody.contains("\"durationSeconds\":120.0"))
        }
    }

    @Test
    fun propagatesUnauthorizedResponsesInsteadOfTreatingThemAsEmptyAccountData() = runBlocking {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setResponseCode(401).setBody("""{"error":"Invalid token"}"""))
            server.start()
            val repository = ViewerAccountApiClient.create(server.url("/api/").toString())

            val error = assertThrows(HttpException::class.java) {
                runBlocking { repository.favorites("expired-id-token") }
            }

            assertEquals(401, error.code())
            val request = server.takeRequest(5, TimeUnit.SECONDS)
            assertNotNull(request)
            assertEquals("Bearer expired-id-token", request!!.getHeader("Authorization"))
        }
    }
}
