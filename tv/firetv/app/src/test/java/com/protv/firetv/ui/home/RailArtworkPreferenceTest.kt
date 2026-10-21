package com.protv.firetv.ui.home

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RailArtworkPreferenceTest {
    @Test fun landscapeStillIsPreferredWithoutDiscardingPoster() {
        val poster = "https://example.com/poster.jpg"
        val still = "https://image.mux.com/playback/thumbnail.jpg"
        val (primary, fallback) = preferredRailArtwork(poster, still)
        assertEquals(still, primary)
        assertEquals(poster, fallback)
    }

    @Test fun posterRemainsPrimaryWithoutAvailableStill() {
        val (primary, fallback) = preferredRailArtwork("poster", null)
        assertEquals("poster", primary)
        assertNull(fallback)
    }

    @Test fun titlesWithoutArtworkRemainUnchanged() {
        val (primary, fallback) = preferredRailArtwork(null, null)
        assertNull(primary)
        assertNull(fallback)
    }
}
