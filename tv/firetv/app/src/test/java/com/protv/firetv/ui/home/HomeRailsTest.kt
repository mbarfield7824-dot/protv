package com.protv.firetv.ui.home

import com.protv.firetv.data.api.CatalogItem
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HomeRailsTest {
    private fun item(id: String, category: String) = CatalogItem(id, "Title $id", category, "", "", "")

    private val catalog = listOf(
        item("drama-1", "Drama"),
        item("ai-1", "AI Cinema"),
        item("doc-1", "Documentary"),
        item("sci-1", "Sci-Fi"),
        item("cartoon-1", "Cartoons"),
        item("comedy-1", "Comedy"),
        item("horror-1", "Horror"),
        item("black-1", "Black Cinema"),
        item("western-1", "Western"),
        item("action-1", "Action"),
        item("black-2", "Black Cinema"),
        item("none-1", "  "),
        item("drama-2", "Drama"),
    )

    @Test
    fun ordersPreferredRailsThenRemainingCategoriesThenUncategorized() {
        assertEquals(
            listOf(
                "Black Cinema", "Animation & Anime", "Horror", "Action", "Comedy",
                "Documentaries", "Drama", "Sci-Fi", "AI Cinema", "Western", UNCATEGORIZED_RAIL_TITLE,
            ),
            buildCategoryRails(catalog).map { it.title },
        )
    }

    @Test
    fun mapsCatalogCategoriesToPreferredDisplayRails() {
        val rails = buildCategoryRails(catalog).associateBy { it.title }
        assertEquals(listOf("cartoon-1"), rails.getValue("Animation & Anime").items.map { it.id })
        assertEquals(listOf("doc-1"), rails.getValue("Documentaries").items.map { it.id })
        assertTrue(rails.getValue("Animation & Anime").showItemCategory)
        assertFalse("Cartoons" in rails)
        assertFalse("Documentary" in rails)
    }

    @Test
    fun omitsEmptyCategories() {
        val titles = buildCategoryRails(listOf(item("drama-1", "Drama"), item("ai-1", "AI Cinema"))).map { it.title }
        assertEquals(listOf("Drama", "AI Cinema"), titles)
        assertFalse("Independent" in titles)
        assertFalse("Music & Hip-Hop" in titles)
        assertTrue(buildCategoryRails(emptyList()).isEmpty())
        assertTrue(buildCategoryRails(catalog).all { it.items.isNotEmpty() })
    }

    @Test
    fun placesEveryTitleExactlyOnceInCatalogOrder() {
        val rails = buildCategoryRails(catalog)
        val placed = rails.flatMap { rail -> rail.items.map { it.id } }
        assertEquals(catalog.size, placed.size)
        assertEquals(catalog.map { it.id }.toSet(), placed.toSet())
        assertEquals(listOf("black-1", "black-2"), rails.first { it.title == "Black Cinema" }.items.map { it.id })
        assertEquals(listOf("drama-1", "drama-2"), rails.first { it.title == "Drama" }.items.map { it.id })
        assertEquals(rails.size, rails.map { it.key }.toSet().size)
    }

    @Test
    fun groupsRemainingCategoriesIgnoringCaseAndSurroundingSpace() {
        val rails = buildCategoryRails(
            listOf(item("a", "Western"), item("b", " western "), item("c", "COMEDY")),
        )
        assertEquals(listOf("Comedy", "Western"), rails.map { it.title })
        assertEquals(listOf("a", "b"), rails.last().items.map { it.id })
    }
}
