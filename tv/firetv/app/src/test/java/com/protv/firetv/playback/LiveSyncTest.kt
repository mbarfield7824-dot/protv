package com.protv.firetv.playback

import com.protv.firetv.data.api.LivePlayback
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LiveSyncTest {
    @Test
    fun targetIsScheduleOffsetPlusTimeSinceTheFeedArrived() {
        val playback = LivePlayback(muxPlaybackId = "abc123", offsetSeconds = 100.5)
        assertEquals(100_500L, liveTargetMs(playback, receivedAtMillis = 1_000, nowMillis = 1_000))
        assertEquals(103_500L, liveTargetMs(playback, receivedAtMillis = 1_000, nowMillis = 4_000))
        assertEquals(100_500L, liveTargetMs(playback, receivedAtMillis = 5_000, nowMillis = 4_000))
    }

    @Test
    fun routineRefreshesDoNotSeekUnlessThePlayerDrifted() {
        assertFalse(needsLiveResync(positionMs = 60_000, targetMs = 61_000))
        assertFalse(needsLiveResync(positionMs = 60_000, targetMs = 68_000))
        assertTrue(needsLiveResync(positionMs = 60_000, targetMs = 68_001))
        assertTrue(needsLiveResync(positionMs = 70_000, targetMs = 60_000))
    }
}
