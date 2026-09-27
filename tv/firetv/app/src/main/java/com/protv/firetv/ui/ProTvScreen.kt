package com.protv.firetv.ui

import android.util.Log
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Button
import androidx.tv.material3.ButtonDefaults
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import androidx.tv.material3.Card
import androidx.tv.material3.CardDefaults
import coil.compose.SubcomposeAsyncImage
import com.protv.firetv.R
import com.protv.firetv.data.api.CatalogItem
import com.protv.firetv.data.api.CatalogRepository
import com.protv.firetv.data.api.artworkModel
import java.io.IOException
import kotlinx.serialization.SerializationException
import retrofit2.HttpException

private val Midnight = Color(0xFF080C1B)
private val RoyalBlue = Color(0xFF2343A9)
private val ElectricBlue = Color(0xFF328BFF)
private val Silver = Color(0xFFBEC8DD)

private sealed interface CatalogState {
    data object Loading : CatalogState
    data object Unconfigured : CatalogState
    data object Failed : CatalogState
    data class Loaded(val items: List<CatalogItem>) : CatalogState
}

@Composable
fun ProTvScreen(repository: CatalogRepository?, apiBaseUrl: String, onSelect: (CatalogItem) -> Unit) {
    var retry by remember { mutableIntStateOf(0) }
    val state by produceState<CatalogState>(
        initialValue = if (repository == null) CatalogState.Unconfigured else CatalogState.Loading,
        repository,
        retry,
    ) {
        if (repository == null) {
            value = CatalogState.Unconfigured
        } else {
            value = CatalogState.Loading
            try {
                value = CatalogState.Loaded(repository.browse())
            } catch (error: IOException) {
                Log.e("PROtvCatalog", "Network error loading catalog", error)
                value = CatalogState.Failed
            } catch (error: HttpException) {
                Log.e("PROtvCatalog", "HTTP error loading catalog", error)
                value = CatalogState.Failed
            } catch (error: SerializationException) {
                Log.e("PROtvCatalog", "Invalid catalog response", error)
                value = CatalogState.Failed
            } catch (error: IllegalArgumentException) {
                Log.e("PROtvCatalog", "Invalid catalog data", error)
                value = CatalogState.Failed
            }
        }
    }

    MaterialTheme {
        Column(
            modifier = Modifier.fillMaxSize().background(Midnight).padding(vertical = 64.dp),
            verticalArrangement = Arrangement.Center,
        ) {
            Column(modifier = Modifier.padding(horizontal = 80.dp)) {
                Box(modifier = Modifier.size(width = 64.dp, height = 4.dp).background(RoyalBlue))
                Spacer(modifier = Modifier.height(20.dp))
                Text(stringResource(R.string.app_name), color = Color.White, fontSize = 52.sp)
                Text(stringResource(R.string.tagline), color = Silver, fontSize = 24.sp)
                Spacer(modifier = Modifier.height(48.dp))
                Text(
                    stringResource(R.string.catalog_heading),
                    color = Color.White,
                    fontSize = 28.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            Spacer(modifier = Modifier.height(24.dp))
            when (val current = state) {
                CatalogState.Loading -> StatusMessage(stringResource(R.string.catalog_loading))
                CatalogState.Unconfigured -> StatusMessage(stringResource(R.string.catalog_unconfigured))
                CatalogState.Failed -> {
                    StatusMessage(stringResource(R.string.catalog_error))
                    RetryButton { retry++ }
                }
                is CatalogState.Loaded -> {
                    if (current.items.isEmpty()) {
                        StatusMessage(stringResource(R.string.catalog_empty))
                        RetryButton { retry++ }
                    } else {
                        LazyRow(
                            horizontalArrangement = Arrangement.spacedBy(20.dp),
                            modifier = Modifier.fillMaxWidth(),
                            contentPadding = androidx.compose.foundation.layout.PaddingValues(
                                start = 80.dp, end = 80.dp, top = 8.dp, bottom = 12.dp,
                            ),
                        ) {
                            items(current.items, key = { it.id }) { item ->
                                CatalogCard(item, apiBaseUrl, onSelect)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun StatusMessage(message: String) {
    Text(
        text = message,
        color = Silver,
        fontSize = 21.sp,
        modifier = Modifier.padding(horizontal = 80.dp),
    )
}

@Composable
private fun RetryButton(onClick: () -> Unit) {
    Spacer(modifier = Modifier.height(20.dp))
    Button(
        onClick = onClick,
        modifier = Modifier.padding(horizontal = 80.dp),
        colors = ButtonDefaults.colors(
            containerColor = RoyalBlue,
            focusedContainerColor = ElectricBlue,
        ),
    ) {
        Text(stringResource(R.string.catalog_retry))
    }
}

@Composable
private fun CatalogCard(item: CatalogItem, apiBaseUrl: String, onSelect: (CatalogItem) -> Unit) {
    var focused by remember { mutableStateOf(false) }
    val shape = RoundedCornerShape(12.dp)
    Card(
        onClick = { onSelect(item) },
        modifier = Modifier
            .width(280.dp)
            .onFocusChanged { focused = it.isFocused }
            .border(BorderStroke(if (focused) 4.dp else 1.dp, if (focused) ElectricBlue else RoyalBlue), shape)
            .clip(shape),
        colors = CardDefaults.colors(containerColor = Color(0xFF131C38)),
    ) {
        Column(modifier = Modifier.padding(10.dp)) {
            val imageModel = try {
                item.artworkModel(apiBaseUrl)
            } catch (error: IllegalArgumentException) {
                Log.w("PROtvCatalog", "Invalid embedded artwork for catalog ID ${item.id}", error)
                null
            }
            if (imageModel != null) {
                SubcomposeAsyncImage(
                    model = imageModel,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxWidth().height(158.dp).clip(RoundedCornerShape(6.dp)),
                    loading = { ArtworkFallback() },
                    error = { ArtworkFallback() },
                )
            } else {
                ArtworkFallback()
            }
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = item.title.ifBlank { stringResource(R.string.title_unavailable) },
                color = Color.White,
                fontSize = 20.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 2,
                minLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            if (item.category.isNotBlank()) {
                Text(
                    text = item.category,
                    color = Silver,
                    fontSize = 16.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun ArtworkFallback() {
    Box(
        modifier = Modifier.fillMaxWidth().height(158.dp).background(RoyalBlue.copy(alpha = 0.25f)),
        contentAlignment = Alignment.Center,
    ) {
        Text(stringResource(R.string.artwork_unavailable), color = Silver, fontSize = 16.sp)
    }
}
