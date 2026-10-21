package com.protv.firetv.ui.home

import androidx.compose.ui.input.key.Key
import org.junit.Assert.assertEquals
import org.junit.Test

class NavigationDrawerTest {
    @Test
    fun rightAndBackCloseWithoutActivatingADestination() {
        assertEquals(DrawerKeyAction.Close, drawerKeyAction(Key.DirectionRight))
        assertEquals(DrawerKeyAction.Close, drawerKeyAction(Key.Back))
    }

    @Test
    fun leftCannotEscapeBehindTheDrawer() {
        assertEquals(DrawerKeyAction.Consume, drawerKeyAction(Key.DirectionLeft))
    }

    @Test
    fun verticalNavigationAndSelectReachTheFocusedDestinationButton() {
        listOf(Key.DirectionUp, Key.DirectionDown, Key.DirectionCenter, Key.Enter).forEach {
            assertEquals(DrawerKeyAction.Navigate, drawerKeyAction(it))
        }
    }

    @Test
    fun reselectingTheCurrentDestinationRequestsContentFocusAgain() {
        val controller = HomeController(null, "")
        val token = controller.navigationToken
        controller.selectDestination(HomeDestination.Home)
        assertEquals(HomeDestination.Home, controller.destination)
        assertEquals(token + 1, controller.navigationToken)
        assertEquals(true, controller.restorePending)
    }

    @Test
    fun hardwarePlaybackKeysAreNotConsumedByDrawerNavigation() {
        assertEquals(DrawerKeyAction.Navigate, drawerKeyAction(Key.MediaPlayPause))
        assertEquals(DrawerKeyAction.Navigate, drawerKeyAction(Key.MediaFastForward))
    }
}
