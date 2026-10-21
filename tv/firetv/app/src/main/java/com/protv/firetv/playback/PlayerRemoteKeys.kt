package com.protv.firetv.playback

import android.view.KeyEvent

internal enum class PlayerRemoteCommand {
    PassThrough,
    Consume,
    TogglePlayPause,
    Play,
    Pause,
    SeekForward,
    SeekBack,
    ShowControls,
}

/**
 * Decides how a Fire TV remote key affects playback before the view hierarchy sees it, so playback
 * keys work regardless of whether Media3's PlayerView or a Compose overlay holds focus.
 *
 * A key whose press was consumed also has its repeats and release consumed. This prevents the
 * release from reaching a control revealed by the press.
 */
internal class PlayerRemoteKeyPolicy {
    private val consumedPresses = mutableSetOf<Int>()

    fun onKey(keyCode: Int, isDown: Boolean, repeatCount: Int, controlsVisible: Boolean): PlayerRemoteCommand {
        if (!isDown) {
            return if (consumedPresses.remove(keyCode)) PlayerRemoteCommand.Consume else PlayerRemoteCommand.PassThrough
        }
        if (repeatCount > 0 && keyCode in consumedPresses && keyCode !in SeekKeys) {
            return PlayerRemoteCommand.Consume
        }
        val command = classify(keyCode, repeatCount, controlsVisible)
        if (command == PlayerRemoteCommand.PassThrough) consumedPresses.remove(keyCode) else consumedPresses.add(keyCode)
        return command
    }

    fun reset() {
        consumedPresses.clear()
    }

    private fun classify(keyCode: Int, repeatCount: Int, controlsVisible: Boolean): PlayerRemoteCommand =
        when (keyCode) {
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, KeyEvent.KEYCODE_HEADSETHOOK ->
                if (repeatCount == 0) PlayerRemoteCommand.TogglePlayPause else PlayerRemoteCommand.Consume
            KeyEvent.KEYCODE_MEDIA_PLAY ->
                if (repeatCount == 0) PlayerRemoteCommand.Play else PlayerRemoteCommand.Consume
            KeyEvent.KEYCODE_MEDIA_PAUSE ->
                if (repeatCount == 0) PlayerRemoteCommand.Pause else PlayerRemoteCommand.Consume
            KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> PlayerRemoteCommand.SeekForward
            KeyEvent.KEYCODE_MEDIA_REWIND -> PlayerRemoteCommand.SeekBack
            in PlayerSelectKeys -> when {
                // Visible controls own Select so the focused control (including Play/Pause) acts.
                controlsVisible -> PlayerRemoteCommand.PassThrough
                repeatCount == 0 -> PlayerRemoteCommand.TogglePlayPause
                else -> PlayerRemoteCommand.Consume
            }
            in DirectionKeys ->
                if (controlsVisible) PlayerRemoteCommand.PassThrough else PlayerRemoteCommand.ShowControls
            else -> PlayerRemoteCommand.PassThrough
        }

    private companion object {
        val DirectionKeys = setOf(
            KeyEvent.KEYCODE_DPAD_UP,
            KeyEvent.KEYCODE_DPAD_DOWN,
            KeyEvent.KEYCODE_DPAD_LEFT,
            KeyEvent.KEYCODE_DPAD_RIGHT,
        )
        val SeekKeys = setOf(KeyEvent.KEYCODE_MEDIA_FAST_FORWARD, KeyEvent.KEYCODE_MEDIA_REWIND)
    }
}

internal val PlayerSelectKeys = setOf(
    KeyEvent.KEYCODE_DPAD_CENTER,
    KeyEvent.KEYCODE_ENTER,
    KeyEvent.KEYCODE_NUMPAD_ENTER,
)

/** Lets the active player see remote keys before the Activity's view hierarchy does. */
class RemoteKeyDispatcher<E> {
    private var handler: ((E) -> Boolean)? = null

    /** Returns an unregister action that only removes this handler, not a newer one. */
    fun register(newHandler: (E) -> Boolean): () -> Unit {
        handler = newHandler
        return { if (handler === newHandler) handler = null }
    }

    fun dispatch(event: E): Boolean = handler?.invoke(event) == true
}
