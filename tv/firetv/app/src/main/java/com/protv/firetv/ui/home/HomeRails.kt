package com.protv.firetv.ui.home

import com.protv.firetv.data.api.CatalogItem

data class CategoryRail(
    val key: String,
    val title: String,
    val items: List<CatalogItem>,
    val showItemCategory: Boolean = false,
)

private data class PreferredRail(
    val key: String,
    val title: String,
    val categories: Set<String>,
    val showItemCategory: Boolean = false,
)

private val preferredRails = listOf(
    PreferredRail("black-cinema", "Black Cinema", setOf("black cinema")),
    PreferredRail(
        "animation-anime", "Animation & Anime",
        setOf("anime", "animation", "animated", "cartoons"), showItemCategory = true,
    ),
    PreferredRail("horror", "Horror", setOf("horror")),
    PreferredRail("action", "Action", setOf("action")),
    PreferredRail("comedy", "Comedy", setOf("comedy")),
    PreferredRail("documentaries", "Documentaries", setOf("documentary", "documentaries")),
    PreferredRail("drama", "Drama", setOf("drama")),
    PreferredRail("sci-fi", "Sci-Fi", setOf("sci-fi")),
)

const val UNCATEGORIZED_RAIL_TITLE = "More on PROtv"

/**
 * Groups the catalog into home rails: the PROtv preferred categories first, then every other
 * non-empty category alphabetically, then uncategorized titles. Each title lands in exactly one
 * rail, in catalog order, and empty rails are omitted.
 */
fun buildCategoryRails(items: List<CatalogItem>): List<CategoryRail> {
    val preferred = preferredRails.map { it to mutableListOf<CatalogItem>() }
    val remaining = LinkedHashMap<String, Pair<String, MutableList<CatalogItem>>>()
    val uncategorized = mutableListOf<CatalogItem>()

    for (item in items) {
        val label = item.category.trim()
        val normalized = label.lowercase()
        if (normalized.isEmpty()) {
            uncategorized += item
            continue
        }
        val bucket = preferred.firstOrNull { (rail, _) -> normalized in rail.categories }
        if (bucket != null) {
            bucket.second += item
        } else {
            remaining.getOrPut(normalized) { label to mutableListOf() }.second += item
        }
    }

    return buildList {
        preferred.filter { (_, railItems) -> railItems.isNotEmpty() }.forEach { (rail, railItems) ->
            add(CategoryRail(rail.key, rail.title, railItems.toList(), rail.showItemCategory))
        }
        remaining.entries.sortedBy { it.key }.forEach { (normalized, entry) ->
            add(CategoryRail("category:$normalized", entry.first, entry.second.toList()))
        }
        if (uncategorized.isNotEmpty()) {
            add(CategoryRail("uncategorized", UNCATEGORIZED_RAIL_TITLE, uncategorized.toList()))
        }
    }
}
