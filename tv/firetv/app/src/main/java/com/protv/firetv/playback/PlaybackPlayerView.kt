package com.protv.firetv.playback

import android.content.Context
import android.view.KeyEvent
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.PlayerControlView
import androidx.media3.ui.PlayerView

@OptIn(UnstableApi::class)
internal class PlaybackPlayerView(context: Context) : PlayerView(context) {
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val controller = findViewById<PlayerControlView>(androidx.media3.ui.R.id.exo_controller)
        if (isControllerFullyVisible && controller.hasFocus() && event.keyCode in PlayerSelectKeys) {
            // PlayerView's post-dispatch showController() would restart the hide timer after a
            // settings click. Let the focused control own Select, including popup timer suspension.
            return controller.dispatchKeyEvent(event)
        }
        return super.dispatchKeyEvent(event)
    }
}
