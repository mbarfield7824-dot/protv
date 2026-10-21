package com.protv.firetv.account

import android.content.Context
import android.annotation.SuppressLint
import java.io.IOException
import java.security.MessageDigest
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

interface WatchProgressStore {
    fun read(viewerId: String): Map<String, WatchProgressEntry>
    fun write(viewerId: String, progress: Map<String, WatchProgressEntry>)
}

class DeviceWatchProgressStore(context: Context) : WatchProgressStore {
    private val preferences = context.getSharedPreferences("viewer-watch-progress", Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true }

    private fun key(viewerId: String): String =
        MessageDigest.getInstance("SHA-256").digest(viewerId.toByteArray())
            .joinToString("") { "%02x".format(it) }

    override fun read(viewerId: String): Map<String, WatchProgressEntry> =
        preferences.getString(key(viewerId), null)?.let { json.decodeFromString(it) } ?: emptyMap()

    @SuppressLint("UseKtx") // The commit result is required to report storage failures.
    override fun write(viewerId: String, progress: Map<String, WatchProgressEntry>) {
        if (!preferences.edit().putString(key(viewerId), json.encodeToString(progress)).commit()) {
            throw IOException("Watch progress could not be saved on this device")
        }
    }
}

internal fun mergeWatchProgress(
    remote: Map<String, WatchProgressEntry>,
    local: Map<String, WatchProgressEntry>,
): Map<String, WatchProgressEntry> = (remote.keys + local.keys).associateWith { id ->
    val saved = local[id]
    val synced = remote[id]
    if (saved != null && (synced == null || saved.updatedAt > synced.updatedAt)) saved else requireNotNull(synced)
}
