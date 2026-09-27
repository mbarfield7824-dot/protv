package com.protv.firetv.data.api

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import retrofit2.http.GET
import java.util.concurrent.TimeUnit

@Serializable
data class CatalogResponse(val items: List<CatalogItem>)

@Serializable
data class CatalogItem(
    val id: String,
    val title: String,
    val category: String,
    val thumbnailUrl: String,
    val posterUrl: String,
    val heroImageUrl: String,
    // Optional hero metadata. Kept loosely typed so an unexpected value can never fail the catalog.
    val description: JsonElement? = null,
    val contentType: JsonElement? = null,
    val duration: JsonElement? = null,
    val year: JsonElement? = null,
    val maturityRating: JsonElement? = null,
    val muxPlaybackId: JsonElement? = null,
)

private val JsonElement?.primitive: JsonPrimitive?
    get() = (this as? JsonPrimitive)?.takeUnless { it is JsonNull }

private fun JsonElement?.text(): String? =
    primitive?.takeIf { it.isString }?.content?.trim()?.takeIf { it.isNotEmpty() }

private fun JsonElement?.positiveInt(): Int? =
    primitive?.content?.toDoubleOrNull()?.takeIf { it.isFinite() && it >= 1 }?.toInt()

val CatalogItem.descriptionText: String? get() = description.text()
val CatalogItem.contentTypeText: String? get() = contentType.text()
val CatalogItem.durationSeconds: Int? get() = duration.positiveInt()
val CatalogItem.releaseYear: Int? get() = year.positiveInt()
val CatalogItem.maturityRatingText: String? get() = maturityRating.text()

/** The public Mux playback ID, only when it has the expected public-ID shape. */
val CatalogItem.publicMuxPlaybackId: String?
    get() = muxPlaybackId.text()?.takeIf { it.matches(Regex("[A-Za-z0-9]+")) }

interface CatalogApi {
    @GET("v1/catalog?view=all")
    suspend fun browse(): CatalogResponse
}

object CatalogApiClient {
    fun create(baseUrl: String): CatalogRepository {
        return CatalogRepository(ApiClient.create(baseUrl).create(CatalogApi::class.java))
    }
}

object ApiClient {
    fun create(baseUrl: String): Retrofit {
        val client = OkHttpClient.Builder()
            .callTimeout(15, TimeUnit.SECONDS)
            .build()
        val json = Json { ignoreUnknownKeys = true }
        return Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
    }
}
