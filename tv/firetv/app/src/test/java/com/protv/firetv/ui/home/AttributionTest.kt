package com.protv.firetv.ui.home

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AttributionTest {
    @Test
    fun buildsTheCreditAndLicenceForCcByTitles() {
        val description = "A rabbit's revenge. Rights: Creative Commons Attribution 3.0 (CC BY 3.0). Credit: Blender Foundation."
        assertEquals(
            "© Blender Foundation · CC BY 3.0 · creativecommons.org/licenses/by/3.0",
            attributionText(description, null),
        )
    }

    @Test
    fun keepsTheLicenceVersionTheCatalogStates() {
        val description = "Two characters. Rights: Creative Commons Attribution 2.5 (CC BY 2.5). Credit: Blender Foundation."
        assertEquals(
            "© Blender Foundation · CC BY 2.5 · creativecommons.org/licenses/by/2.5",
            attributionText(description, null),
        )
    }

    @Test
    fun addsCcCreditsForLicensedArtworkButNotForCc0Films() {
        val description = "A goddess. Rights: Film dedicated to the public domain (CC0) by Nina Paley."
        val credits = "Poster artwork: Nina Paley, CC BY-SA 3.0, via Wikimedia Commons."
        assertEquals(credits, attributionText(description, credits))
    }

    @Test
    fun publicDomainAndUncreditedTitlesNeedNoAttribution() {
        assertNull(attributionText("A 1938 musical. Rights: Public domain.", null))
        assertNull(attributionText(null, "Written and directed by D.G. Allstrum."))
    }

    @Test
    fun theSynopsisStillHidesTheNoteThatAttributionNowShows() {
        val description = "A rabbit's revenge. Rights: Creative Commons Attribution 3.0 (CC BY 3.0). Credit: Blender Foundation."
        assertEquals("A rabbit's revenge.", sanitizeDescription(description))
    }
}
