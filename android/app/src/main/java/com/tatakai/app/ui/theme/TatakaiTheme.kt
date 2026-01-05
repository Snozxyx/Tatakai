package com.tatakai.app.ui.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

enum class TatakaiThemeOption {
    Sunset,
    Neon,
    Ocean,
    Forest,
    Rose,
    Midnight,
    BrutalismDark
}

data class TatakaiThemeColors(
    val primary: Color,
    val secondary: Color,
    val background: Color,
    val surface: Color,
    val onSurface: Color,
    val gradientStart: Color,
    val gradientEnd: Color,
)

private fun palette(option: TatakaiThemeOption, dark: Boolean): TatakaiThemeColors {
    return when (option) {
        TatakaiThemeOption.Sunset -> TatakaiThemeColors(
            primary = Color(0xFFFF6B35),
            secondary = Color(0xFFF7931E),
            background = if (dark) Color(0xFF0B0B10) else Color(0xFFF8F5F2),
            surface = if (dark) Color(0xFF141422) else Color.White,
            onSurface = if (dark) Color(0xFFF2F2F6) else Color(0xFF111114),
            gradientStart = Color(0xFFFF6B35),
            gradientEnd = Color(0xFFF7931E)
        )

        TatakaiThemeOption.Neon -> TatakaiThemeColors(
            primary = Color(0xFF9D4EDD),
            secondary = Color(0xFF5A189A),
            background = if (dark) Color(0xFF070612) else Color(0xFFF6F0FF),
            surface = if (dark) Color(0xFF110B22) else Color.White,
            onSurface = if (dark) Color(0xFFF2E9FF) else Color(0xFF12061A),
            gradientStart = Color(0xFF9D4EDD),
            gradientEnd = Color(0xFF5A189A)
        )

        TatakaiThemeOption.Ocean -> TatakaiThemeColors(
            primary = Color(0xFF0077BE),
            secondary = Color(0xFF00D4FF),
            background = if (dark) Color(0xFF061018) else Color(0xFFEAF8FF),
            surface = if (dark) Color(0xFF0A1C29) else Color.White,
            onSurface = if (dark) Color(0xFFE9F7FF) else Color(0xFF07131A),
            gradientStart = Color(0xFF0077BE),
            gradientEnd = Color(0xFF00D4FF)
        )

        TatakaiThemeOption.Forest -> TatakaiThemeColors(
            primary = Color(0xFF2D6A4F),
            secondary = Color(0xFF40916C),
            background = if (dark) Color(0xFF06120D) else Color(0xFFF0FFF7),
            surface = if (dark) Color(0xFF0C221A) else Color.White,
            onSurface = if (dark) Color(0xFFE9FFF2) else Color(0xFF07120E),
            gradientStart = Color(0xFF2D6A4F),
            gradientEnd = Color(0xFF40916C)
        )

        TatakaiThemeOption.Rose -> TatakaiThemeColors(
            primary = Color(0xFFFF1493),
            secondary = Color(0xFFFF69B4),
            background = if (dark) Color(0xFF10060B) else Color(0xFFFFF0F7),
            surface = if (dark) Color(0xFF25101B) else Color.White,
            onSurface = if (dark) Color(0xFFFFE8F3) else Color(0xFF1A0710),
            gradientStart = Color(0xFFFF1493),
            gradientEnd = Color(0xFFFF69B4)
        )

        TatakaiThemeOption.Midnight -> TatakaiThemeColors(
            primary = Color(0xFF1A0033),
            secondary = Color(0xFF0A0E27),
            background = Color(0xFF05040A),
            surface = Color(0xFF0E0B18),
            onSurface = Color(0xFFECE8FF),
            gradientStart = Color(0xFF1A0033),
            gradientEnd = Color(0xFF0A0E27)
        )

        TatakaiThemeOption.BrutalismDark -> TatakaiThemeColors(
            primary = Color.Black,
            secondary = Color.White,
            background = Color.Black,
            surface = Color(0xFF0A0A0A),
            onSurface = Color.White,
            gradientStart = Color.Black,
            gradientEnd = Color.Black
        )
    }
}

val LocalTatakaiTheme = staticCompositionLocalOf { palette(TatakaiThemeOption.Sunset, dark = true) }

@Composable
fun TatakaiTheme(
    darkTheme: Boolean,
    theme: TatakaiThemeOption = if (darkTheme) TatakaiThemeOption.Midnight else TatakaiThemeOption.Sunset,
    content: @Composable () -> Unit
) {
    val p = palette(theme, darkTheme)
    val scheme: ColorScheme = if (darkTheme) {
        darkColorScheme(
            primary = p.primary,
            secondary = p.secondary,
            background = p.background,
            surface = p.surface,
            onSurface = p.onSurface,
            onBackground = p.onSurface
        )
    } else {
        lightColorScheme(
            primary = p.primary,
            secondary = p.secondary,
            background = p.background,
            surface = p.surface,
            onSurface = p.onSurface,
            onBackground = p.onSurface
        )
    }

    androidx.compose.runtime.CompositionLocalProvider(LocalTatakaiTheme provides p) {
        MaterialTheme(
            colorScheme = scheme,
            typography = androidx.compose.material3.Typography(),
            content = content
        )
    }
}
