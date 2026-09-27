package com.protv.firetv.ui.home

import com.protv.firetv.data.api.CatalogItem
import com.protv.firetv.data.api.CatalogResponse
import com.protv.firetv.data.api.descriptionText
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class FeaturedTitleTest {
    private val json = Json { ignoreUnknownKeys = true }

    private fun item(id: String, title: String = "Title $id", contentType: String? = null) =
        CatalogItem(id, title, "Drama", "", "", "", contentType = contentType?.let(::JsonPrimitive))

    @Test
    fun selectsTheFirstCuratedTitleInCuratedOrderRegardlessOfCatalogOrder() {
        val items = listOf(item("other"), item(FEATURED_TITLE_IDS[2]), item(FEATURED_TITLE_IDS[1]))
        assertEquals(FEATURED_TITLE_IDS[1], selectFeaturedTitle(items)?.id)
    }

    @Test
    fun fallsBackDeterministicallyWhenNoCuratedTitleIsPresent() {
        val episodeFirst = listOf(item("ep", contentType = "EPISODE"), item("movie-1"), item("movie-2"))
        assertEquals("movie-1", selectFeaturedTitle(episodeFirst)?.id)
        assertEquals("ep", selectFeaturedTitle(listOf(item("ep", contentType = "EPISODE")))?.id)
        assertEquals("titled", selectFeaturedTitle(listOf(item(FEATURED_TITLE_IDS[0], title = " "), item("titled")))?.id)
        assertNull(selectFeaturedTitle(emptyList()))
    }

    @Test
    fun formatsRuntimeFromSeconds() {
        assertEquals("1h 13m", formatRuntime(4353))
        assertEquals("45m", formatRuntime(2700))
        assertEquals("2h", formatRuntime(7200))
        assertEquals("1m", formatRuntime(12))
        assertNull(formatRuntime(0))
        assertNull(formatRuntime(null))
    }

    @Test
    fun metadataShowsOnlyValuesThatArePresentAndToleratesUnexpectedTypes() {
        val full = json.decodeFromString<CatalogResponse>(
            """{"items":[{"id":"a","title":"A","category":"Horror","thumbnailUrl":"","posterUrl":"","heroImageUrl":"",
               "description":"  A story.  ","duration":4694,"year":1962,"maturityRating":"PG","muxPlaybackId":"Abc123"}]}"""
        ).items.single()
        assertEquals(listOf("Horror", "1962", "1h 18m", "PG"), featuredMetadata(full))
        assertEquals("A story.", full.descriptionText)

        val sparse = json.decodeFromString<CatalogResponse>(
            """{"items":[{"id":"b","title":"B","category":"","thumbnailUrl":"","posterUrl":"","heroImageUrl":"",
               "description":"","duration":null,"year":{"bad":1},"maturityRating":"","muxPlaybackId":null}]}"""
        ).items.single()
        assertEquals(emptyList<String>(), featuredMetadata(sparse))
        assertNull(sparse.descriptionText)
        assertNull(heroStillUrl(sparse))
    }

    @Test
    fun heroStillIsASizedLandscapeMuxFrameInsideTheRuntime() {
        val sampled = item("x").copy(duration = JsonPrimitive(1000), muxPlaybackId = JsonPrimitive("Abc123"))
        assertEquals(
            "https://image.mux.com/Abc123/thumbnail.jpg?time=420&width=1280&height=720&fit_mode=smartcrop",
            heroStillUrl(sampled),
        )
        val curated = sampled.copy(id = "WIVB9NPQQzvtvjTBsiKw", duration = JsonPrimitive(4694))
        assertEquals(true, heroStillUrl(curated)?.contains("time=1174&"))
        val short = sampled.copy(id = "WIVB9NPQQzvtvjTBsiKw", duration = JsonPrimitive(100))
        assertEquals(true, heroStillUrl(short)?.contains("time=95&"))
        assertNull(heroStillUrl(sampled.copy(muxPlaybackId = JsonPrimitive("not/a-public-id"))))
    }
}
