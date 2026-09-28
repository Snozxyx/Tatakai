import { CUSTOM_SUBTITLE_FONT_FAMILY } from "./subtitleStyle";

/**
 * User-uploaded subtitle font. The font file is stored as a data URL in
 * localStorage and registered with the document via the FontFace API under a
 * fixed family name, so `subtitleFont: 'custom'` picks it up everywhere.
 *
 * Kept tiny and dependency-free; the player and the settings editor both call
 * `ensureCustomSubtitleFontLoaded()` on mount.
 */

const STORAGE_KEY = "tatakai.video.customFont";
export const CUSTOM_SUBTITLE_FONT_UPDATED_EVENT = "tatakai-custom-subtitle-font-updated";
/** Reject anything that would blow out localStorage (data URLs are ~1.33× the file). */
const MAX_FONT_BYTES = 3 * 1024 * 1024;

interface StoredFont {
  name: string; // original filename, for display
  dataUrl: string; // data: URL of the font file
}

let registered = false;

function readStored(): StoredFont | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredFont;
    if (parsed && typeof parsed.dataUrl === "string" && parsed.dataUrl.startsWith("data:")) {
      return parsed;
    }
  } catch {
    // Corrupt entry — ignore.
  }
  return null;
}

async function registerFont(dataUrl: string): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  const face = new FontFace(CUSTOM_SUBTITLE_FONT_FAMILY, `url(${dataUrl})`);
  await face.load();
  document.fonts.add(face);
}

/** Registers the stored custom font (if any) with the document. Idempotent. */
export async function ensureCustomSubtitleFontLoaded(): Promise<void> {
  if (registered) return;
  const stored = readStored();
  if (!stored) return;
  try {
    await registerFont(stored.dataUrl);
    registered = true;
  } catch {
    // Bad font data — drop it so we don't retry forever.
    localStorage.removeItem(STORAGE_KEY);
  }
}

/** The display name of the stored custom font, or null if none. */
export function getCustomSubtitleFontName(): string | null {
  return readStored()?.name ?? null;
}

/**
 * Store and register a user-picked font file. Returns the display name on
 * success; throws with a user-facing message on failure (too big / unreadable).
 */
export async function setCustomSubtitleFont(file: File): Promise<string> {
  if (file.size > MAX_FONT_BYTES) {
    throw new Error("Font file is too large (max 3 MB).");
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the font file."));
    reader.readAsDataURL(file);
  });

  // Register first so an invalid font fails before we persist it.
  registered = false;
  await registerFont(dataUrl);
  registered = true;

  const entry: StoredFont = { name: file.name, dataUrl };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
  window.dispatchEvent(new CustomEvent(CUSTOM_SUBTITLE_FONT_UPDATED_EVENT));
  return file.name;
}

/** Remove the stored custom font. The FontFace stays registered until reload. */
export function clearCustomSubtitleFont(): void {
  localStorage.removeItem(STORAGE_KEY);
  registered = false;
  window.dispatchEvent(new CustomEvent(CUSTOM_SUBTITLE_FONT_UPDATED_EVENT));
}
