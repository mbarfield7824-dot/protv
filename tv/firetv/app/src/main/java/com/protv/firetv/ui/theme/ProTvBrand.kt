package com.protv.firetv.ui.theme

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Border
import androidx.tv.material3.ButtonBorder
import androidx.tv.material3.ButtonColors
import androidx.tv.material3.ButtonDefaults
import androidx.tv.material3.Text
import com.protv.firetv.R

/**
 * The website's PROtv wordmark (`.ptv-wordmark`): heavy italic "PRO" in white and "tv" filled with
 * the white → electric blue → blue brand gradient, with the same tight tracking.
 */
@Composable
fun ProTvWordmark(modifier: Modifier = Modifier, fontSize: TextUnit = 30.sp) {
    Text(
        text = buildAnnotatedString {
            withStyle(SpanStyle(color = ProTvColors.White)) { append(stringResource(R.string.wordmark_pro)) }
            withStyle(SpanStyle(brush = WordmarkTvBrush)) { append(stringResource(R.string.wordmark_tv)) }
        },
        modifier = modifier,
        fontSize = fontSize,
        fontWeight = FontWeight.Black,
        fontStyle = FontStyle.Italic,
        letterSpacing = (-0.045).em,
        lineHeight = fontSize,
        maxLines = 1,
    )
}

private val WordmarkTvBrush = Brush.linearGradient(
    0f to ProTvColors.White,
    0.58f to ProTvColors.ElectricBlue,
    1f to ProTvColors.Blue,
)

/**
 * The website's page atmosphere: a black → midnight → indigo field lit by soft brand-blue glows.
 * It is the branded base layer under artwork, so a missing or failed image never leaves an empty
 * dark screen. Plain gradients only; nothing here is blurred or animated.
 */
@Composable
fun ProTvAtmosphere(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .background(
                Brush.verticalGradient(
                    0f to ProTvColors.Black,
                    0.38f to ProTvColors.Midnight,
                    0.7f to ProTvColors.Indigo,
                    1f to ProTvColors.Black,
                ),
            )
            .drawBehind {
                drawRect(
                    Brush.radialGradient(
                        0f to ProTvColors.BlueGlow,
                        1f to Color.Transparent,
                        center = Offset(size.width * 0.78f, size.height * 0.24f),
                        radius = size.width * 0.57f,
                    ),
                )
                drawRect(
                    Brush.radialGradient(
                        0f to ProTvColors.ElectricBlue.copy(alpha = 0.12f),
                        1f to Color.Transparent,
                        center = Offset(size.width * 0.12f, size.height * 0.9f),
                        radius = size.width * 0.47f,
                    ),
                )
            },
    )
}

val ProTvButtonShape = RoundedCornerShape(8.dp)

/**
 * TV buttons share one high-contrast focus treatment: a focused button turns white with black text,
 * so the focused control is unmistakable from across the room on any artwork.
 */
object ProTvButtons {
    /** The main action (Play, Continue): the website's primary blue at rest. */
    @Composable
    fun primary(): ButtonColors = ButtonDefaults.colors(
        containerColor = ProTvColors.Blue,
        contentColor = ProTvColors.White,
        focusedContainerColor = ProTvColors.White,
        focusedContentColor = ProTvColors.Black,
        pressedContainerColor = ProTvColors.Cyan,
        pressedContentColor = ProTvColors.Black,
    )

    /** Secondary actions: the website's translucent "ghost" button at rest. */
    @Composable
    fun secondary(): ButtonColors = ButtonDefaults.colors(
        containerColor = ProTvColors.Indigo.copy(alpha = 0.55f),
        contentColor = ProTvColors.White,
        focusedContainerColor = ProTvColors.White,
        focusedContentColor = ProTvColors.Black,
        pressedContainerColor = ProTvColors.Cyan,
        pressedContentColor = ProTvColors.Black,
    )

    @Composable
    fun secondaryBorder(): ButtonBorder = ButtonDefaults.border(
        border = Border(BorderStroke(1.dp, ProTvColors.White.copy(alpha = 0.55f)), shape = ProTvButtonShape),
        focusedBorder = Border(BorderStroke(2.dp, ProTvColors.ElectricBlue), shape = ProTvButtonShape),
        pressedBorder = Border(BorderStroke(2.dp, ProTvColors.ElectricBlue), shape = ProTvButtonShape),
    )
}
