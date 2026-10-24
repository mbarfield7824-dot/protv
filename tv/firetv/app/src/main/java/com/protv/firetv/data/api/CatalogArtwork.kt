package com.protv.firetv.data.api

import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okio.ByteString.Companion.decodeBase64
import kotlin.math.roundToInt

fun CatalogItem.artworkUrl(baseUrl: String): String? {
    val raw = sequenceOf(posterUrl, thumbnailUrl, heroImageUrl)
        .firstOrNull { it.isNotBlank() } ?: return null
    return resolveArtworkUrl(raw, baseUrl)
}

private fun resolveArtworkUrl(raw: String, baseUrl: String): String? {
    val base = baseUrl.toHttpUrlOrNull() ?: return null
    val url = base.resolve(raw) ?: return null
    return url.toString().takeIf { url.scheme == "https" || (base.scheme == "http" && url.scheme == "http") }
}

fun CatalogItem.artworkModel(baseUrl: String): Any? {
    val raw = sequenceOf(posterUrl, thumbnailUrl, heroImageUrl)
        .firstOrNull { it.isNotBlank() } ?: return null
    return artworkSourceModel(raw, baseUrl)
}

/**
 * The catalog's dedicated landscape backdrop (`heroImageUrl`), for the hero only. Poster and
 * thumbnail fields carry portrait or small square art and are never stretched to the full screen
 * when this is set.
 */
fun CatalogItem.landscapeArtworkModel(baseUrl: String): Any? =
    heroImageUrl.takeIf { it.isNotBlank() }?.let { artworkSourceModel(it, baseUrl) }

private fun artworkSourceModel(raw: String, baseUrl: String): Any? {
    val prefix = "data:image/jpeg;base64,"
    if (raw.startsWith(prefix, ignoreCase = true)) {
        val encoded = raw.substring(prefix.length)
        require(encoded.length <= 1_400_000) { "Embedded JPEG artwork exceeds the size limit" }
        return requireNotNull(encoded.decodeBase64()) { "Embedded JPEG artwork is invalid" }.toByteArray()
    }
    return resolveArtworkUrl(raw, baseUrl)
}

/** How a card presents loaded artwork. */
enum class ArtworkFit {
    Crop,
    Fit,
}

/** Fill only when cropping trims at most 15% of an image dimension; otherwise show the whole art. */
fun artworkFitFor(width: Int, height: Int, targetAspectRatio: Float = 16f / 9f): ArtworkFit {
    if (width <= 0 || height <= 0) return ArtworkFit.Fit
    val retainedWidth = height * targetAspectRatio
    val retainedHeight = width / targetAspectRatio
    return if (width >= retainedWidth * 0.85f && height >= retainedHeight * 0.85f) {
        ArtworkFit.Crop
    } else {
        ArtworkFit.Fit
    }
}

/**
 * A rail-sized still sampled inside the title's runtime rather than at a universal 30 seconds,
 * so fallbacks land on representative frames instead of opening credits and title cards.
 */
fun CatalogItem.muxStillArtwork(): String? {
    val playbackId = publicMuxPlaybackId ?: return null
    val duration = durationSeconds ?: 0
    val time = if (duration > 0) {
        minOf(maxOf(1, (duration * 0.42).roundToInt()), maxOf(1, duration - 5))
    } else {
        30
    }
    return "https://image.mux.com/$playbackId/thumbnail.jpg?time=$time&width=640&height=360&fit_mode=smartcrop"
}
