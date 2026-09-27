package com.protv.firetv.data.api

class CatalogRepository(private val api: CatalogApi) {
    suspend fun browse(): List<CatalogItem> {
        val items = api.browse().items
        require(items.all { it.id.isNotBlank() } && items.map { it.id }.distinct().size == items.size) {
            "Catalog contains missing or duplicate IDs"
        }
        return items
    }
}
