import fs from 'fs'
import path from 'path'

// Load design tokens from 1design.json
export function loadDesignTokens() {
  const designTokensPath = path.join(process.cwd(), '../1design.json')
  const designTokens = JSON.parse(fs.readFileSync(designTokensPath, 'utf8'))
  return designTokens.tokens
}

// Convert design tokens to Tailwind CSS theme configuration
export function generateTailwindTheme() {
  const tokens = loadDesignTokens()
  
  return {
    colors: {
      background: tokens.colors.background,
      foreground: tokens.colors.text,
      text: {
        primary: tokens.colors.text,
        secondary: tokens.colors.textSecondary,
        muted: tokens.colors.textMuted
      },
      accent: {
        DEFAULT: tokens.colors.accent,
        hover: tokens.colors.accentHover,
        light: tokens.colors.accentLight
      },
      card: {
        DEFAULT: tokens.colors.card,
        active: tokens.colors.cardActive,
        hover: tokens.colors.cardHover
      },
      icon: {
        DEFAULT: tokens.colors.icon,
        active: tokens.colors.iconActive
      },
      border: {
        DEFAULT: tokens.colors.border,
        active: tokens.colors.borderActive
      },
      success: tokens.colors.success,
      warning: tokens.colors.warning,
      error: tokens.colors.error,
      info: tokens.colors.info
    },
    spacing: tokens.spacing,
    fontFamily: tokens.typography.fontFamily,
    fontSize: tokens.typography.fontSize,
    fontWeight: tokens.typography.fontWeight,
    lineHeight: tokens.typography.lineHeight,
    borderRadius: tokens.borderRadius,
    boxShadow: tokens.shadows,
    transitionDuration: tokens.motion.duration,
    transitionTimingFunction: tokens.motion.easing,
    screens: {
      'tv-720': tokens.breakpoints.tv720,
      'tv-1080': tokens.breakpoints.tv1080
    }
  }
}