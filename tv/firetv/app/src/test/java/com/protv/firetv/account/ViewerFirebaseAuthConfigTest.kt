package com.protv.firetv.account

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ViewerFirebaseAuthConfigTest {
    @Test
    fun acceptsAndroidAppIdsButRejectsWebAndMalformedAppIds() {
        assertTrue(isAndroidFirebaseApplicationId("1:123456789:android:abcdef0123456789"))
        assertFalse(isAndroidFirebaseApplicationId("1:123456789:web:abcdef0123456789"))
        assertFalse(isAndroidFirebaseApplicationId("android:com.protv.firetv"))
        assertFalse(isAndroidFirebaseApplicationId(""))
    }
}
