package com.protv.firetv.data.api

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.JsonObject
import java.time.Instant
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
    val credits: JsonElement? = null,
    val contentType: JsonElement? = null,
    val duration: JsonElement? = null,
    val year: JsonElement? = null,
    val maturityRating: JsonElement? = null,
    val muxPlaybackId: JsonElement? = null,
    val muxPlaybackPolicy: JsonElement? = null,
    val subgenre: JsonElement? = null,
    val genres: JsonElement? = null,
    val musicFormat: JsonElement? = null,
    val publishedAt: JsonElement? = null,
    val approvedAt: JsonElement? = null,
    val createdAt: JsonElement? = null,
    val submittedAt: JsonElement? = null,
)

private val JsonElement?.primitive: JsonPrimitive?
    get() = (this as? JsonPrimitive)?.takeUnless { it is JsonNull }

private fun JsonElement?.text(): String? =
    primitive?.takeIf { it.isString }?.content?.trim()?.takeIf { it.isNotEmpty() }

private fun JsonElement?.positiveInt(): Int? =
    primitive?.content?.toDoubleOrNull()?.takeIf { it.isFinite() && it >= 1 }?.toInt()

val CatalogItem.descriptionText: String? get() = description.text()
val CatalogItem.creditsText: String? get() = credits.text()
val CatalogItem.contentTypeText: String? get() = contentType.text()
val CatalogItem.catalogAddedAt: Long?
    get() = sequenceOf(publishedAt, approvedAt, createdAt, submittedAt)
        .mapNotNull(::catalogTimestamp).firstOrNull()

internal fun catalogTimestamp(value: JsonElement?): Long? {
    val primitive = value as? JsonPrimitive
    primitive?.content?.toLongOrNull()?.takeIf { it > 0 }?.let { return it }
    if (primitive?.isString == true) {
        try {
            return Instant.parse(primitive.content).toEpochMilli().takeIf { it > 0 }
        } catch (_: java.time.format.DateTimeParseException) {
            return null
        }
    }
    val obj = value as? JsonObject ?: return null
    val seconds = ((obj["_seconds"] ?: obj["seconds"]) as? JsonPrimitive)?.content?.toLongOrNull()
    return seconds?.takeIf { it > 0 && it <= Long.MAX_VALUE / 1000 }?.times(1000)
}
val CatalogItem.durationSeconds: Int? get() = duration.positiveInt()
val CatalogItem.releaseYear: Int? get() = year.positiveInt()
val CatalogItem.maturityRatingText: String? get() = maturityRating.text()
val CatalogItem.searchText: String
    get() = buildList {
        descriptionText?.let(::add)
        subgenre.text()?.let(::add)
        (genres as? JsonArray)?.forEach { it.text()?.let(::add) }
        musicFormat.text()?.let(::add)
    }.joinToString(" ")

/** The public Mux playback ID, only when it has the expected public-ID shape. */
val CatalogItem.publicMuxPlaybackId: String?
    get() = muxPlaybackId.text()?.takeIf {
        muxPlaybackPolicy.text() != "signed" && it.matches(Regex("[A-Za-z0-9]+"))
    }

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
            // Lets the API apply a Fire TV launch catalog; the server ignores it unless one is set.
            .addInterceptor { chain ->
                chain.proceed(chain.request().newBuilder().header("X-PROtv-Platform", "firetv").build())
            }
            .build()
        val json = Json { ignoreUnknownKeys = true }
        return Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
    }
}
