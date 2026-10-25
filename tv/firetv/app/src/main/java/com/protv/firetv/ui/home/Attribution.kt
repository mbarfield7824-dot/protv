package com.protv.firetv.ui.home

private val CreativeCommons = Regex(
    "(?i)Creative Commons Attribution(-ShareAlike)? (\\d\\.\\d)\\s*\\((CC BY(?:-SA)? \\d\\.\\d)\\)",
)
private val Credit = Regex("(?i)\\bCredit\\s*:\\s*([^.\\n]+)")

/**
 * The on-screen credit a Creative Commons title must carry, built from the catalog's
 * "Rights: Creative Commons Attribution 3.0 (CC BY 3.0). Credit: Blender Foundation." note and
 * any CC credit in `credits` (such as licensed poster art). Null when no attribution is required:
 * public-domain and CC0 titles have none. [sanitizeDescription] strips these notes from synopses,
 * so this is where they are shown.
 */
fun attributionText(description: String?, credits: String?): String? {
    val parts = mutableListOf<String>()
    CreativeCommons.find(description.orEmpty())?.let { license ->
        val path = if (license.groupValues[1].isEmpty()) "by" else "by-sa"
        val holder = Credit.find(description.orEmpty())?.groupValues?.get(1)?.trim()
        parts += listOfNotNull(
            holder?.let { "© $it" },
            license.groupValues[3],
            "creativecommons.org/licenses/$path/${license.groupValues[2]}",
        ).joinToString(" · ")
    }
    credits?.lineSequence()?.map(String::trim)?.filter { Regex("\\bCC BY").containsMatchIn(it) }?.forEach(parts::add)
    return parts.takeIf { it.isNotEmpty() }?.joinToString("\n")
}
