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

/** Returns the usable curated titles in curated order, with one deterministic fallback if needed. */
fun selectFeaturedTitles(items: List<CatalogItem>): List<CatalogItem> {
    val titled = items.filter { it.title.isNotBlank() }
    val curated = FEATURED_TITLE_IDS.mapNotNull { id -> titled.firstOrNull { it.id == id } }
    if (curated.isNotEmpty()) return curated
    return listOf(titled.firstOrNull { !it.contentTypeText.equals("EPISODE", ignoreCase = true) }
        ?: titled.firstOrNull() ?: return emptyList())
}

/** Returns the first usable featured title for callers that only need one title. */
fun selectFeaturedTitle(items: List<CatalogItem>): CatalogItem? {
    return selectFeaturedTitles(items).firstOrNull()
}

/** Advances a featured position, wrapping safely for empty and single-title sets. */
fun nextFeaturedIndex(current: Int, size: Int): Int =
    if (size <= 1) 0 else (current + 1).mod(size)

/** Moves a featured position backward, wrapping safely for empty and single-title sets. */
fun previousFeaturedIndex(current: Int, size: Int): Int =
    if (size <= 1) 0 else (current - 1).mod(size)

fun sanitizeDescription(description: String?): String? {
    val cleaned = description
        ?.replace(Regex("(?i)\\b(?:rights|license|source|credit|internal rights notes)\\s*:\\s*[^.\\n]*(?:\\.\\s*|$)"), " ")
        ?.replace(Regex("\\s+"), " ")
        ?.trim()
    return cleaned?.takeIf { it.isNotEmpty() }
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
    featuredYear(item),
    item.maturityRatingText,
    item.category.trim().takeIf { it.isNotEmpty() },
    formatRuntime(item.durationSeconds),
)

private val TrailingYear = Regex("""\s*[(\[]\s*(1[89]\d{2}|20\d{2})\s*[)\]]\s*$""")

/**
 * The hero title without a trailing "(1962)". The year is carried by the metadata line instead,
 * which keeps the title to one large line and saves first-viewport height.
 */
fun heroTitle(item: CatalogItem): String {
    val stripped = item.title.replace(TrailingYear, "").trim()
    return stripped.ifEmpty { item.title.trim() }
}

/** The release year, falling back to a year the title itself carries. */
fun featuredYear(item: CatalogItem): String? =
    item.releaseYear?.toString() ?: TrailingYear.find(item.title.trim())?.groupValues?.get(1)

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
