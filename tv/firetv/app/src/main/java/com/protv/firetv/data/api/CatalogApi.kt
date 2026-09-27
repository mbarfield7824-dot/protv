package com.protv.firetv.data.api

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
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
)

interface CatalogApi {
    @GET("v1/catalog?view=all")
    suspend fun browse(): CatalogResponse
}

object CatalogApiClient {
    fun create(baseUrl: String): CatalogRepository {
        val client = OkHttpClient.Builder()
            .callTimeout(15, TimeUnit.SECONDS)
            .build()
        val json = Json { ignoreUnknownKeys = true }
        val service = Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(CatalogApi::class.java)
        return CatalogRepository(service)
    }
}
