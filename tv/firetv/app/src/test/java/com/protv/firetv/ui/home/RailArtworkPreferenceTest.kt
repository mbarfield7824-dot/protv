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

    @Test fun titlesWithoutArtworkRemainUnchanged() {
        val (primary, fallback) = preferredRailArtwork(null, null)
        assertNull(primary)
        assertNull(fallback)
    }
}
