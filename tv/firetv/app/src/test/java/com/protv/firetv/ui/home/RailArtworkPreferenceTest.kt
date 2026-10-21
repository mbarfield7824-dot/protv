package com.protv.firetv.ui.home

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RailArtworkPreferenceTest {
    @Test fun catalogPosterIsPreferredWithStillAsFallback() {
        val poster = "https://example.com/poster.jpg"
        val still = "https://image.mux.com/playback/thumbnail.jpg"
        val (primary, fallback) = preferredRailArtwork(poster, still)
        assertEquals(poster, primary)
        assertEquals(still, fallback)
    }

    @Test fun posterRemainsPrimaryWithoutAvailableStill() {
        val (primary, fallback) = preferredRailArtwork("poster", null)
        assertEquals("poster", primary)
        assertNull(fallback)
    }

    @Test fun missingPosterFallsBackToLandscapeStill() {
        val (primary, fallback) = preferredRailArtwork(null, "still")
        assertEquals("still", primary)
        assertNull(fallback)
    }

    @Test fun portraitThumbnailGetsPortraitCardEvenWithoutPosterField() {
        assertEquals(PosterCardAspectRatio, cardAspectFor(442f / 694f, false), 0.001f)
        assertEquals(PosterCardAspectRatio, cardAspectFor(445f / 689f, false), 0.001f)
    }

    @Test fun squareThumbnailGetsSquareCard() {
        assertEquals(SquareCardAspectRatio, cardAspectFor(184f / 173f, false), 0.001f)
    }

    @Test fun landscapeArtRemainsLandscapeAndUnknownUsesFallback() {
        assertEquals(CardAspectRatio, cardAspectFor(16f / 9f, false), 0.001f)
        assertEquals(PosterCardAspectRatio, cardAspectFor(null, true), 0.001f)
    }

    @Test fun titlesWithoutArtworkRemainUnchanged() {
        val (primary, fallback) = preferredRailArtwork(null, null)
        assertNull(primary)
        assertNull(fallback)
    }
}
