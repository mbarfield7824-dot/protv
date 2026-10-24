package com.protv.firetv.data.api

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CatalogArtworkPresentationTest {
    private val base = "https://api.example/api/"

    @Test
    fun landscapeThumbnailsFillTheLandscapeCard() {
        assertEquals(ArtworkFit.Crop, artworkFitFor(width = 640, height = 360))
        assertEquals(ArtworkFit.Crop, artworkFitFor(width = 1920, height = 1080))
        assertEquals(ArtworkFit.Crop, artworkFitFor(width = 1600, height = 1000))
    }

    @Test
    fun portraitSquareAndFourByThreeArtIsContainedWithoutCropping() {
        assertEquals(ArtworkFit.Fit, artworkFitFor(width = 600, height = 900))
        assertEquals(ArtworkFit.Fit, artworkFitFor(width = 225, height = 225))
        assertEquals(ArtworkFit.Fit, artworkFitFor(width = 640, height = 480))
        assertEquals(ArtworkFit.Fit, artworkFitFor(width = 400, height = 500))
    }

    @Test
    fun veryWideArtIsContainedRatherThanHeavilyCropped() {
        assertEquals(ArtworkFit.Fit, artworkFitFor(width = 2400, height = 800))
    }

    @Test
    fun cropThresholdLimitsImageLossToFifteenPercent() {
        // For a 1600x900 card, these are the exact minimum retained image dimensions.
        assertEquals(ArtworkFit.Crop, artworkFitFor(width = 1360, height = 900))
        assertEquals(ArtworkFit.Fit, artworkFitFor(width = 1359, height = 900))
        assertEquals(ArtworkFit.Crop, artworkFitFor(width = 1600, height = 765))
        assertEquals(ArtworkFit.Fit, artworkFitFor(width = 1600, height = 764))
    }

    @Test
    fun heroPosterKeepsItsOwnPortraitPresentation() {
        assertEquals(ArtworkFit.Crop, artworkFitFor(width = 600, height = 900, targetAspectRatio = 2f / 3f))
        assertEquals(ArtworkFit.Fit, artworkFitFor(width = 640, height = 360, targetAspectRatio = 2f / 3f))
    }

    @Test
    fun unknownDimensionsAreFramedSafely() {
        assertEquals(ArtworkFit.Fit, artworkFitFor(width = 0, height = 0))
        assertEquals(ArtworkFit.Fit, artworkFitFor(width = -1, height = 900))
        assertEquals(ArtworkFit.Fit, artworkFitFor(width = 640, height = -1))
    }

    @Test
    fun landscapeArtworkUsesOnlyTheDedicatedHeroField() {
        val item = CatalogItem("film-1", "Title", "", "https://img.example/thumb.jpg", "https://img.example/poster.jpg", "")
        assertNull(item.landscapeArtworkModel(base))
        assertEquals(
            "https://api.example/backdrops/film.jpg",
            item.copy(heroImageUrl = "/backdrops/film.jpg").landscapeArtworkModel(base),
        )
        assertNull(item.copy(heroImageUrl = "file:///private.jpg").landscapeArtworkModel(base))
        assertArrayEquals(
            byteArrayOf(-1, -40, -1, -39),
            item.copy(heroImageUrl = "data:image/jpeg;base64,/9j/2Q==").landscapeArtworkModel(base) as ByteArray,
        )
    }

    @Test
    fun cardArtworkPreferenceIsUnchanged() {
        val item = CatalogItem("film-1", "Title", "", "", "https://img.example/poster.jpg", "https://img.example/hero.jpg")
        assertEquals("https://img.example/poster.jpg", item.artworkModel(base))
        assertEquals("https://img.example/hero.jpg", item.copy(posterUrl = "").artworkModel(base))
    }
}
