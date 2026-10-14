import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  readGuestSettingsFromCookie,
  readProfileAppSettings,
  saveAccountSettingsPatch,
  writeGuestSettingsCookie,
} from '@/lib/appSettingsPersistence';

// Novel-reader preferences. Mirrors `useReaderSettings` (flat interface +
// DEFAULTS + normalize/clamp + localStorage + guest cookie + account patch +
// cross-tab UPDATE_EVENT) so the novel reader and the Settings "Novel Reader"
// panel share one source of truth. Per-device, like manga/video.

export type NovelFontFamily = 'default' | 'sans' | 'georgia' | 'lora' | 'dyslexic' | string;
export type NovelNarratorEngine = 'system' | 'kitten-local' | 'elevenlabs' | 'local-server' | 'openai';

export interface NovelReaderSettings {
  /** Font preset key (built-ins above) or `custom:<family>` for a user font. */
  font: string;
  /** Body text size in px (12..32). */
  textSize: number;
  /** Line height multiplier (1.0..2.6). */
  lineSpacing: number;
  /** Paragraph gap multiplier in em (0..4). */
  paragraphSpacing: number;
  /** Measure cap in px (320..1100). */
  textWidth: number;
  /** Page background (hex). */
  background: string;
  /** Body text colour (hex). */
  textColour: string;
  /** Read the chapter aloud (KittenTTS narrator / speech fallback). */
  textToSpeech: boolean;
  narratorVoice: string;
  narratorRate: number; // 0.5..2
  /** Narration engine: auto (best available) / on-device Kitten / desktop sidecar / system voice. */
  narratorEngine: NovelNarratorEngine;
  kittenLocalModel: string;
  kittenVoice: string;
  /** Units prepared before playback and replenished while speaking (0 = off). */
  kittenBufferUnits: number;
  /** Load the next chapter as you reach the end (paged + scroll). */
  continuousScroll: boolean;
  /** Progress HUD toggles. */
  showProgressBar: boolean;
  showPercentRead: boolean;
  showChapterNumber: boolean;
  /** Enter fullscreen when the reader opens. */
  enterFullscreen: boolean;
  keepScreenAwake: boolean;
  showParagraphComments: boolean;
}

export const NOVEL_FONT_PRESETS: Array<{ key: string; label: string; stack: string }> = [
  { key: 'default', label: 'Default', stack: `Inter, system-ui, -apple-system, "Segoe UI", sans-serif` },
  { key: 'sans', label: 'Sans', stack: `"Source Sans 3", Inter, system-ui, sans-serif` },
  { key: 'georgia', label: 'Georgia', stack: `Georgia, "Times New Roman", serif` },
  { key: 'lora', label: 'Lora', stack: `Lora, Georgia, serif` },
  { key: 'dyslexic', label: 'Dyslexic', stack: `"OpenDyslexic", "Comic Sans MS", Verdana, sans-serif` },
];

const DEFAULT_SETTINGS: NovelReaderSettings = {
  font: 'default',
  textSize: 19,
  lineSpacing: 1.65,
  paragraphSpacing: 0.9,
  textWidth: 627,
  background: '#0a0a0f',
  textColour: '#e8e6e1',
  textToSpeech: false,
  narratorVoice: 'system-default',
  narratorRate: 1,
  narratorEngine: 'system',
  kittenLocalModel: 'nano-int8',
  kittenVoice: 'Luna',
  kittenBufferUnits: 3,
  continuousScroll: true,
  showProgressBar: true,
  showPercentRead: true,
  showChapterNumber: true,
  enterFullscreen: false,
  keepScreenAwake: false,
  showParagraphComments: true,
};

const STORAGE_KEY = 'novel-reader-settings';
const UPDATE_EVENT = 'tatakai-novel-reader-settings-updated';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const asBool = (v: unknown, fb: boolean) => (typeof v === 'boolean' ? v : fb);
const isHex = (v: unknown): v is string => typeof v === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v);
const asNum = (v: unknown, fb: number) => (Number.isFinite(Number(v)) ? Number(v) : fb);

const normalizeSettings = (raw: Partial<NovelReaderSettings> | null | undefined): NovelReaderSettings => ({
  ...DEFAULT_SETTINGS,
  ...Object.fromEntries(Object.entries(raw || {}).filter(([key]) => key in DEFAULT_SETTINGS)),
  font: typeof raw?.font === 'string' && raw.font.trim() ? raw.font.trim().slice(0, 120) : DEFAULT_SETTINGS.font,
  textSize: clamp(asNum(raw?.textSize, DEFAULT_SETTINGS.textSize), 12, 32),
  lineSpacing: clamp(asNum(raw?.lineSpacing, DEFAULT_SETTINGS.lineSpacing), 1.0, 2.6),
  paragraphSpacing: clamp(asNum(raw?.paragraphSpacing, DEFAULT_SETTINGS.paragraphSpacing), 0, 4),
  textWidth: clamp(asNum(raw?.textWidth, DEFAULT_SETTINGS.textWidth), 320, 1100),
  background: isHex(raw?.background) ? raw!.background! : DEFAULT_SETTINGS.background,
  textColour: isHex(raw?.textColour) ? raw!.textColour! : DEFAULT_SETTINGS.textColour,
  textToSpeech: asBool(raw?.textToSpeech, DEFAULT_SETTINGS.textToSpeech),
  narratorVoice: typeof raw?.narratorVoice === 'string' && raw.narratorVoice !== 'kitten-default' ? raw.narratorVoice : DEFAULT_SETTINGS.narratorVoice,
  narratorRate: clamp(asNum(raw?.narratorRate, DEFAULT_SETTINGS.narratorRate), 0.5, 2),
  narratorEngine: ['kitten-local', 'elevenlabs', 'local-server', 'openai'].includes(raw?.narratorEngine || '') ? raw!.narratorEngine! : 'system',
  kittenLocalModel: ['nano-int8', 'mini'].includes(raw?.kittenLocalModel || '') ? raw!.kittenLocalModel! : 'nano-int8',
  kittenVoice: typeof raw?.kittenVoice === 'string' && raw.kittenVoice.trim() ? raw.kittenVoice : 'Luna',
  kittenBufferUnits: Math.round(clamp(asNum(raw?.kittenBufferUnits, DEFAULT_SETTINGS.kittenBufferUnits), 0, 5)),
  continuousScroll: asBool(raw?.continuousScroll, DEFAULT_SETTINGS.continuousScroll),
  showProgressBar: asBool(raw?.showProgressBar, DEFAULT_SETTINGS.showProgressBar),
  showPercentRead: asBool(raw?.showPercentRead, DEFAULT_SETTINGS.showPercentRead),
  showChapterNumber: asBool(raw?.showChapterNumber, DEFAULT_SETTINGS.showChapterNumber),
  enterFullscreen: asBool(raw?.enterFullscreen, DEFAULT_SETTINGS.enterFullscreen),
  keepScreenAwake: asBool(raw?.keepScreenAwake, DEFAULT_SETTINGS.keepScreenAwake),
  showParagraphComments: asBool(raw?.showParagraphComments, DEFAULT_SETTINGS.showParagraphComments),
});

const areEqual = (l: NovelReaderSettings, r: NovelReaderSettings) =>
  (Object.keys(DEFAULT_SETTINGS) as Array<keyof NovelReaderSettings>).every((k) => l[k] === r[k]);

function loadFromStorage(): NovelReaderSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      const cookie = readGuestSettingsFromCookie().novelReader;
      if (!cookie || typeof cookie !== 'object') return DEFAULT_SETTINGS;
      return normalizeSettings(cookie as Partial<NovelReaderSettings>);
    }
    return normalizeSettings(JSON.parse(stored) as Partial<NovelReaderSettings>);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

const persistLocal = (s: NovelReaderSettings) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  writeGuestSettingsCookie({ novelReader: s as unknown as Record<string, unknown> });
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
};

export function resolveFontStack(font: string, customFonts: Array<{ name: string; family: string }> = []): string {
  if (font.startsWith('custom:')) {
    const name = font.slice('custom:'.length);
    const found = customFonts.find((f) => f.name === name);
    if (found) return `"${found.family}", Georgia, serif`;
    return `"${name}", Georgia, serif`;
  }
  return NOVEL_FONT_PRESETS.find((p) => p.key === font)?.stack ?? NOVEL_FONT_PRESETS[0].stack;
}

export function useNovelReaderSettings() {
  const { user, profile } = useAuth();
  const [settings, setSettings] = useState<NovelReaderSettings>(() => loadFromStorage());
  const [customFonts, setCustomFonts] = useState<Array<{ name: string; family: string }>>([]);
  const seededRef = useRef<string | null>(null);

  // Uploaded font files live in IndexedDB — register them with the FontFace
  // API on boot and list them (plus legacy typed family names) for the picker.
  useEffect(() => {
    let cancelled = false;
    void import('@/lib/novel/customFonts').then(async ({ loadStoredFonts, listCustomFonts }) => {
      await loadStoredFonts().catch(() => 0);
      if (cancelled) return;
      const fonts = await listCustomFonts().catch(() => []);
      if (!cancelled) setCustomFonts(fonts);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const accountSettings = useMemo(
    () => (readProfileAppSettings(profile) as any)?.novelReader,
    [profile?.app_settings],
  );

  useEffect(() => {
    try { persistLocal(settings); } catch { /* ignore */ }
  }, [settings]);

  useEffect(() => {
    if (!user?.id) return;
    if (!accountSettings || typeof accountSettings !== 'object') return;
    const next = normalizeSettings(accountSettings as Partial<NovelReaderSettings>);
    setSettings((prev) => (areEqual(prev, next) ? prev : next));
  }, [user?.id, accountSettings]);

  useEffect(() => {
    if (!user?.id) { seededRef.current = null; return; }
    if (accountSettings && typeof accountSettings === 'object') { seededRef.current = user.id; return; }
    if (seededRef.current === user.id) return;
    seededRef.current = user.id;
    void saveAccountSettingsPatch(user.id, {
      novelReader: settings as unknown as Record<string, unknown>,
    }).catch(() => { seededRef.current = null; });
  }, [user?.id, accountSettings, settings]);

  useEffect(() => {
    const sync = () => {
      const next = loadFromStorage();
      setSettings((prev) => (areEqual(prev, next) ? prev : next));
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key && e.key !== STORAGE_KEY) return;
      sync();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(UPDATE_EVENT, sync);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(UPDATE_EVENT, sync);
    };
  }, []);

  const updateSetting = <K extends keyof NovelReaderSettings>(key: K, value: NovelReaderSettings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      if (user?.id) {
        void saveAccountSettingsPatch(user.id, {
          novelReader: next as unknown as Record<string, unknown>,
        }).catch(() => undefined);
      }
      return next;
    });
  };

  const addCustomFont = (name: string, family: string) => {
    const clean = name.trim().slice(0, 60);
    if (!clean) return;
    setCustomFonts((prev) => {
      if (prev.some((f) => f.name === clean)) return prev;
      return [...prev, { name: clean, family: family.trim() || clean }].slice(0, 24);
    });
    // Persist typed family names in the legacy slot so they survive reloads.
    try {
      const raw = localStorage.getItem('novel-custom-fonts');
      const parsed: Array<{ name: string; family: string }> = raw ? JSON.parse(raw) : [];
      if (!parsed.some((f) => f?.name === clean)) {
        parsed.push({ name: clean, family: family.trim() || clean });
        localStorage.setItem('novel-custom-fonts', JSON.stringify(parsed.slice(0, 24)));
      }
    } catch { /* ignore */ }
  };

  /** Upload a real font file (TTF/OTF/WOFF/WOFF2) and select it. */
  const addCustomFontFile = async (file: File): Promise<string | null> => {
    try {
      const { uploadCustomFont, listCustomFonts } = await import('@/lib/novel/customFonts');
      const { name } = await uploadCustomFont(file);
      const fonts = await listCustomFonts().catch(() => []);
      if (fonts.length > 0) setCustomFonts(fonts);
      updateSetting('font', `custom:${name}`);
      return name;
    } catch {
      return null;
    }
  };

  const removeCustomFont = (name: string) => {
    void import('@/lib/novel/customFonts').then(({ deleteCustomFont, listCustomFonts }) => {
      void deleteCustomFont(name)
        .then(() => listCustomFonts().catch(() => []))
        .then((fonts) => setCustomFonts(fonts));
    });
    try {
      const raw = localStorage.getItem('novel-custom-fonts');
      const parsed: Array<{ name: string; family: string }> = raw ? JSON.parse(raw) : [];
      localStorage.setItem(
        'novel-custom-fonts',
        JSON.stringify(parsed.filter((f) => f?.name !== name)),
      );
    } catch { /* ignore */ }
    setCustomFonts((prev) => prev.filter((f) => f.name !== name));
    setSettings((prev) => (prev.font === `custom:${name}` ? { ...prev, font: 'default' } : prev));
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    if (user?.id) {
      void saveAccountSettingsPatch(user.id, {
        novelReader: DEFAULT_SETTINGS as unknown as Record<string, unknown>,
      }).catch(() => undefined);
    }
  };

  return {
    settings,
    updateSetting,
    resetSettings,
    customFonts,
    addCustomFont,
    addCustomFontFile,
    removeCustomFont,
    DEFAULT_NOVEL_READER_SETTINGS: DEFAULT_SETTINGS,
  };
}

export { DEFAULT_SETTINGS as DEFAULT_NOVEL_READER_SETTINGS };
