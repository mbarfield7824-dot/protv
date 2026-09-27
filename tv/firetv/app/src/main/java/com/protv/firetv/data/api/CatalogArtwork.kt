package com.protv.firetv.data.api

import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okio.ByteString.Companion.decodeBase64

fun CatalogItem.artworkUrl(baseUrl: String): String? {
    val raw = sequenceOf(thumbnailUrl, posterUrl, heroImageUrl)
        .firstOrNull { it.isNotBlank() } ?: return null
    val base = baseUrl.toHttpUrlOrNull() ?: return null
    val url = base.resolve(raw) ?: return null
    return url.toString().takeIf { url.scheme == "https" || (base.scheme == "http" && url.scheme == "http") }
}

fun CatalogItem.artworkModel(baseUrl: String): Any? {
    val raw = sequenceOf(thumbnailUrl, posterUrl, heroImageUrl)
        .firstOrNull { it.isNotBlank() } ?: return null
    val prefix = "data:image/jpeg;base64,"
    if (raw.startsWith(prefix, ignoreCase = true)) {
        val encoded = raw.substring(prefix.length)
        require(encoded.length <= 1_400_000) { "Embedded JPEG artwork exceeds the size limit" }
        return requireNotNull(encoded.decodeBase64()) { "Embedded JPEG artwork is invalid" }.toByteArray()
    }
    return artworkUrl(baseUrl)
}
