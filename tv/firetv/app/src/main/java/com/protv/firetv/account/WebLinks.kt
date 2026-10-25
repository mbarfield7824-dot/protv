package com.protv.firetv.account

import android.graphics.Bitmap
import android.graphics.Color
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.graphics.createBitmap
import androidx.tv.material3.Text
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.WriterException
import com.google.zxing.qrcode.QRCodeWriter
import com.protv.firetv.ui.theme.ProTvColors

/**
 * Web pages the TV points people to. Fire TV devices often have no browser, so the app shows
 * the address and a QR code to open on a phone or computer instead of launching an intent.
 */
internal enum class WebLink(val url: String, val title: String, val description: String) {
    AccountDeletion(
        url = "https://watchprotv.com/delete-account",
        title = "Delete your PROtv account",
        description = "Scan the code or visit this address on your phone or computer, sign in, " +
            "and submit a deletion request. It covers the website and every PROtv app.",
    ),
    CreatorPortal(
        url = "https://creators.watchprotv.com/",
        title = "PROtv Creator Portal",
        description = "Scan the code or visit this address on your phone or computer to submit " +
            "and manage your work.",
    );

    /** The address as people type it: no scheme, no trailing slash. */
    val displayAddress: String get() = url.removePrefix("https://").trimEnd('/')
}

private const val QR_PIXELS = 360

internal fun createQrCode(value: String): Bitmap? {
    val hints = mapOf(EncodeHintType.MARGIN to 1)
    val matrix = try {
        QRCodeWriter().encode(value, BarcodeFormat.QR_CODE, QR_PIXELS, QR_PIXELS, hints)
    } catch (error: WriterException) {
        return null
    }
    // One setPixels call: per-pixel writes are slow enough on a Firestick to delay Settings' first frame.
    val pixels = IntArray(QR_PIXELS * QR_PIXELS) { i ->
        if (matrix[i % QR_PIXELS, i / QR_PIXELS]) Color.BLACK else Color.WHITE
    }
    return createBitmap(QR_PIXELS, QR_PIXELS, Bitmap.Config.ARGB_8888).also { bitmap ->
        bitmap.setPixels(pixels, 0, QR_PIXELS, 0, 0, QR_PIXELS, QR_PIXELS)
    }
}

@Composable
internal fun WebLinkQr(link: WebLink, size: Dp, modifier: Modifier = Modifier) {
    val qr = remember(link) { createQrCode(link.url) } ?: return
    Image(
        bitmap = qr.asImageBitmap(),
        contentDescription = "QR code for ${link.displayAddress}",
        modifier = modifier
            .size(size)
            .background(ProTvColors.White, RoundedCornerShape(10.dp))
            .border(2.dp, ProTvColors.ElectricBlue, RoundedCornerShape(10.dp))
            .padding(8.dp),
    )
}

/** Full-size panel used on the Account screen. */
@Composable
internal fun WebLinkDetails(link: WebLink, modifier: Modifier = Modifier) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(36.dp)) {
        Column(Modifier.widthIn(max = 440.dp)) {
            Text(link.title, color = ProTvColors.White, fontSize = 30.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(14.dp))
            Text(link.description, color = ProTvColors.Silver, fontSize = 18.sp)
            Spacer(Modifier.height(16.dp))
            Text(link.displayAddress, color = ProTvColors.ElectricBlue, fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
        }
        WebLinkQr(link, size = 220.dp)
    }
}

/** Compact card for Settings: available whether or not the TV is signed in. */
@Composable
fun AccountDeletionNotice(modifier: Modifier = Modifier) {
    val link = WebLink.AccountDeletion
    Row(
        modifier
            .background(ProTvColors.Midnight.copy(alpha = 0.7f), RoundedCornerShape(14.dp))
            .border(1.dp, ProTvColors.Line, RoundedCornerShape(14.dp))
            .padding(18.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.widthIn(max = 300.dp)) {
            Text(link.title, color = ProTvColors.White, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(8.dp))
            Text("Scan the code or visit", color = ProTvColors.Silver, fontSize = 14.sp)
            Text(link.displayAddress, color = ProTvColors.ElectricBlue, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(6.dp))
            Text("on your phone or computer. No app is needed.", color = ProTvColors.Silver, fontSize = 14.sp)
        }
        Spacer(Modifier.width(18.dp))
        WebLinkQr(link, size = 132.dp)
    }
}
