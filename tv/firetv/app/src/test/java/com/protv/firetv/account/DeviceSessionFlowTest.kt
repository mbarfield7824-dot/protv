package com.protv.firetv.account

import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.TimeUnit

class DeviceSessionFlowTest {
    @Test
    fun createsPollsExchangesAndSignsInUsingTheBackendContract() = runBlocking {
        MockWebServer().use { server ->
            server.enqueue(createResponse())
            server.enqueue(MockResponse().setBody("""{"status":"approved"}"""))
            server.enqueue(MockResponse().setBody("""{"customToken":"firebase-custom-token"}"""))
            server.start()

            val store = InMemorySessionStore()
            val auth = FakeAuth()
            val controller = controller(server, store, auth)
            controller.run()

            assertEquals(DeviceLinkState.SignedIn("viewer@example.test"), controller.state)
            assertEquals(listOf("firebase-custom-token"), auth.tokens)
            assertNull(store.session)
            val qrPayload = verificationQrPayload(PendingDeviceSession(
                sessionId = "s".repeat(43),
                deviceSecret = "d".repeat(43),
                userCode = "ABCD-EFGH",
                verificationUrl = "https://watchprotv.com/activate",
                expiresAtMillis = 1,
                intervalSeconds = 1,
            ))
            assertEquals("https://watchprotv.com/activate", qrPayload)
            assertFalse(qrPayload.contains("ABCD-EFGH"))
            assertFalse(qrPayload.contains("d".repeat(43)))

            val create = server.takeRequest(5, TimeUnit.SECONDS)!!
            assertEquals("POST", create.method)
            assertEquals("/api/auth/device-sessions", create.path)
            assertNull(create.getHeader("X-Device-Secret"))

            val poll = server.takeRequest(5, TimeUnit.SECONDS)!!
            assertEquals("GET", poll.method)
            assertEquals("/api/auth/device-sessions/${"s".repeat(43)}", poll.path)
            assertEquals("d".repeat(43), poll.getHeader("X-Device-Secret"))

            val exchange = server.takeRequest(5, TimeUnit.SECONDS)!!
            assertEquals("POST", exchange.method)
            assertEquals("/api/auth/device-sessions/${"s".repeat(43)}/exchange", exchange.path)
            assertEquals("d".repeat(43), exchange.getHeader("X-Device-Secret"))
            assertFalse(exchange.body.readUtf8().contains("deviceSecret"))
        }
    }

    @Test
    fun pendingSessionSurvivesScreenStopAndResumesAfterRestart() = runBlocking {
        MockWebServer().use { server ->
            server.enqueue(createResponse())
            server.enqueue(MockResponse().setBody("""{"status":"pending"}"""))
            server.enqueue(MockResponse().setBody("""{"status":"approved"}"""))
            server.enqueue(MockResponse().setBody("""{"customToken":"restart-token"}"""))
            server.start()

            val store = InMemorySessionStore()
            val auth = FakeAuth()
            val firstController = controller(server, store, auth)
            val firstRun = launch(Dispatchers.IO) { firstController.run() }
            assertNotNull(server.takeRequest(5, TimeUnit.SECONDS))
            assertNotNull(server.takeRequest(5, TimeUnit.SECONDS))
            firstRun.cancelAndJoin()
            assertNotNull(store.session)

            val resumedController = controller(server, store, auth)
            resumedController.run()
            assertEquals(DeviceLinkState.SignedIn("viewer@example.test"), resumedController.state)
            assertEquals(listOf("restart-token"), auth.tokens)
            assertNull(store.session)
        }
    }

    @Test
    fun invalidSessionResponseIsRejectedBeforePersistingSecrets() = runBlocking {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setBody(createResponseBody().replace(
                "\"verificationUrl\":\"https://watchprotv.com/activate\"",
                "\"verificationUrl\":\"http://watchprotv.com/activate\"",
            )))
            server.start()

            val repository = DeviceSessionApiClient.create(server.url("/api/").toString())
            val error = runCatching { repository.create() }.exceptionOrNull()
            assertTrue(error is IllegalArgumentException)
        }
    }

    @Test
    fun expiredActivationClearsTheSavedDeviceSecret() = runBlocking {
        MockWebServer().use { server ->
            server.enqueue(createResponse())
            server.enqueue(MockResponse().setBody("""{"status":"expired"}"""))
            server.start()

            val store = InMemorySessionStore()
            val controller = controller(server, store, FakeAuth())
            controller.run()

            assertEquals(DeviceLinkState.Expired, controller.state)
            assertNull(store.session)
        }
    }

    private fun controller(
        server: MockWebServer,
        store: InMemorySessionStore,
        auth: FakeAuth,
    ) = DeviceLinkController(
        repository = DeviceSessionApiClient.create(server.url("/api/").toString()),
        store = store,
        firebaseAuth = auth,
    )

    private fun createResponse() = MockResponse().setResponseCode(201).setBody(createResponseBody())

    private fun createResponseBody() = """
        {
          "sessionId":"${"s".repeat(43)}",
          "deviceSecret":"${"d".repeat(43)}",
          "userCode":"ABCD-EFGH",
          "verificationUrl":"https://watchprotv.com/activate",
          "expiresAt":"2030-01-01T00:00:00.000Z",
          "interval":1
        }
    """.trimIndent()

    private class InMemorySessionStore : PendingDeviceSessionPersistence {
        var session: PendingDeviceSession? = null
        override fun read() = session
        override fun write(session: PendingDeviceSession) {
            this.session = session
        }
        override fun clear() {
            session = null
        }
    }

    private class FakeAuth : ViewerAuthGateway {
        override var accountLabel: String? = null
        val tokens = mutableListOf<String>()
        override suspend fun signInWithCustomToken(customToken: String): String {
            tokens += customToken
            accountLabel = "viewer@example.test"
            return requireNotNull(accountLabel)
        }
        override suspend fun idToken() = accountLabel?.let { "firebase-id-token" }
        override fun signOut() {
            accountLabel = null
        }
    }
}
