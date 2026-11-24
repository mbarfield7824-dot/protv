package com.protv.firetv.data.api

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.jsonPrimitive
import retrofit2.http.GET

@Serializable
data class ComingSoonResponse(
    val items: List<ComingSoonItem> = emptyList(),
    val policy: String? = null,
)

@Serializable
data class ComingSoonItem(
    val id: String,
    val kind: String,
    val contentType: String? = null,
    val title: String,
    val description: String = "",
    val artwork: String = "",
    val premiereAt: String? = null,
    val premiereLabel: String? = null,
    val premiereShort: String? = null,
    val trailerAvailable: Boolean = false,
    val promotion: Boolean = false,
    val promotionId: String? = null,
    val trailerTitleId: String? = null,
)

@Serializable
data class LiveChannel(
    val policy: String? = null,
    val platform: String? = null,
    val status: String? = null,
)

@Serializable
data class LivePlayback(
    val muxPlaybackId: String,
    val offsetSeconds: Double = 0.0,
    val playbackToken: String? = null,
)

@Serializable
data class LiveItem(
    val entryId: String = "",
    val kind: String,
    val state: String = "",
    val title: String,
    val subtitle: String = "",
    val label: String = "",
    val startAt: String = "",
    val endAt: String = "",
    val startLabel: String = "",
    val onNow: Boolean = false,
    val playback: LivePlayback? = null,
)

@Serializable
data class LiveFeed(
    val channel: LiveChannel,
    val serverTimeMs: Long,
    val refreshAfterMs: Long,
    val now: LiveItem,
    val next: LiveItem? = null,
    val guide: List<LiveItem> = emptyList(),
)

interface FeatureApi {
    @GET("v1/catalog/coming-soon")
    suspend fun comingSoon(): ComingSoonResponse

    @GET("v1/linear/channel?platform=firetv")
    suspend fun live(): LiveFeed
}

class FeatureRepository(private val api: FeatureApi) {
    suspend fun comingSoon(): List<ComingSoonItem> {
        val response = api.comingSoon()
        require(response.policy == "firetv-coming-soon-v1") {
            "The server did not apply the Fire TV Coming Soon policy"
        }
        return response.items
    }

    suspend fun live(): LiveFeed {
        val response = api.live()
        require(response.channel.platform == "firetv" && response.channel.policy == "firetv-live-v1") {
            "The server did not apply the Fire TV LIVE policy"
        }
        return response
    }
}

object FeatureApiClient {
    fun create(baseUrl: String): FeatureRepository =
        FeatureRepository(ApiClient.create(baseUrl).create(FeatureApi::class.java))
}

internal fun JsonElement?.textValue(): String? =
    try { this?.jsonPrimitive?.content?.trim()?.takeIf(String::isNotEmpty) } catch (_: IllegalArgumentException) { null }
