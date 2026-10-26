import { safeProfileAudio } from "@/lib/profileThemeMusic";
export const MIDNIGHT_LOFI_ASSETS = "/assets/profile-themes/midnight-lofi/";
export const MIDNIGHT_LOFI_ROOM = `${MIDNIGHT_LOFI_ASSETS}midnight-room.webp`;

export type MidnightLofiAccent = "cyan" | "amber" | "violet";

export interface MidnightLofiConfig {
  version: 1;
  motion: boolean;
  glowIntensity: number; // 0.0 to 1.0
  accent: MidnightLofiAccent;
  scanlines: boolean;
  japaneseAccents: boolean;
  music: { url: string; title: string; volume: number };
}

export const defaultMidnightLofiConfig = (): MidnightLofiConfig => ({
  version: 1,
  music: { url: "", title: "After the last train", volume: 0.35 },
  motion: true,
  glowIntensity: 0.7,
  accent: "cyan",
  scanlines: true,
  japaneseAccents: true,
});

export function readMidnightLofiConfig(
  value: unknown
): MidnightLofiConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const c = value as Record<string, unknown>;
  if (c.version !== 1) return null;

  const validAccents: MidnightLofiAccent[] = ["cyan", "amber", "violet"];
  const accent: MidnightLofiAccent =
    typeof c.accent === "string" &&
    validAccents.includes(c.accent as MidnightLofiAccent)
      ? (c.accent as MidnightLofiAccent)
      : "cyan";

  const glowIntensity =
    typeof c.glowIntensity === "number" && Number.isFinite(c.glowIntensity)
      ? Math.max(0, Math.min(1, c.glowIntensity))
      : 0.7;

  const music =
    c.music && typeof c.music === "object"
      ? (c.music as Record<string, unknown>)
      : {};
  return {
    music: {
      url: safeProfileAudio(music.url),
      title:
        typeof music.title === "string"
          ? music.title.slice(0, 100)
          : "After the last train",
      volume:
        typeof music.volume === "number" && Number.isFinite(music.volume)
          ? Math.max(0, Math.min(1, music.volume))
          : 0.35,
    },
    version: 1,
    motion: c.motion !== false,
    glowIntensity,
    accent,
    scanlines: c.scanlines !== false,
    japaneseAccents: c.japaneseAccents !== false,
  };
}
