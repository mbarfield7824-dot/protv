package com.protv.firetv.ui.home

import com.protv.firetv.data.api.CatalogItem
import com.protv.firetv.data.api.CatalogResponse
import com.protv.firetv.data.api.descriptionText
import com.protv.firetv.data.api.muxStillArtwork
import com.protv.firetv.data.api.catalogAddedAt
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
    fun selectsAllAvailableCuratedTitlesInCuratedOrder() {
        val items = listOf(item(FEATURED_TITLE_IDS[2]), item(FEATURED_TITLE_IDS[0]), item("other"))
        assertEquals(
            listOf(FEATURED_TITLE_IDS[0], FEATURED_TITLE_IDS[2]),
            selectFeaturedTitles(items).map { it.id },
        )
    }

    @Test
    fun newlyPublishedOriginalAndRecentFilmsPrecedeOldManualFeatures() {
        val now = java.time.Instant.parse("2026-10-20T00:00:00Z").toEpochMilli()
        val original = item("original").copy(category = "Originals", publishedAt = JsonPrimitive("2026-10-18T00:00:00Z"))
        val recent = item("recent", title = "Classic from 1938").copy(publishedAt = JsonPrimitive("2026-10-19T00:00:00Z"))
        val oldOriginal = item("old-original").copy(category = "Originals", approvedAt = JsonPrimitive("2025-01-01T00:00:00Z"))
        assertEquals(listOf("original", "recent", "old-original", FEATURED_TITLE_IDS[0]),
            selectFeaturedTitles(listOf(item(FEATURED_TITLE_IDS[0]), oldOriginal, recent, original), now).map { it.id })
    }

    @Test
    fun publishDateWinsOverCreatedDateAndReleaseYearDoesNotDetermineRecency() {
        val first = item("first").copy(publishedAt = JsonPrimitive("2026-10-20T00:00:00Z"),
            createdAt = JsonPrimitive("2024-01-01T00:00:00Z"), year = JsonPrimitive(1938))
        val second = item("second").copy(createdAt = JsonPrimitive("2026-09-01T00:00:00Z"), year = JsonPrimitive(2026))
        assertEquals(listOf("first", "second"), selectFeaturedTitles(listOf(second, first), Long.MAX_VALUE).map { it.id })
        assertEquals(java.time.Instant.parse("2026-10-20T00:00:00Z").toEpochMilli(), first.catalogAddedAt)
    }

    @Test
    fun timestampsSupportFirestoreAndInvalidValuesFallBackWithoutInventingDates() {
        val parsed = json.decodeFromString<CatalogResponse>(
            """{"items":[{"id":"a","title":"A","category":"","thumbnailUrl":"","posterUrl":"","heroImageUrl":"",
                "publishedAt":"invalid","approvedAt":{"_seconds":1700000000,"_nanoseconds":0}}]}"""
        ).items.single()
        assertEquals(1700000000000, parsed.catalogAddedAt)
        assertNull(item("unknown").catalogAddedAt)
    }

    @Test
    fun futurePublishDatesAndNonMovieTypesDoNotDisplaceCurrentFilms() {
        val film = item("film").copy(createdAt = JsonPrimitive(1000))
        val future = item("future").copy(publishedAt = JsonPrimitive(9000))
        val music = item("music", contentType = "MUSIC").copy(publishedAt = JsonPrimitive(2000))
        assertEquals(listOf("film"), selectFeaturedTitles(listOf(future, music, film), now = 3000).map { it.id })
    }

    @Test
    fun featuredIndexWrapsForNextAndPrevious() {
        assertEquals(1, nextFeaturedIndex(0, 3))
        assertEquals(0, nextFeaturedIndex(2, 3))
        assertEquals(2, previousFeaturedIndex(0, 3))
        assertEquals(0, previousFeaturedIndex(1, 3))
        assertEquals(0, nextFeaturedIndex(0, 0))
        assertEquals(0, previousFeaturedIndex(0, 1))
    }

    @Test
    fun sanitizesRightsNotesWithoutRemovingSynopsis() {
        assertEquals(
            "A strange story unfolds.",
            sanitizeDescription("A strange story unfolds. Rights: Public domain."),
        )
        assertEquals(
            "A strange story unfolds.",
            sanitizeDescription("A strange story unfolds.\nLicense: CC0"),
        )
        assertNull(sanitizeDescription("Rights: Public domain."))
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
        assertEquals(listOf("1962", "PG", "Horror", "1h 18m"), featuredMetadata(full))
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
    fun heroTitleDropsATrailingYearAndMetadataKeepsIt() {
        val withYearInTitle = item("a", title = "Carnival of Souls (1962)")
        assertEquals("Carnival of Souls", heroTitle(withYearInTitle))
        assertEquals("1962", featuredYear(withYearInTitle))
        assertEquals(listOf("1962", "Drama"), featuredMetadata(withYearInTitle))

        assertEquals("Juice", heroTitle(item("b", title = "Juice")))
        assertEquals("Blade Runner 2049", heroTitle(item("c", title = "Blade Runner 2049")))
        assertEquals("(1962)", heroTitle(item("d", title = "(1962)")))
        assertNull(featuredYear(item("e", title = "Juice")))
    }

    @Test
    fun railStillIsSampledInsideTheRuntimeRatherThanAtAFixedThirtySeconds() {
        val sampled = item("x").copy(duration = JsonPrimitive(1000), muxPlaybackId = JsonPrimitive("Abc123"))
        assertEquals(
            "https://image.mux.com/Abc123/thumbnail.jpg?time=420&width=640&height=360&fit_mode=smartcrop",
            sampled.muxStillArtwork(),
        )
        val short = sampled.copy(duration = JsonPrimitive(20))
        assertEquals(true, short.muxStillArtwork()?.contains("time=8&"))
        val unknownDuration = sampled.copy(duration = null)
        assertEquals(true, unknownDuration.muxStillArtwork()?.contains("time=30&"))
        assertNull(sampled.copy(muxPlaybackId = null).muxStillArtwork())
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

    @Test
    fun signedCreatorMediaDoesNotGenerateUnsignedThumbnailRequests() {
        val signed = item("creator").copy(
            muxPlaybackId = JsonPrimitive("SignedPlayback123"),
            muxPlaybackPolicy = JsonPrimitive("signed"),
        )
        assertNull(heroStillUrl(signed))
        assertNull(signed.muxStillArtwork())
    }
}
