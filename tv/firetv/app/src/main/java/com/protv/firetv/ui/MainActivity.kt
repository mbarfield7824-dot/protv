package com.protv.firetv.ui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.protv.firetv.BuildConfig
import com.protv.firetv.data.api.CatalogApiClient

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val apiBaseUrl = BuildConfig.API_BASE_URL
        val repository = if (apiBaseUrl.isBlank()) null else CatalogApiClient.create(apiBaseUrl)
        setContent { ProTvScreen(repository, apiBaseUrl) }
    }
}
