package com.tatakai.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/**
 * Tatakai theme system matching the web app's 15 themes
 * Supports dark themes, light themes, and brutalist styles
 */

enum class ThemeType {
    MIDNIGHT,
    CHERRY_BLOSSOM,
    NEON_TOKYO,
    AURORA_BOREALIS,
    DEEP_OCEAN,
    CYBERPUNK,
    ZEN_GARDEN,
    LIGHT_MINIMAL,
    LIGHT_SAKURA,
    BRUTALISM_DARK,
    OBSIDIAN,
    SOLAR,
    CAFFEINE,
    BRUTALISM_PLUS,
    DARK_MATTER;
    
    companion object {
        fun fromString(value: String): ThemeType {
            return when(value.lowercase().replace("-", "_")) {
                "midnight" -> MIDNIGHT
                "cherry_blossom", "cherryblossom" -> CHERRY_BLOSSOM
                "neon_tokyo", "neontokyo" -> NEON_TOKYO
                "aurora_borealis", "auroraborealis" -> AURORA_BOREALIS
                "deep_ocean", "deepocean" -> DEEP_OCEAN
                "cyberpunk" -> CYBERPUNK
                "zen_garden", "zengarden" -> ZEN_GARDEN
                "light_minimal", "lightminimal" -> LIGHT_MINIMAL
                "light_sakura", "lightsakura" -> LIGHT_SAKURA
                "brutalism_dark", "brutalismdark" -> BRUTALISM_DARK
                "obsidian" -> OBSIDIAN
                "solar" -> SOLAR
                "caffeine" -> CAFFEINE
                "brutalism_plus", "brutalismplus" -> BRUTALISM_PLUS
                "dark_matter", "darkmatter" -> DARK_MATTER
                else -> MIDNIGHT
            }
        }
    }
}

data class ThemeColors(
    val primary: Color,
    val secondary: Color,
    val accent: Color,
    val background: Color,
    val surface: Color,
    val surfaceVariant: Color,
    val onBackground: Color,
    val onSurface: Color,
    val glowPrimary: Color,
    val glowSecondary: Color,
    val isLight: Boolean = false
)

data class ThemeInfo(
    val name: String,
    val icon: String,
    val description: String,
    val colors: ThemeColors
)

// Theme color definitions matching the web app
object TatakaiThemes {
    
    val Midnight = ThemeColors(
        primary = Color(0xFF8B7FE8),
        secondary = Color(0xFFA980E0),
        accent = Color(0xFFB885E8),
        background = Color(0xFF0A0A0F),
        surface = Color(0xFF121217),
        surfaceVariant = Color(0xFF1A1A20),
        onBackground = Color(0xFFFAFAFA),
        onSurface = Color(0xFFFAFAFA),
        glowPrimary = Color(0xFF8B7FE8),
        glowSecondary = Color(0xFFA980E0)
    )
    
    val CherryBlossom = ThemeColors(
        primary = Color(0xFFEB75A8),
        secondary = Color(0xFFE85C9E),
        accent = Color(0xFFF28BB8),
        background = Color(0xFF0D080A),
        surface = Color(0xFF14090C),
        surfaceVariant = Color(0xFF261820),
        onBackground = Color(0xFFF2F0F1),
        onSurface = Color(0xFFF2F0F1),
        glowPrimary = Color(0xFFEB75A8),
        glowSecondary = Color(0xFFE85C9E)
    )
    
    val NeonTokyo = ThemeColors(
        primary = Color(0xFFCC66FF),
        secondary = Color(0xFF00FFFF),
        accent = Color(0xFFFF00FF),
        background = Color(0xFF050308),
        surface = Color(0xFF0A080F),
        surfaceVariant = Color(0xFF1F1A26),
        onBackground = Color(0xFFFFFFFF),
        onSurface = Color(0xFFFFFFFF),
        glowPrimary = Color(0xFFCC66FF),
        glowSecondary = Color(0xFF00FFFF)
    )
    
    val AuroraBorealis = ThemeColors(
        primary = Color(0xFF40E0AB),
        secondary = Color(0xFF57B3E8),
        accent = Color(0xFFA066E6),
        background = Color(0xFF040A0A),
        surface = Color(0xFF08131A),
        surfaceVariant = Color(0xFF15242B),
        onBackground = Color(0xFFF0F7F2),
        onSurface = Color(0xFFF0F7F2),
        glowPrimary = Color(0xFF40E0AB),
        glowSecondary = Color(0xFF57B3E8)
    )
    
    val DeepOcean = ThemeColors(
        primary = Color(0xFF47B3E5),
        secondary = Color(0xFF4285E5),
        accent = Color(0xFF3DD9BA),
        background = Color(0xFF030708),
        surface = Color(0xFF070F14),
        surfaceVariant = Color(0xFF141F29),
        onBackground = Color(0xFFF5F5F5),
        onSurface = Color(0xFFF5F5F5),
        glowPrimary = Color(0xFF47B3E5),
        glowSecondary = Color(0xFF4285E5)
    )
    
    val Cyberpunk = ThemeColors(
        primary = Color(0xFFFFFF00),
        secondary = Color(0xFF00CCCC),
        accent = Color(0xFFFF00FF),
        background = Color(0xFF060608),
        surface = Color(0xFF0A0A0F),
        surfaceVariant = Color(0xFF1F1F26),
        onBackground = Color(0xFFFFFFF0),
        onSurface = Color(0xFFFFFFF0),
        glowPrimary = Color(0xFFFFFF00),
        glowSecondary = Color(0xFF00CCCC)
    )
    
    val ZenGarden = ThemeColors(
        primary = Color(0xFF66A66A),
        secondary = Color(0xFF9D7754),
        accent = Color(0xFF5E9963),
        background = Color(0xFF0C0D0B),
        surface = Color(0xFF131614),
        surfaceVariant = Color(0xFF24292A),
        onBackground = Color(0xFFEBEBEB),
        onSurface = Color(0xFFEBEBEB),
        glowPrimary = Color(0xFF66A66A),
        glowSecondary = Color(0xFF9D7754)
    )
    
    val LightMinimal = ThemeColors(
        primary = Color(0xFF3366FF),
        secondary = Color(0xFF7766FF),
        accent = Color(0xFF33BBFF),
        background = Color(0xFFFAFAFA),
        surface = Color(0xFFFFFFFF),
        surfaceVariant = Color(0xFFF5F5F5),
        onBackground = Color(0xFF1A1A1A),
        onSurface = Color(0xFF1A1A1A),
        glowPrimary = Color(0xFF3366FF),
        glowSecondary = Color(0xFF7766FF),
        isLight = true
    )
    
    val LightSakura = ThemeColors(
        primary = Color(0xFFDD5577),
        secondary = Color(0xFFD94470),
        accent = Color(0xFFFF6B9D),
        background = Color(0xFFF7F0F3),
        surface = Color(0xFFFFFFFF),
        surfaceVariant = Color(0xFFF2E8EB),
        onBackground = Color(0xFF261015),
        onSurface = Color(0xFF261015),
        glowPrimary = Color(0xFFDD5577),
        glowSecondary = Color(0xFFD94470),
        isLight = true
    )
    
    val BrutalismDark = ThemeColors(
        primary = Color(0xFFFFEE55),
        secondary = Color(0xFFFFCC00),
        accent = Color(0xFFFF3333),
        background = Color(0xFF141414),
        surface = Color(0xFF1F1F1F),
        surfaceVariant = Color(0xFF2E2E2E),
        onBackground = Color(0xFFFAFAFA),
        onSurface = Color(0xFFFAFAFA),
        glowPrimary = Color(0xFFFFEE55),
        glowSecondary = Color(0xFFFF3333)
    )
    
    val Obsidian = ThemeColors(
        primary = Color(0xFFB3B3B3),
        secondary = Color(0xFF808080),
        accent = Color(0xFFCCCCCC),
        background = Color(0xFF080808),
        surface = Color(0xFF0F0F0F),
        surfaceVariant = Color(0xFF1F1F1F),
        onBackground = Color(0xFFF2F2F2),
        onSurface = Color(0xFFF2F2F2),
        glowPrimary = Color(0xFFB3B3B3),
        glowSecondary = Color(0xFF808080)
    )
    
    val Solar = ThemeColors(
        primary = Color(0xFFFFCC33),
        secondary = Color(0xFFFF9900),
        accent = Color(0xFFFFDD00),
        background = Color(0xFF0A0804),
        surface = Color(0xFF12110A),
        surfaceVariant = Color(0xFF242115),
        onBackground = Color(0xFFF2F0EB),
        onSurface = Color(0xFFF2F0EB),
        glowPrimary = Color(0xFFFFCC33),
        glowSecondary = Color(0xFFFF9900)
    )
    
    val Caffeine = ThemeColors(
        primary = Color(0xFFFF9944),
        secondary = Color(0xFFFF7722),
        accent = Color(0xFFFFBB55),
        background = Color(0xFF0D0904),
        surface = Color(0xFF141008),
        surfaceVariant = Color(0xFF272418),
        onBackground = Color(0xFFF2F0EB),
        onSurface = Color(0xFFF2F0EB),
        glowPrimary = Color(0xFFFF9944),
        glowSecondary = Color(0xFFFF7722)
    )
    
    val BrutalismPlus = ThemeColors(
        primary = Color(0xFFFFFFFF),
        secondary = Color(0xFFBB66FF),
        accent = Color(0xFF00FFAA),
        background = Color(0xFF0D0D0D),
        surface = Color(0xFF141414),
        surfaceVariant = Color(0xFF262626),
        onBackground = Color(0xFFFFFFFF),
        onSurface = Color(0xFFFFFFFF),
        glowPrimary = Color(0xFFBB66FF),
        glowSecondary = Color(0xFF00FFAA)
    )
    
    val DarkMatter = ThemeColors(
        primary = Color(0xFFAA77FF),
        secondary = Color(0xFFBB88FF),
        accent = Color(0xFF9966FF),
        background = Color(0xFF030205),
        surface = Color(0xFF06040A),
        surfaceVariant = Color(0xFF100B14),
        onBackground = Color(0xFFFAF9FB),
        onSurface = Color(0xFFFAF9FB),
        glowPrimary = Color(0xFFAA77FF),
        glowSecondary = Color(0xFFBB88FF)
    )
    
    fun getThemeInfo(type: ThemeType): ThemeInfo {
        return when(type) {
            ThemeType.MIDNIGHT -> ThemeInfo(
                "Midnight", "🌙", "Classic dark with indigo & violet accents", Midnight
            )
            ThemeType.CHERRY_BLOSSOM -> ThemeInfo(
                "Cherry Blossom", "🌸", "Soft pink tones inspired by sakura", CherryBlossom
            )
            ThemeType.NEON_TOKYO -> ThemeInfo(
                "Neon Tokyo", "🗼", "Electric neon cyberpunk vibes", NeonTokyo
            )
            ThemeType.AURORA_BOREALIS -> ThemeInfo(
                "Aurora Borealis", "✨", "Northern lights dancing colors", AuroraBorealis
            )
            ThemeType.DEEP_OCEAN -> ThemeInfo(
                "Deep Ocean", "🌊", "Mysterious underwater depths", DeepOcean
            )
            ThemeType.CYBERPUNK -> ThemeInfo(
                "Cyberpunk", "🤖", "Futuristic neon yellow & cyan", Cyberpunk
            )
            ThemeType.ZEN_GARDEN -> ThemeInfo(
                "Zen Garden", "🌿", "Calm forest tranquility", ZenGarden
            )
            ThemeType.LIGHT_MINIMAL -> ThemeInfo(
                "Light Minimal", "☀️", "Clean, bright, modern design", LightMinimal
            )
            ThemeType.LIGHT_SAKURA -> ThemeInfo(
                "Light Sakura", "🌷", "Soft pink cherry blossom theme", LightSakura
            )
            ThemeType.BRUTALISM_DARK -> ThemeInfo(
                "Brutalist Dark", "⬛", "Dark brutalist aesthetic", BrutalismDark
            )
            ThemeType.OBSIDIAN -> ThemeInfo(
                "Obsidian", "🖤", "Pure dark monochrome elegance", Obsidian
            )
            ThemeType.SOLAR -> ThemeInfo(
                "Solar", "☀️", "Bright solar energy", Solar
            )
            ThemeType.CAFFEINE -> ThemeInfo(
                "Caffeine", "☕", "Energizing coffee-inspired tones", Caffeine
            )
            ThemeType.BRUTALISM_PLUS -> ThemeInfo(
                "Brutalist Plus", "⬜", "Enhanced brutalist with vibrant accents", BrutalismPlus
            )
            ThemeType.DARK_MATTER -> ThemeInfo(
                "Dark Matter", "🌌", "Deep space with cosmic purple glow", DarkMatter
            )
        }
    }
}

val LocalThemeColors = staticCompositionLocalOf { TatakaiThemes.Midnight }

@Composable
fun TatakaiTheme(
    themeType: ThemeType = ThemeType.MIDNIGHT,
    content: @Composable () -> Unit
) {
    val themeInfo = TatakaiThemes.getThemeInfo(themeType)
    val colors = themeInfo.colors
    
    val colorScheme = if (colors.isLight) {
        lightColorScheme(
            primary = colors.primary,
            secondary = colors.secondary,
            tertiary = colors.accent,
            background = colors.background,
            surface = colors.surface,
            surfaceVariant = colors.surfaceVariant,
            onBackground = colors.onBackground,
            onSurface = colors.onSurface
        )
    } else {
        darkColorScheme(
            primary = colors.primary,
            secondary = colors.secondary,
            tertiary = colors.accent,
            background = colors.background,
            surface = colors.surface,
            surfaceVariant = colors.surfaceVariant,
            onBackground = colors.onBackground,
            onSurface = colors.onSurface
        )
    }
    
    CompositionLocalProvider(LocalThemeColors provides colors) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = Typography,
            content = content
        )
    }
}
