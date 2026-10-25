package com.protv.firetv.account

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Button
import androidx.tv.material3.ButtonDefaults
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.protv.firetv.ui.theme.ProTvAtmosphere
import com.protv.firetv.ui.theme.ProTvButtonShape
import com.protv.firetv.ui.theme.ProTvButtons
import com.protv.firetv.ui.theme.ProTvColors
import com.protv.firetv.ui.theme.ProTvWordmark
import kotlinx.coroutines.delay

@Composable
fun SignInScreen(
    controller: DeviceLinkController,
    firebaseAuth: ViewerFirebaseAuth?,
    onClose: () -> Unit,
) {
    var retryToken by remember { mutableIntStateOf(0) }
    var webLink by remember { mutableStateOf<WebLink?>(null) }
    val state = controller.state
    BackHandler {
        controller.cancel()
        onClose()
    }
    // Registered after the screen's handler, so Back closes an open address panel first.
    BackHandler(enabled = webLink != null) { webLink = null }
    // Each state's first action receives focus as soon as it appears, so the remote works on this
    // screen immediately (including when it opens over the player).
    val primaryFocus = remember { FocusRequester() }
    val focusKey = when (state) {
        is DeviceLinkState.Pending -> "pending:${pendingOffersRetry(state)}"
        else -> "${state::class.simpleName}:${webLink?.name}"
    }
    LaunchedEffect(focusKey) {
        withFrameNanos { }
        runCatching { primaryFocus.requestFocus() }
    }
    LaunchedEffect(controller, retryToken) {
        if (state !is DeviceLinkState.SignedIn && state !is DeviceLinkState.ConfigurationRequired) {
            controller.run()
        }
    }
    MaterialTheme {
        Box(Modifier.fillMaxSize()) {
            ProTvAtmosphere(Modifier.fillMaxSize())
            Row(
                modifier = Modifier.align(Alignment.TopStart).padding(horizontal = 48.dp, vertical = 30.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                ProTvWordmark(fontSize = 34.sp)
                Spacer(Modifier.width(14.dp))
                Box(
                    Modifier
                        .size(width = 2.dp, height = 22.dp)
                        .background(Brush.verticalGradient(listOf(ProTvColors.ElectricBlue, ProTvColors.Cyan))),
                )
                Spacer(Modifier.width(14.dp))
                Text("Account", color = ProTvColors.Silver, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
            }
        Box(
            Modifier.fillMaxSize().padding(start = 48.dp, end = 48.dp, top = 92.dp, bottom = 36.dp),
            contentAlignment = Alignment.Center,
        ) {
            when (val current = state) {
                DeviceLinkState.Loading -> AccountPanel {
                    Message("Connecting to PROtv…", "Preparing secure account linking.")
                }
                is DeviceLinkState.ConfigurationRequired -> AccountPanel {
                    Message(
                        "Account sign-in is not configured",
                        current.message,
                    )
                    Spacer(Modifier.height(24.dp))
                    ActionButton("Back", onClick = onClose, primary = true, modifier = Modifier.focusRequester(primaryFocus))
                }
                DeviceLinkState.Expired -> AccountPanel {
                    Message("This sign-in code expired", "Start again to get a new code.")
                    Spacer(Modifier.height(24.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        ActionButton("Try Again", onClick = { retryToken++ }, primary = true, modifier = Modifier.focusRequester(primaryFocus))
                        ActionButton("Cancel", onClick = onClose)
                    }
                }
                DeviceLinkState.Rejected -> AccountPanel {
                    Message("Sign-in was declined", "Start again if you want to link this TV.")
                    Spacer(Modifier.height(24.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        ActionButton("Try Again", onClick = { retryToken++ }, primary = true, modifier = Modifier.focusRequester(primaryFocus))
                        ActionButton("Cancel", onClick = onClose)
                    }
                }
                is DeviceLinkState.Failed -> AccountPanel {
                    Message("Unable to sign in", current.message)
                    Spacer(Modifier.height(24.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        ActionButton("Retry", onClick = { retryToken++ }, primary = true, modifier = Modifier.focusRequester(primaryFocus))
                        ActionButton("Cancel", onClick = {
                            controller.cancel()
                            onClose()
                        })
                    }
                }
                is DeviceLinkState.SignedIn -> webLink?.let { link ->
                    AccountPanel {
                        WebLinkDetails(link)
                        Spacer(Modifier.height(28.dp))
                        ActionButton("Back", onClick = { webLink = null }, primary = true, modifier = Modifier.focusRequester(primaryFocus))
                    }
                } ?: AccountPanel {
                    AccountAvatar(current.accountLabel)
                    Spacer(Modifier.height(18.dp))
                    Message("You’re signed in", current.accountLabel)
                    Spacer(Modifier.height(10.dp))
                    Text(
                        "My List and watch progress sync with your PROtv account.",
                        color = ProTvColors.Muted,
                        fontSize = 15.sp,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(Modifier.height(28.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        ActionButton("Continue browsing", onClick = onClose, primary = true, modifier = Modifier.focusRequester(primaryFocus))
                        ActionButton("Creator Portal", onClick = { webLink = WebLink.CreatorPortal })
                        ActionButton("Sign out", onClick = {
                            firebaseAuth?.signOut()
                            controller.cancel()
                            onClose()
                        })
                    }
                    Spacer(Modifier.height(18.dp))
                    // One line: stacked, the button is squeezed off the bottom of a 1080p panel.
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        Text(
                            "Deletion requests are made on the PROtv website and reviewed by PROtv.",
                            color = ProTvColors.Muted,
                            fontSize = 14.sp,
                            modifier = Modifier.widthIn(max = 300.dp),
                        )
                        ActionButton("Delete account", onClick = { webLink = WebLink.AccountDeletion })
                    }
                }
                is DeviceLinkState.Pending -> ActivationCode(current, primaryFocus = primaryFocus, onCancel = {
                    controller.cancel()
                    onClose()
                }, onRetry = { retryToken++ })
            }
        }
        }
    }
}

/** The website's raised panel: navy-to-midnight surface with a hairline border. */
@Composable
private fun AccountPanel(content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier = Modifier
            .widthIn(min = 520.dp, max = 780.dp)
            .background(
                Brush.verticalGradient(listOf(ProTvColors.Navy.copy(alpha = 0.92f), ProTvColors.Midnight.copy(alpha = 0.94f))),
                PanelShape,
            )
            .border(1.dp, ProTvColors.Line, PanelShape)
            .padding(horizontal = 48.dp, vertical = 36.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        content = content,
    )
}

private val PanelShape = RoundedCornerShape(18.dp)

@Composable
private fun AccountAvatar(accountLabel: String) {
    Box(
        modifier = Modifier
            .size(76.dp)
            .background(Brush.linearGradient(listOf(ProTvColors.Blue, ProTvColors.ElectricBlue)), CircleShape)
            .border(2.dp, ProTvColors.White.copy(alpha = 0.7f), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            accountLabel.trim().firstOrNull()?.uppercaseChar()?.toString() ?: "P",
            color = ProTvColors.White,
            fontSize = 32.sp,
            fontWeight = FontWeight.Black,
        )
    }
}

private fun pendingOffersRetry(state: DeviceLinkState.Pending): Boolean =
    state.message?.contains("Retrying") == true || state.message?.contains("unavailable") == true

@Composable
private fun ActivationCode(
    state: DeviceLinkState.Pending,
    primaryFocus: FocusRequester,
    onCancel: () -> Unit,
    onRetry: () -> Unit,
) {
    val session = state.session
    val qr = remember(session.verificationUrl) { createQrCode(verificationQrPayload(session)) }
    var remainingSeconds by remember(session.expiresAtMillis) {
        mutableIntStateOf(((session.expiresAtMillis - System.currentTimeMillis()).coerceAtLeast(0) / 1_000).toInt())
    }
    LaunchedEffect(session.expiresAtMillis) {
        while (remainingSeconds > 0) {
            delay(1_000)
            remainingSeconds = ((session.expiresAtMillis - System.currentTimeMillis()).coerceAtLeast(0) / 1_000).toInt()
        }
    }
    Row(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(listOf(ProTvColors.Navy.copy(alpha = 0.9f), ProTvColors.Midnight.copy(alpha = 0.94f))),
                PanelShape,
            )
            .border(1.dp, ProTvColors.Line, PanelShape)
            .padding(horizontal = 44.dp, vertical = 28.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(
            modifier = Modifier.weight(1f).padding(end = 36.dp),
            verticalArrangement = Arrangement.Center,
        ) {
            Text("Sign in to PROtv", color = ProTvColors.White, fontSize = 34.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(20.dp))
            Text("1. Scan the QR code or open this link on your phone or computer:", color = ProTvColors.Silver, fontSize = 18.sp)
            Spacer(Modifier.height(8.dp))
            Text(session.verificationUrl, color = ProTvColors.ElectricBlue, fontSize = 19.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(18.dp))
            Text("2. Sign in to your PROtv account and enter this code:", color = ProTvColors.Silver, fontSize = 18.sp)
            Spacer(Modifier.height(10.dp))
            Text(
                session.userCode,
                color = ProTvColors.White,
                fontSize = 40.sp,
                fontWeight = FontWeight.Black,
                letterSpacing = 6.sp,
                modifier = Modifier
                    .background(ProTvColors.Black.copy(alpha = 0.45f), RoundedCornerShape(10.dp))
                    .border(2.dp, ProTvColors.ElectricBlue, RoundedCornerShape(10.dp))
                    .padding(horizontal = 22.dp, vertical = 6.dp),
            )
            Spacer(Modifier.height(14.dp))
            Text(
                state.message ?: "Waiting for approval · code expires in ${remainingSeconds / 60}:${(remainingSeconds % 60).toString().padStart(2, '0')}",
                color = ProTvColors.Cyan,
                fontSize = 16.sp,
            )
            Spacer(Modifier.height(20.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                val offersRetry = pendingOffersRetry(state)
                if (offersRetry) {
                    ActionButton("Retry now", onClick = onRetry, primary = true, modifier = Modifier.focusRequester(primaryFocus))
                }
                ActionButton(
                    "Cancel",
                    onClick = onCancel,
                    modifier = if (offersRetry) Modifier else Modifier.focusRequester(primaryFocus),
                )
            }
        }
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            if (qr != null) {
                Image(
                    bitmap = qr.asImageBitmap(),
                    contentDescription = "QR code for the PROtv account activation page",
                    modifier = Modifier
                        .size(236.dp)
                        .background(ProTvColors.BlueGlow, RoundedCornerShape(16.dp))
                        .border(2.dp, ProTvColors.ElectricBlue, RoundedCornerShape(16.dp))
                        .padding(6.dp)
                        .background(ProTvColors.White, RoundedCornerShape(10.dp))
                        .padding(8.dp),
                )
                Spacer(Modifier.height(12.dp))
                Text("Scan to open activation", color = ProTvColors.Silver, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
            } else {
                Text("Open the link and enter the code shown.", color = ProTvColors.Silver, fontSize = 16.sp)
            }
        }
    }
}

@Composable
private fun Message(title: String, body: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(title, color = ProTvColors.White, fontSize = 30.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
        Spacer(Modifier.height(12.dp))
        Text(body, color = ProTvColors.Silver, fontSize = 18.sp, textAlign = TextAlign.Center)
    }
}

/**
 * Account actions: the main action in brand blue, the rest as outlined ghost buttons; whichever is
 * focused turns white with black text so the remote position is always obvious.
 */
@Composable
private fun ActionButton(label: String, onClick: () -> Unit, modifier: Modifier = Modifier, primary: Boolean = false) {
    Button(
        onClick = onClick,
        modifier = modifier,
        shape = ButtonDefaults.shape(ProTvButtonShape),
        colors = if (primary) ProTvButtons.primary() else ProTvButtons.secondary(),
        border = if (primary) ButtonDefaults.border() else ProTvButtons.secondaryBorder(),
        scale = ButtonDefaults.scale(focusedScale = 1.06f),
        contentPadding = PaddingValues(horizontal = 26.dp, vertical = 12.dp),
    ) {
        Text(label, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
    }
}
