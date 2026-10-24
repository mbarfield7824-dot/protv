package com.protv.firetv.playback

import android.view.KeyEvent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PlayerRemoteKeyPolicyTest {
    private val policy = PlayerRemoteKeyPolicy()

    private fun down(keyCode: Int, controlsVisible: Boolean, repeatCount: Int = 0) =
        policy.onKey(keyCode, isDown = true, repeatCount = repeatCount, controlsVisible = controlsVisible)

    private fun up(keyCode: Int, controlsVisible: Boolean) =
        policy.onKey(keyCode, isDown = false, repeatCount = 0, controlsVisible = controlsVisible)

    @Test
    fun playPauseButtonTogglesOncePerPressWhetherOrNotControlsAreVisible() {
        for (visible in listOf(false, true)) {
            assertEquals(PlayerRemoteCommand.TogglePlayPause, down(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, visible))
            assertEquals(PlayerRemoteCommand.Consume, down(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, visible, repeatCount = 1))
            assertEquals(PlayerRemoteCommand.Consume, up(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, visible))
        }
    }

    @Test
    fun selectWithHiddenControlsTogglesAndItsReleaseDoesNotActivateRevealedControls() {
        assertEquals(PlayerRemoteCommand.TogglePlayPause, down(KeyEvent.KEYCODE_DPAD_CENTER, controlsVisible = false))
        // The toggle reveals the controls; a held Select and its release must not also press
        // the newly focused Play/Pause control.
        assertEquals(PlayerRemoteCommand.Consume, down(KeyEvent.KEYCODE_DPAD_CENTER, controlsVisible = true, repeatCount = 1))
        assertEquals(PlayerRemoteCommand.Consume, up(KeyEvent.KEYCODE_DPAD_CENTER, controlsVisible = true))
    }

    @Test
    fun selectWithVisibleControlsIsLeftToTheFocusedControl() {
        for (key in listOf(KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER)) {
            assertEquals(PlayerRemoteCommand.PassThrough, down(key, controlsVisible = true))
            assertEquals(PlayerRemoteCommand.PassThrough, down(key, controlsVisible = true, repeatCount = 1))
            assertEquals(PlayerRemoteCommand.PassThrough, up(key, controlsVisible = true))
        }
    }

    @Test
    fun nextSelectAfterHiddenToggleActivatesOnlyTheHighlightedControl() {
        assertEquals(PlayerRemoteCommand.TogglePlayPause, down(KeyEvent.KEYCODE_DPAD_CENTER, false))
        assertEquals(PlayerRemoteCommand.Consume, up(KeyEvent.KEYCODE_DPAD_CENTER, true))
        assertEquals(PlayerRemoteCommand.PassThrough, down(KeyEvent.KEYCODE_DPAD_CENTER, true))
        assertEquals(PlayerRemoteCommand.PassThrough, up(KeyEvent.KEYCODE_DPAD_CENTER, true))
    }

    @Test
    fun hardwarePlayPauseStillActsAfterNavigatingToAVisibleSettingsControl() {
        assertEquals(PlayerRemoteCommand.PassThrough, down(KeyEvent.KEYCODE_DPAD_DOWN, true))
        assertEquals(PlayerRemoteCommand.PassThrough, up(KeyEvent.KEYCODE_DPAD_DOWN, true))
        assertEquals(PlayerRemoteCommand.TogglePlayPause, down(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, true))
        assertEquals(PlayerRemoteCommand.Consume, up(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, true))
    }

    @Test
    fun enterKeysBehaveLikeSelect() {
        assertEquals(PlayerRemoteCommand.TogglePlayPause, down(KeyEvent.KEYCODE_ENTER, controlsVisible = false))
        assertEquals(PlayerRemoteCommand.Consume, up(KeyEvent.KEYCODE_ENTER, controlsVisible = true))
        assertEquals(PlayerRemoteCommand.TogglePlayPause, down(KeyEvent.KEYCODE_NUMPAD_ENTER, controlsVisible = false))
    }

    @Test
    fun dpadRevealsHiddenControlsAndNavigatesVisibleOnes() {
        for (key in listOf(
            KeyEvent.KEYCODE_DPAD_UP,
            KeyEvent.KEYCODE_DPAD_DOWN,
            KeyEvent.KEYCODE_DPAD_LEFT,
            KeyEvent.KEYCODE_DPAD_RIGHT,
        )) {
            assertEquals(PlayerRemoteCommand.ShowControls, down(key, controlsVisible = false))
            assertEquals(PlayerRemoteCommand.Consume, up(key, controlsVisible = true))
            assertEquals(PlayerRemoteCommand.PassThrough, down(key, controlsVisible = true))
            assertEquals(PlayerRemoteCommand.PassThrough, up(key, controlsVisible = true))
        }
    }

    @Test
    fun backAlwaysReachesTheScreenSoPlaybackCanExit() {
        for (visible in listOf(false, true)) {
            assertEquals(PlayerRemoteCommand.PassThrough, down(KeyEvent.KEYCODE_BACK, visible))
            assertEquals(PlayerRemoteCommand.PassThrough, up(KeyEvent.KEYCODE_BACK, visible))
        }
    }

    @Test
    fun dedicatedPlayAndPauseKeysAreHandled() {
        assertEquals(PlayerRemoteCommand.Play, down(KeyEvent.KEYCODE_MEDIA_PLAY, controlsVisible = false))
        assertEquals(PlayerRemoteCommand.Consume, up(KeyEvent.KEYCODE_MEDIA_PLAY, controlsVisible = true))
        assertEquals(PlayerRemoteCommand.Pause, down(KeyEvent.KEYCODE_MEDIA_PAUSE, controlsVisible = true))
        assertEquals(PlayerRemoteCommand.Consume, up(KeyEvent.KEYCODE_MEDIA_PAUSE, controlsVisible = true))
    }

    @Test
    fun holdingFastForwardOrRewindKeepsSeeking() {
        assertEquals(PlayerRemoteCommand.SeekForward, down(KeyEvent.KEYCODE_MEDIA_FAST_FORWARD, false))
        assertEquals(PlayerRemoteCommand.SeekForward, down(KeyEvent.KEYCODE_MEDIA_FAST_FORWARD, true, repeatCount = 3))
        assertEquals(PlayerRemoteCommand.Consume, up(KeyEvent.KEYCODE_MEDIA_FAST_FORWARD, true))
        assertEquals(PlayerRemoteCommand.SeekBack, down(KeyEvent.KEYCODE_MEDIA_REWIND, true))
        assertEquals(PlayerRemoteCommand.SeekBack, down(KeyEvent.KEYCODE_MEDIA_REWIND, true, repeatCount = 1))
        assertEquals(PlayerRemoteCommand.Consume, up(KeyEvent.KEYCODE_MEDIA_REWIND, true))
    }

    @Test
    fun releaseOfAPressThatWasNotConsumedIsPassedThrough() {
        assertEquals(PlayerRemoteCommand.PassThrough, up(KeyEvent.KEYCODE_DPAD_CENTER, controlsVisible = false))
    }

    @Test
    fun resetDropsPendingConsumedReleases() {
        down(KeyEvent.KEYCODE_DPAD_CENTER, controlsVisible = false)
        policy.reset()
        assertEquals(PlayerRemoteCommand.PassThrough, up(KeyEvent.KEYCODE_DPAD_CENTER, controlsVisible = true))
    }

    @Test
    fun repeatedPlayPausePressesToggleEachTime() {
        repeat(3) {
            assertEquals(PlayerRemoteCommand.TogglePlayPause, down(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, it % 2 == 0))
            assertEquals(PlayerRemoteCommand.Consume, up(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, true))
        }
    }

    @Test
    fun otherKeysAreNotIntercepted() {
        assertEquals(PlayerRemoteCommand.PassThrough, down(KeyEvent.KEYCODE_MENU, controlsVisible = false))
        assertEquals(PlayerRemoteCommand.PassThrough, down(KeyEvent.KEYCODE_SEARCH, controlsVisible = true))
    }
}

class RemoteKeyDispatcherTest {
    @Test
    fun unregisteredDispatcherDoesNotConsumeKeys() {
        assertFalse(RemoteKeyDispatcher<Int>().dispatch(1))
    }

    @Test
    fun registeredHandlerDecidesAndUnregisterRestoresDefaultRouting() {
        val dispatcher = RemoteKeyDispatcher<Int>()
        val unregister = dispatcher.register { it == 7 }
        assertTrue(dispatcher.dispatch(7))
        assertFalse(dispatcher.dispatch(8))
        unregister()
        assertFalse(dispatcher.dispatch(7))
    }

    @Test
    fun staleUnregisterDoesNotRemoveANewerPlayer() {
        val dispatcher = RemoteKeyDispatcher<Int>()
        val unregisterOld = dispatcher.register { false }
        dispatcher.register { true }
        unregisterOld()
        assertTrue(dispatcher.dispatch(1))
    }
}
