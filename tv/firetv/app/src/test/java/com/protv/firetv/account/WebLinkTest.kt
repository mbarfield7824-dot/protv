package com.protv.firetv.account

import org.junit.Assert.assertEquals
import org.junit.Test

class WebLinkTest {
    @Test
    fun linksPointAtTheLiveWebsitePages() {
        assertEquals("https://watchprotv.com/delete-account", WebLink.AccountDeletion.url)
        assertEquals("https://creators.watchprotv.com/", WebLink.CreatorPortal.url)
    }

    @Test
    fun displayAddressesAreTypeable() {
        assertEquals("watchprotv.com/delete-account", WebLink.AccountDeletion.displayAddress)
        assertEquals("creators.watchprotv.com", WebLink.CreatorPortal.displayAddress)
    }
}
