package com.protv.firetv.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.darkColorScheme

object ProTvColors {
    val Black = Color(0xFF05070B)
    val Midnight = Color(0xFF080D18)
    val Navy = Color(0xFF0F1B32)
    val Blue = Color(0xFF174FA6)
    val ElectricBlue = Color(0xFF4D9BFF)
    val Cyan = Color(0xFF4BC8D6)
    val White = Color(0xFFFFFFFF)
    val Silver = Color(0xFFC5CFDC)
    val Muted = Color(0xFF94A3B8)
    val Line = Muted.copy(alpha = 0.22f)
}

/** Overscan-safe insets for a 960x540dp (1920x1080 @ 2x) TV canvas. */
object ProTvSpacing {
    val SafeHorizontal = 48.dp
    val SafeVertical = 27.dp
}

private val colorScheme = darkColorScheme(
    primary = ProTvColors.Blue,
    onPrimary = ProTvColors.White,
    secondary = ProTvColors.Cyan,
    background = ProTvColors.Black,
    onBackground = ProTvColors.White,
    surface = ProTvColors.Midnight,
    onSurface = ProTvColors.White,
    surfaceVariant = ProTvColors.Navy,
    onSurfaceVariant = ProTvColors.Silver,
    border = ProTvColors.Line,
)

@Composable
fun ProTvTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = colorScheme, content = content)
}
