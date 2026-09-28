import type { CSSProperties } from "react";
import type { VideoSettings } from "@/hooks/media/useVideoSettings";

/** Font-family used for a user-uploaded custom subtitle font (see customSubtitleFont.ts). */
export const CUSTOM_SUBTITLE_FONT_FAMILY = "TatakaiCustomSub";

const SIZE_REM: Record<VideoSettings["subtitleSize"], string> = {
  small: "1.4rem",
  medium: "1.9rem",
  large: "2.5rem",
  xlarge: "3.1rem",
};

const FONT_STACK: Record<VideoSettings["subtitleFont"], string> = {
  default: "'Space Grotesk', system-ui, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "'Fira Code', 'Courier New', monospace",
  comic: "'Comic Sans MS', 'Comic Neue', cursive",
  custom: `'${CUSTOM_SUBTITLE_FONT_FAMILY}', 'Space Grotesk', system-ui, sans-serif`,
};

/** Resolve the CSS font-family string for the chosen subtitle font. */
export function resolveSubtitleFontFamily(font: VideoSettings["subtitleFont"]): string {
  return FONT_STACK[font] ?? FONT_STACK.default;
}

/**
 * Build the inline style for one subtitle line from user settings. Shared by the
 * live overlay (SubtitleOverlay) and the settings-page preview so what you see
 * while configuring is exactly what renders during playback.
 */
export function buildSubtitleCueStyle(settings: VideoSettings): CSSProperties {
  const bgAlpha =
    settings.subtitleBackground === "none"
      ? 0
      : settings.subtitleBackground === "solid"
        ? 0.95
        : settings.subtitleOpacity;

  const outline = settings.subtitleOutline
    ? "1px 1px 2px rgba(0,0,0,0.95), -1px -1px 2px rgba(0,0,0,0.8), 0 0 4px rgba(0,0,0,0.9)"
    : "none";

  return {
    display: "inline-block",
    color: settings.subtitleColor,
    fontFamily: resolveSubtitleFontFamily(settings.subtitleFont),
    fontSize: SIZE_REM[settings.subtitleSize],
    lineHeight: 1.35,
    fontWeight: 600,
    padding: bgAlpha > 0 ? "0.1em 0.45em" : "0",
    borderRadius: 6,
    backgroundColor: bgAlpha > 0 ? `rgba(0,0,0,${bgAlpha})` : "transparent",
    textShadow: outline,
    whiteSpace: "pre-line",
    maxWidth: "90%",
  };
}
