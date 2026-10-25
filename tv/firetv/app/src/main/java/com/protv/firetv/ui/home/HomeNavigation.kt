package com.protv.firetv.ui.home

enum class HomeDestination(val label: String) {
    Home("Home"),
    Movies("Movies"),
    TV("TV"),
    Music("Music"),
    Podcasts("Podcasts"),
    NewReleases("New Releases"),
    ContinueWatching("Continue Watching"),
    MyList("My List"),
    Search("Search"),
    Settings("Settings"),
}

/** Catalog sections that only appear in the drawer once the catalog has titles for them. */
private val ContentDependentDestinations = setOf(HomeDestination.Music, HomeDestination.Podcasts, HomeDestination.NewReleases)

fun visibleDestinations(rails: List<HomeRail>): List<HomeDestination> =
    HomeDestination.entries.filter { it !in ContentDependentDestinations || destinationRails(rails, it).isNotEmpty() }

fun destinationRails(rails: List<HomeRail>, destination: HomeDestination): List<HomeRail> {
    val catalog = rails.filter { it.key !in setOf("my-list", "continue-watching", "watch-history") }
    val recent = catalog.flatMap(HomeRail::tiles).distinctBy { it.id }
        .filter { it.addedAt != null }.sortedByDescending { it.addedAt }
    return when (destination) {
        HomeDestination.Home -> buildList {
            addAll(rails.filter { it.key == "continue-watching" })
            if (recent.isNotEmpty()) add(HomeRail("new-releases", "New Releases", recent.take(20)))
            addAll(rails.filter { it.key != "continue-watching" && it.key != "watch-history" })
        }
        HomeDestination.ContinueWatching -> rails.filter { it.key == "continue-watching" }
        HomeDestination.MyList -> rails.filter { it.key == "my-list" }
        HomeDestination.NewReleases -> if (recent.isEmpty()) emptyList() else listOf(HomeRail("new-releases", "New Releases", recent))
        HomeDestination.Movies, HomeDestination.TV, HomeDestination.Music, HomeDestination.Podcasts ->
            catalog.mapNotNull { rail ->
                val tiles = rail.tiles.filter { tile ->
                    val type = tile.contentType.uppercase()
                    when (destination) {
                        HomeDestination.TV -> type in setOf("EPISODE", "SHOW", "SERIES")
                        HomeDestination.Music -> type == "MUSIC" || tile.category.equals("Music", true)
                        HomeDestination.Podcasts -> type.startsWith("PODCAST")
                        else -> type in setOf("MOVIE", "ORIGINAL") && !tile.category.equals("Music", true)
                    }
                }
                rail.copy(tiles = tiles).takeIf { tiles.isNotEmpty() }
            }
        else -> emptyList()
    }
}
