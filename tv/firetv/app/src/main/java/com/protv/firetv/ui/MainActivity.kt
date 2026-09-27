package com.protv.firetv.ui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.protv.firetv.BuildConfig
import com.protv.firetv.data.api.CatalogApiClient
import com.protv.firetv.playback.PlaybackApiClient
import com.protv.firetv.playback.PlayerScreen

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val apiBaseUrl = BuildConfig.API_BASE_URL
        val catalog = if (apiBaseUrl.isBlank()) null else CatalogApiClient.create(apiBaseUrl)
        val playback = if (apiBaseUrl.isBlank()) null else PlaybackApiClient.create(apiBaseUrl)
        setContent {
            var selectedTitle by remember { mutableStateOf<Pair<String, String>?>(null) }
            val selection = selectedTitle
            if (selection != null && playback != null) {
                PlayerScreen(
                    titleId = selection.first,
                    title = selection.second,
                    repository = playback,
                    onExit = { selectedTitle = null },
                )
            } else {
                ProTvScreen(catalog, apiBaseUrl) { item ->
                    selectedTitle = item.id to item.title
                }
            }
        }
    }
}
