package com.protv.firetv.ui.home

import com.protv.firetv.data.api.CatalogItem
import com.protv.firetv.data.api.contentTypeText
import com.protv.firetv.data.api.durationSeconds
import com.protv.firetv.data.api.maturityRatingText
import com.protv.firetv.data.api.publicMuxPlaybackId
import com.protv.firetv.data.api.releaseYear
import kotlin.math.roundToInt

/** The same curated hero titles, in the same order, as the PROtv 2.0 web home (`FEATURED_PROTV_TITLE_IDS`). */
val FEATURED_TITLE_IDS = listOf(
    "3NAU6BldsmCNs9wjM08a",
    "WIVB9NPQQzvtvjTBsiKw",
    "B2MDEH2b25NknMQMEhoM",
    "zGpbFWvSaup6ioUaoqsN",
)

/** Vetted still times (seconds) shared with the web's `STILL_TIMES`, for curated titles that have one. */
private val curatedStillTimes = mapOf("WIVB9NPQQzvtvjTBsiKw" to 1174)

private const val HERO_STILL_WIDTH = 1280
private const val HERO_STILL_HEIGHT = 720

/**
 * Picks the one featured title: the first curated ID present in the catalog, otherwise the
 * first titled non-episode, otherwise the first titled item. No rotation or ranking.
 */
fun selectFeaturedTitle(items: List<CatalogItem>): CatalogItem? {
    val titled = items.filter { it.title.isNotBlank() }
    return FEATURED_TITLE_IDS.firstNotNullOfOrNull { id -> titled.firstOrNull { it.id == id } }
        ?: titled.firstOrNull { !it.contentTypeText.equals("EPISODE", ignoreCase = true) }
        ?: titled.firstOrNull()
}

/** Formats a runtime in seconds as "1h 13m", "45m" or "2h"; null when unknown. */
fun formatRuntime(seconds: Int?): String? {
    if (seconds == null || seconds <= 0) return null
    val minutes = maxOf(1, (seconds / 60.0).roundToInt())
    val hours = minutes / 60
    val rest = minutes % 60
    return when {
        hours == 0 -> "${rest}m"
        rest == 0 -> "${hours}h"
        else -> "${hours}h ${rest}m"
    }
}

/** Category, year, runtime and rating — only the values the catalog actually provides. */
fun featuredMetadata(item: CatalogItem): List<String> = listOfNotNull(
    item.category.trim().takeIf { it.isNotEmpty() },
    item.releaseYear?.toString(),
    formatRuntime(item.durationSeconds),
    item.maturityRatingText,
)

/**
 * A landscape Mux still for the hero, sampled inside the runtime (the same rule as the web's
 * `muxStillUrl`) to avoid title cards and black frames. Null without a public playback ID.
 */
fun heroStillUrl(item: CatalogItem): String? {
    val playbackId = item.publicMuxPlaybackId ?: return null
    val duration = item.durationSeconds ?: 0
    val sampled = curatedStillTimes[item.id] ?: (duration * 0.42).roundToInt().takeIf { it > 0 } ?: 30
    val time = if (duration > 0) minOf(sampled, maxOf(1, duration - 5)) else sampled
    return "https://image.mux.com/$playbackId/thumbnail.jpg" +
        "?time=$time&width=$HERO_STILL_WIDTH&height=$HERO_STILL_HEIGHT&fit_mode=smartcrop"
}
