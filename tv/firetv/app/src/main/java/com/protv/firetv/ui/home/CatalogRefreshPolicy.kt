package com.protv.firetv.ui.home

/**
 * When the home catalog is checked again in the background, so newly released titles and episodes appear without
 * restarting the app:
 *  - when the app is in front and the catalog is 15 minutes old (also right after returning to the foreground), and
 *  - shortly after every half hour. Premieres are released on the hour or half hour (PROtv's weekly shows at 8 PM
 *    Eastern); every US time zone is a whole number of hours from UTC, so UTC half hours are local half hours too.
 * Failed checks are retried at most once a minute. The catalog response is a few kilobytes and is never cached.
 */
object CatalogRefreshPolicy {
    const val STALE_MILLIS = 15 * 60_000L
    const val PREMIERE_SLOT_MILLIS = 30 * 60_000L
    /** Time after a slot for the release to be published before the catalog is read. */
    const val PREMIERE_GRACE_MILLIS = 60_000L
    const val RETRY_MILLIS = 60_000L
    const val CHECK_INTERVAL_MILLIS = 60_000L

    fun isDue(loadedAtMillis: Long, lastAttemptMillis: Long, nowMillis: Long): Boolean {
        if (loadedAtMillis <= 0L) return false
        // A device clock set back (for example corrected by the network) never blocks checks.
        if (nowMillis >= lastAttemptMillis && nowMillis - lastAttemptMillis < RETRY_MILLIS) return false
        if (nowMillis < loadedAtMillis || nowMillis - loadedAtMillis >= STALE_MILLIS) return true
        val slot = Math.floorDiv(nowMillis - PREMIERE_GRACE_MILLIS, PREMIERE_SLOT_MILLIS) * PREMIERE_SLOT_MILLIS
        return slot + PREMIERE_GRACE_MILLIS > loadedAtMillis
    }
}
