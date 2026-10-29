export type VideoEnhancementEngine = 'off' | 'anime4k' | 'rtx';
export type VideoEnhancementQuality = 'light' | 'balanced' | 'high';

/** Preserve legacy Anime4K choices, including the restore/upscale-only modes. */
export function normalizeVideoEnhancement(raw: { videoEnhancementEngine?: unknown; videoEnhancementQuality?: unknown; anime4kPreset?: unknown } | null | undefined) {
  const legacy = ['light', 'standard', 'high', 'upscale', 'restore'].includes(String(raw?.anime4kPreset));
  return {
    videoEnhancementEngine: (['off', 'anime4k', 'rtx'].includes(String(raw?.videoEnhancementEngine)) ? raw.videoEnhancementEngine : legacy ? 'anime4k' : 'off') as VideoEnhancementEngine,
    videoEnhancementQuality: (['light', 'balanced', 'high'].includes(String(raw?.videoEnhancementQuality)) ? raw.videoEnhancementQuality : raw?.anime4kPreset === 'light' ? 'light' : raw?.anime4kPreset === 'high' ? 'high' : 'balanced') as VideoEnhancementQuality,
  };
}

export const ANIME4K_QUALITY = { light: 'light', balanced: 'standard', high: 'high' } as const;
