package com.protv.firetv.account

import com.protv.firetv.data.api.ApiClient
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.io.IOException
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlin.math.roundToInt
import retrofit2.HttpException
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.PUT
import retrofit2.http.Path
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

@Serializable
data class FavoriteUpdateRequest(val favorite: Boolean)

@Serializable
data class WatchProgressRequest(val positionSeconds: Double, val durationSeconds: Double)

@Serializable
data class WatchProgressEntry(
    val positionSeconds: Double,
    val durationSeconds: Double,
    val progressPercent: Int,
    val updatedAt: Long,
)

interface ViewerAccountApi {
    @GET("users/me/favorites")
    suspend fun favorites(@Header("Authorization") authorization: String): List<String>

    @PUT("users/me/favorites/{videoId}")
    suspend fun setFavorite(
        @Header("Authorization") authorization: String,
        @Path("videoId") videoId: String,
        @Body request: FavoriteUpdateRequest,
    )

    @GET("users/me/progress")
    suspend fun progress(
        @Header("Authorization") authorization: String,
    ): Map<String, WatchProgressEntry>

    @PUT("users/me/progress/{videoId}")
    suspend fun setProgress(
        @Header("Authorization") authorization: String,
        @Path("videoId") videoId: String,
        @Body request: WatchProgressRequest,
    )

    @DELETE("users/me/progress/{videoId}")
    suspend fun clearProgress(
        @Header("Authorization") authorization: String,
        @Path("videoId") videoId: String,
    )
}

class ViewerAccountRepository(private val api: ViewerAccountApi) {
    suspend fun favorites(idToken: String): Set<String> =
        api.favorites(bearer(idToken)).also { ids ->
            require(ids.all(String::isNotBlank)) { "Favorites response contains an invalid title ID" }
        }.toSet()

    suspend fun setFavorite(idToken: String, videoId: String, favorite: Boolean) {
        require(videoId.isNotBlank()) { "Title ID is required" }
        api.setFavorite(bearer(idToken), videoId, FavoriteUpdateRequest(favorite))
    }

    suspend fun progress(idToken: String): Map<String, WatchProgressEntry> =
        api.progress(bearer(idToken)).also { entries ->
            require(entries.all { (id, entry) ->
                id.isNotBlank()
                    && entry.positionSeconds.isFinite()
                    && entry.durationSeconds.isFinite()
                    && entry.positionSeconds >= 0
                    && entry.durationSeconds > 0
                    && entry.progressPercent in 0..100
                    && entry.updatedAt >= 0
            }) { "Watch progress response contains invalid data" }
        }

    suspend fun setProgress(idToken: String, videoId: String, positionSeconds: Double, durationSeconds: Double) {
        require(videoId.isNotBlank()) { "Title ID is required" }
        require(positionSeconds.isFinite() && positionSeconds >= 0) { "Playback position is invalid" }
        require(durationSeconds.isFinite() && durationSeconds > 0) { "Playback duration is invalid" }
        api.setProgress(
            bearer(idToken),
            videoId,
            WatchProgressRequest(positionSeconds, durationSeconds),
        )
    }

    suspend fun clearProgress(idToken: String, videoId: String) {
        require(videoId.isNotBlank()) { "Title ID is required" }
        api.clearProgress(bearer(idToken), videoId)
    }

    private fun bearer(idToken: String): String {
        require(idToken.isNotBlank()) { "A Firebase ID token is required" }
        return "Bearer $idToken"
    }
}

object ViewerAccountApiClient {
    fun create(baseUrl: String): ViewerAccountRepository =
        ViewerAccountRepository(ApiClient.create(baseUrl).create(ViewerAccountApi::class.java))
}

data class ViewerAccountState(
    val favorites: Set<String> = emptySet(),
    val progress: Map<String, WatchProgressEntry> = emptyMap(),
    val loading: Boolean = false,
    val error: String? = null,
)

class ViewerAccountController(
    private val repository: ViewerAccountRepository?,
    private val auth: ViewerAuthGateway?,
    private val progressStore: WatchProgressStore? = null,
) {
    private var loadedViewerId: String? = null
    private val progressSync = Mutex()
    var state by mutableStateOf(ViewerAccountState())
        private set

    suspend fun load() {
        val viewerId = auth?.viewerId
        if (repository == null || viewerId == null) {
            loadedViewerId = null
            state = ViewerAccountState()
            return
        }
        if (loadedViewerId != viewerId) state = ViewerAccountState()
        loadedViewerId = viewerId
        state = state.copy(loading = true, error = null)
        try {
            state = state.copy(progress = mergeWatchProgress(state.progress, progressStore?.read(viewerId).orEmpty()))
            val token = requireNotNull(auth.idToken()) { "Firebase did not provide an ID token" }
            val progress = repository.progress(token)
            if (auth.viewerId != viewerId) return
            state = state.copy(progress = mergeWatchProgress(progress, state.progress))
            progressStore?.write(viewerId, state.progress)
            val favorites = repository.favorites(token)
            if (auth.viewerId != viewerId) return
            state = state.copy(favorites = favorites, loading = false)
            for ((id, entry) in state.progress) {
                if (entry.updatedAt > (progress[id]?.updatedAt ?: -1)) {
                    saveProgress(id, entry.positionSeconds, entry.durationSeconds)
                }
            }
        } catch (error: kotlinx.coroutines.CancellationException) {
            throw error
        } catch (error: IOException) {
            state = state.copy(loading = false, error = "Your PROtv account data could not be loaded. Check the connection and retry.")
        } catch (error: HttpException) {
            state = state.copy(loading = false, error = "Your PROtv account data could not be loaded. Sign in again or retry.")
        } catch (error: SerializationException) {
            state = state.copy(loading = false, error = "The PROtv account response was invalid.")
        } catch (error: IllegalArgumentException) {
            state = state.copy(loading = false, error = "The PROtv account response was invalid.")
        } catch (error: IllegalStateException) {
            state = state.copy(loading = false, error = "Your PROtv account data could not be loaded. Sign in again or retry.")
        } catch (error: com.google.firebase.FirebaseException) {
            state = state.copy(loading = false, error = "Your PROtv account session could not be refreshed. Sign in again and retry.")
        }
    }

    suspend fun toggleFavorite(videoId: String) {
        val current = state
        val favorite = videoId !in current.favorites
        val accountLabel = auth?.accountLabel
        if (repository == null || accountLabel == null) {
            state = current.copy(error = "Sign in to manage My List.")
            return
        }
        state = current.copy(
            favorites = if (favorite) current.favorites + videoId else current.favorites - videoId,
            error = null,
        )
        try {
            val token = requireNotNull(auth.idToken()) { "Firebase did not provide an ID token" }
            repository.setFavorite(token, videoId, favorite)
        } catch (error: kotlinx.coroutines.CancellationException) {
            if (auth.accountLabel == accountLabel) state = current
            throw error
        } catch (error: IOException) {
            if (auth.accountLabel == accountLabel) {
                state = current.copy(error = "My List could not be updated. Check the connection and retry.")
            }
        } catch (error: HttpException) {
            if (auth.accountLabel == accountLabel) {
                state = current.copy(error = "My List could not be updated. Sign in again or retry.")
            }
        } catch (error: SerializationException) {
            if (auth.accountLabel == accountLabel) state = current.copy(error = "The My List response was invalid.")
        } catch (error: IllegalArgumentException) {
            if (auth.accountLabel == accountLabel) state = current.copy(error = "The My List response was invalid.")
        } catch (error: IllegalStateException) {
            if (auth.accountLabel == accountLabel) {
                state = current.copy(error = "My List could not be updated. Sign in again or retry.")
            }
        } catch (error: com.google.firebase.FirebaseException) {
            if (auth.accountLabel == accountLabel) {
                state = current.copy(error = "Your PROtv account session could not be refreshed. Sign in again and retry.")
            }
        }
    }

    fun recordProgress(videoId: String, positionSeconds: Double, durationSeconds: Double) {
        val viewerId = auth?.viewerId ?: return
        if (!positionSeconds.isFinite() || positionSeconds <= 0 || !durationSeconds.isFinite() || durationSeconds <= 0) {
            state = state.copy(error = "Watch progress was invalid and could not be saved.")
            return
        }
        val entry = WatchProgressEntry(
            positionSeconds, durationSeconds,
            (positionSeconds / durationSeconds * 100).roundToInt().coerceIn(0, 100),
            System.currentTimeMillis(),
        )
        state = state.copy(progress = state.progress + (videoId to entry))
        try {
            progressStore?.write(viewerId, state.progress)
        } catch (error: IOException) {
            state = state.copy(error = "Watch progress could not be saved on this device. Check storage and retry.")
        }
    }

    suspend fun saveProgress(videoId: String, positionSeconds: Double, durationSeconds: Double) = progressSync.withLock {
        val accountLabel = auth?.accountLabel
        if (repository == null || accountLabel == null) return
        try {
            val token = requireNotNull(auth.idToken()) { "Firebase did not provide an ID token" }
            val latest = state.progress[videoId]
            val position = latest?.positionSeconds ?: positionSeconds
            val duration = latest?.durationSeconds ?: durationSeconds
            repository.setProgress(token, videoId, position, duration)
            if (auth.accountLabel != accountLabel) return
            if (state.progress[videoId] == latest) {
                val percent = (position / duration * 100).roundToInt().coerceIn(0, 100)
                state = state.copy(
                    progress = state.progress + (videoId to WatchProgressEntry(
                        positionSeconds = position,
                        durationSeconds = duration,
                        progressPercent = percent,
                        updatedAt = latest?.updatedAt ?: System.currentTimeMillis(),
                    )),
                    error = null,
                )
                auth.viewerId?.let { progressStore?.write(it, state.progress) }
            }
        } catch (error: kotlinx.coroutines.CancellationException) {
            throw error
        } catch (error: IOException) {
            if (auth.accountLabel == accountLabel) {
                state = state.copy(error = "Watch progress could not be synced. Playback can continue; retry from your account.")
            }
        } catch (error: HttpException) {
            if (auth.accountLabel == accountLabel) {
                state = state.copy(error = "Watch progress could not be synced. Sign in again or retry.")
            }
        } catch (error: SerializationException) {
            if (auth.accountLabel == accountLabel) state = state.copy(error = "The watch progress response was invalid.")
        } catch (error: IllegalArgumentException) {
            if (auth.accountLabel == accountLabel) state = state.copy(error = "The watch progress response was invalid.")
        } catch (error: IllegalStateException) {
            if (auth.accountLabel == accountLabel) {
                state = state.copy(error = "Watch progress could not be synced. Playback can continue; retry from your account.")
            }
        } catch (error: com.google.firebase.FirebaseException) {
            if (auth.accountLabel == accountLabel) {
                state = state.copy(error = "Your PROtv account session could not be refreshed. Sign in again and retry.")
            }
        }
    }

    suspend fun clearProgress(videoId: String) {
        val accountLabel = auth?.accountLabel
        if (repository == null || accountLabel == null) return
        val previous = state.progress
        state = state.copy(progress = previous - videoId, error = null)
        try {
            val token = requireNotNull(auth.idToken()) { "Firebase did not provide an ID token" }
            repository.clearProgress(token, videoId)
            if (auth.accountLabel != accountLabel) return
        } catch (error: kotlinx.coroutines.CancellationException) {
            if (auth.accountLabel == accountLabel) state = state.copy(progress = previous)
            throw error
        } catch (error: IOException) {
            if (auth.accountLabel == accountLabel) {
                state = state.copy(
                    progress = previous,
                    error = "Watch history could not be updated. Check the connection and retry.",
                )
            }
        } catch (error: HttpException) {
            if (auth.accountLabel == accountLabel) {
                state = state.copy(
                    progress = previous,
                    error = "Watch history could not be updated. Sign in again or retry.",
                )
            }
        } catch (error: SerializationException) {
            if (auth.accountLabel == accountLabel) {
                state = state.copy(
                    progress = previous,
                    error = "The watch history response was invalid.",
                )
            }
        } catch (error: IllegalArgumentException) {
            if (auth.accountLabel == accountLabel) {
                state = state.copy(
                    progress = previous,
                    error = "The watch history response was invalid.",
                )
            }
        } catch (error: IllegalStateException) {
            if (auth.accountLabel == accountLabel) {
                state = state.copy(
                    progress = previous,
                    error = "Watch history could not be updated. Sign in again or retry.",
                )
            }
        } catch (error: com.google.firebase.FirebaseException) {
            if (auth.accountLabel == accountLabel) {
                state = state.copy(
                    progress = previous,
                    error = "Your PROtv account session could not be refreshed. Sign in again and retry.",
                )
            }
        } finally {
            if (auth.accountLabel == accountLabel) {
                try {
                    auth.viewerId?.let { progressStore?.write(it, state.progress) }
                } catch (error: IOException) {
                    state = state.copy(error = "Watch history could not be saved on this device. Check storage and retry.")
                }
            }
        }
    }
}
