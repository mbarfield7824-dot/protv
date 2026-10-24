package com.protv.firetv.account

import com.protv.firetv.data.api.ApiClient
import kotlinx.serialization.Serializable
import java.time.DateTimeException
import java.time.Instant
import java.net.URISyntaxException
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Path

@Serializable
data class DeviceSessionResponse(
    val sessionId: String,
    val deviceSecret: String,
    val userCode: String,
    val verificationUrl: String,
    val expiresAt: String,
    val interval: Int,
)

@Serializable
data class DeviceSessionStatusResponse(val status: String)

@Serializable
data class DeviceSessionExchangeResponse(val customToken: String)

interface DeviceSessionApi {
    @POST("auth/device-sessions")
    suspend fun create(): DeviceSessionResponse

    @GET("auth/device-sessions/{sessionId}")
    suspend fun status(
        @Path("sessionId") sessionId: String,
        @Header("X-Device-Secret") deviceSecret: String,
    ): DeviceSessionStatusResponse

    @POST("auth/device-sessions/{sessionId}/exchange")
    suspend fun exchange(
        @Path("sessionId") sessionId: String,
        @Header("X-Device-Secret") deviceSecret: String,
    ): DeviceSessionExchangeResponse
}

enum class DeviceSessionStatus {
    PENDING,
    APPROVED,
    EXPIRED,
    REJECTED,
    CONSUMED,
}

class DeviceSessionRepository(private val api: DeviceSessionApi) {
    suspend fun create(): PendingDeviceSession {
        val response = api.create()
        require(response.sessionId.matches(SESSION_ID_PATTERN)) { "Invalid device session ID" }
        require(response.deviceSecret.matches(SESSION_ID_PATTERN)) { "Invalid device session secret" }
        require(response.userCode.matches(USER_CODE_PATTERN)) { "Invalid device activation code" }
        require(response.interval in 1..60) { "Invalid device session poll interval" }
        val expiresAtMillis = try {
            Instant.parse(response.expiresAt).toEpochMilli()
        } catch (error: DateTimeException) {
            throw IllegalArgumentException("Invalid device session expiry", error)
        }
        requirePublicVerificationUrl(response.verificationUrl)
        return PendingDeviceSession(
            sessionId = response.sessionId,
            deviceSecret = response.deviceSecret,
            userCode = response.userCode,
            verificationUrl = response.verificationUrl,
            expiresAtMillis = expiresAtMillis,
            intervalSeconds = response.interval,
        )
    }

    suspend fun status(session: PendingDeviceSession): DeviceSessionStatus =
        when (api.status(session.sessionId, session.deviceSecret).status) {
            "pending" -> DeviceSessionStatus.PENDING
            "approved" -> DeviceSessionStatus.APPROVED
            "expired" -> DeviceSessionStatus.EXPIRED
            "rejected" -> DeviceSessionStatus.REJECTED
            "consumed" -> DeviceSessionStatus.CONSUMED
            else -> throw IllegalArgumentException("Unknown device session status")
        }

    suspend fun exchange(session: PendingDeviceSession): String =
        api.exchange(session.sessionId, session.deviceSecret).customToken
            .also { require(it.isNotBlank()) { "Empty Firebase custom token" } }

    companion object {
        private val SESSION_ID_PATTERN = Regex("[A-Za-z0-9_-]{43}")
        private val USER_CODE_PATTERN = Regex("[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{4}")
    }
}

private fun requirePublicVerificationUrl(value: String) {
    val uri = try {
        java.net.URI(value)
    } catch (error: URISyntaxException) {
        throw IllegalArgumentException("Invalid device verification URL", error)
    }
    require(
        uri.scheme == "https" && !uri.host.isNullOrBlank()
            && uri.userInfo == null && uri.query == null && uri.fragment == null,
    ) { "Invalid device verification URL" }
}

object DeviceSessionApiClient {
    fun create(baseUrl: String): DeviceSessionRepository =
        DeviceSessionRepository(ApiClient.create(baseUrl).create(DeviceSessionApi::class.java))
}
