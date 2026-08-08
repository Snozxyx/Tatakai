'use strict';

/**
 * Reads/writes theme snapshot for splash and native surfaces.
 * Renderer calls persistTheme with HSL token strings (same shape as useTheme THEME_COLORS).
 */

const DEFAULT_THEME = 'cherry-blossom';

/** Fallback when no file — cherry-blossom from useTheme.ts */
const DEFAULT_TOKENS = {
    theme: DEFAULT_THEME,
    primary: '340 82% 65%',
    secondary: '320 70% 55%',
    accent: '350 90% 70%',
    background: '340 15% 5%',
    foreground: '340 5% 95%',
    mutedForeground: '340 10% 60%',
    border: '340 10% 20%',
    card: '340 12% 8%',
};

function themeFilePath(app, path) {
    return path.join(app.getPath('userData'), 'theme.json');
}

function readThemeForSplash(app, fs, path) {
    const fp = themeFilePath(app, path);
    try {
        if (fs.existsSync(fp)) {
            const raw = JSON.parse(fs.readFileSync(fp, 'utf8'));
            return {
                theme: typeof raw.theme === 'string' ? raw.theme : DEFAULT_THEME,
                primary: raw.primary || DEFAULT_TOKENS.primary,
                secondary: raw.secondary || DEFAULT_TOKENS.secondary,
                accent: raw.accent || DEFAULT_TOKENS.accent,
                background: raw.background || DEFAULT_TOKENS.background,
                foreground: raw.foreground || DEFAULT_TOKENS.foreground,
                mutedForeground: raw.mutedForeground || DEFAULT_TOKENS.mutedForeground,
                border: raw.border || DEFAULT_TOKENS.border,
                card: raw.card || DEFAULT_TOKENS.card,
            };
        }
    } catch (e) {
        /* fall through */
    }
    return { ...DEFAULT_TOKENS };
}

function writeTheme(app, fs, path, payload) {
    const fp = themeFilePath(app, path);
    const dir = path.dirname(fp);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const merged = {
        theme: payload.theme || DEFAULT_THEME,
        primary: payload.primary || DEFAULT_TOKENS.primary,
        secondary: payload.secondary || DEFAULT_TOKENS.secondary,
        accent: payload.accent || DEFAULT_TOKENS.accent,
        background: payload.background || DEFAULT_TOKENS.background,
        foreground: payload.foreground || DEFAULT_TOKENS.foreground,
        mutedForeground: payload.mutedForeground || DEFAULT_TOKENS.mutedForeground,
        border: payload.border || DEFAULT_TOKENS.border,
        card: payload.card || DEFAULT_TOKENS.card,
    };
    fs.writeFileSync(fp, JSON.stringify(merged, null, 2), 'utf8');
    return merged;
}

/** Build URLSearchParams-style query object for splash.loadFile */
function toSplashQuery(tokens) {
    return {
        theme: tokens.theme,
        primary: tokens.primary,
        secondary: tokens.secondary,
        accent: tokens.accent,
        background: tokens.background,
        foreground: tokens.foreground,
        mutedForeground: tokens.mutedForeground,
        border: tokens.border,
        card: tokens.card,
    };
}

module.exports = {
    DEFAULT_THEME,
    readThemeForSplash,
    writeTheme,
    toSplashQuery,
};
