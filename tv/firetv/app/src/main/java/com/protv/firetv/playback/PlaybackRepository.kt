package com.protv.firetv.playback

import com.protv.firetv.data.api.ApiClient
import kotlinx.serialization.Serializable
import retrofit2.http.GET
import retrofit2.http.Path

@Serializable
data class PlaybackResponse(
    val id: String,
    val streamType: String? = null,
    val muxPlaybackId: String,
    val playbackToken: String? = null,
)

interface PlaybackApi {
    @GET("v1/catalog/titles/{id}/playback")
    suspend fun playback(@Path("id") titleId: String): PlaybackResponse

    @GET("v1/catalog/titles/{id}/trailer/playback")
    suspend fun titleTrailer(@Path("id") titleId: String): PlaybackResponse

    @GET("v1/catalog/coming-soon/promotions/{id}/trailer")
    suspend fun promotionTrailer(@Path("id") promotionId: String): PlaybackResponse
}

class PlaybackRepository(private val api: PlaybackApi) {
    suspend fun hlsUrl(titleId: String): String {
        require(titleId.isNotBlank()) { "Title ID is required" }
        val response = api.playback(titleId)
        require(response.id == titleId && response.streamType == "on-demand") {
            "Playback response does not match the requested title"
        }
        val url = muxHlsUrl(response.muxPlaybackId)
        val token = response.playbackToken ?: return url
        require(token.matches(Regex("[A-Za-z0-9_.-]+"))) { "Invalid signed playback token" }
        return "$url?token=$token"
    }

    suspend fun trailerHlsUrl(titleId: String? = null, promotionId: String? = null): String {
        require((titleId != null) xor (promotionId != null)) { "Choose one trailer source" }
        val response = if (promotionId != null) api.promotionTrailer(promotionId) else api.titleTrailer(requireNotNull(titleId))
        val url = muxHlsUrl(response.muxPlaybackId)
        val token = response.playbackToken ?: return url
        require(token.matches(Regex("[A-Za-z0-9_.-]+"))) { "Invalid signed playback token" }
        return "$url?token=$token"
    }
}

fun muxHlsUrl(playbackId: String): String {
    require(playbackId.matches(Regex("[A-Za-z0-9]+"))) { "Invalid public Mux playback ID" }
    return "https://stream.mux.com/$playbackId.m3u8"
}

object PlaybackApiClient {
    fun create(baseUrl: String) = PlaybackRepository(
        ApiClient.create(baseUrl).create(PlaybackApi::class.java)
    )
}
