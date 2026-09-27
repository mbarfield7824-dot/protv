package com.protv.firetv.playback

import com.protv.firetv.data.api.ApiClient
import kotlinx.serialization.Serializable
import retrofit2.http.GET
import retrofit2.http.Path

@Serializable
data class PlaybackResponse(
    val id: String,
    val streamType: String,
    val muxPlaybackId: String,
)

interface PlaybackApi {
    @GET("v1/catalog/titles/{id}/playback")
    suspend fun playback(@Path("id") titleId: String): PlaybackResponse
}

class PlaybackRepository(private val api: PlaybackApi) {
    suspend fun hlsUrl(titleId: String): String {
        require(titleId.isNotBlank()) { "Title ID is required" }
        val response = api.playback(titleId)
        require(response.id == titleId && response.streamType == "on-demand") {
            "Playback response does not match the requested title"
        }
        return muxHlsUrl(response.muxPlaybackId)
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
