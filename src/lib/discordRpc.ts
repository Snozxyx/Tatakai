/**
 * Discord Rich Presence helpers for the Tatakai desktop app.
 *
 * All public API functions are no-ops on web and when the user has disabled RPC,
 * so call-sites never need to guard against environment.
 *
 * Privacy is controlled by DiscordRpcSettings stored in localStorage under
 * `tatakai_discord_rpc_settings`. The legacy `tatakai_discord_rpc` key is still
 * read so existing installs stay opted-in without needing a re-install.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RpcExtra = {
  startTime?: Date;
  endTime?: Date;

  largeImageKey?: string;
  largeImageText?: string;

  smallImageKey?: string;
  smallImageText?: string;

  buttons?: Array<{ label: string; url: string }>;

  instance?: boolean;
};

/**
 * Granular privacy settings. Each flag gates whether that piece of data is
 * sent to Discord. All default to `true` (opt-in) so the first launch is rich
 * out of the box; users can dial each one back in Settings.
 */
export type DiscordRpcSettings = {
  enabled: boolean;
  showAnimeTitle: boolean;
  showEpisode: boolean;
  showSeason: boolean;
  showLanguage: boolean;
  showProgress: boolean;
  showButtons: boolean;
};

const SETTINGS_KEY = 'tatakai_discord_rpc_settings';
const LEGACY_KEY = 'tatakai_discord_rpc';

const DEFAULT_SETTINGS: DiscordRpcSettings = {
  enabled: true,
  showAnimeTitle: true,
  showEpisode: true,
  showSeason: true,
  showLanguage: true,
  showProgress: true,
  showButtons: true,
};

// ---------------------------------------------------------------------------
// Settings helpers
// ---------------------------------------------------------------------------

export function getDiscordRpcSettings(): DiscordRpcSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }

    // Migrate legacy single-bool flag.
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy !== null) {
      const enabled = legacy === 'true' || legacy === '1';
      return { ...DEFAULT_SETTINGS, enabled };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveDiscordRpcSettings(settings: Partial<DiscordRpcSettings>): void {
  try {
    const current = getDiscordRpcSettings();
    const next = { ...current, ...settings };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    // Keep legacy key in sync so older code paths still work.
    localStorage.setItem(LEGACY_KEY, String(next.enabled));
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Environment checks
// ---------------------------------------------------------------------------

function hasElectronRpc(): boolean {
  return typeof window !== 'undefined' && Boolean((window as any).electron?.updateRPC);
}

/** @deprecated Use getDiscordRpcSettings().enabled instead. */
export function isDiscordRpcEnabled(): boolean {
  return getDiscordRpcSettings().enabled;
}

export function canShowDiscordRpc(): boolean {
  return hasElectronRpc() && getDiscordRpcSettings().enabled;
}

// ---------------------------------------------------------------------------
// Low-level primitive (kept for backward compat, prefer the helpers below)
// ---------------------------------------------------------------------------

export function updateDiscordRpc(details: string, state: string, extra: RpcExtra = {}): void {
  if (!canShowDiscordRpc()) return;
  (window as any).electron.updateRPC({ details, state, extra });
}

/**
 * Truly clear the Discord activity (no fallback "Browsing Anime" stub).
 * The Electron side calls `rpc.clearActivity()` and resets to idle.
 */
export function clearDiscordRpc(): void {
  if (!hasElectronRpc()) return;
  if ((window as any).electron.clearRPC) {
    (window as any).electron.clearRPC();
    return;
  }
  // Older bridge: use a blank updateRPC to wipe the activity fields.
  if (!isDiscordRpcEnabled()) return;
  (window as any).electron.updateRPC({ details: '', state: '' });
}

// ---------------------------------------------------------------------------
// Specialized helpers
// ---------------------------------------------------------------------------

/**
 * Set RPC for active playback. Handles sub/dub label, S•EP format, and the
 * elapsed/remaining timestamps automatically.
 *
 * Privacy settings are applied here — omitted fields show a generic fallback
 * so the presence still looks intentional, not half-empty.
 */
export function setWatchingRpc(options: {
  animeTitle: string;
  episode: number;
  season?: number;
  language?: string;
  isDub?: boolean;
  currentTime?: number;
  duration?: number;
  /** External URL of the anime poster — shown as the large image in Discord. Falls back to the app logo. */
  animeImageUrl?: string;
  imageKey?: string;
  animeUrl?: string;
}): void {
  if (!canShowDiscordRpc()) return;

  const s = getDiscordRpcSettings();

  // ── details (line 1) ──────────────────────────────────────────────────────
  const titlePart = s.showAnimeTitle ? `Watching ${options.animeTitle}` : 'Watching Anime';

  // ── state (line 2) ────────────────────────────────────────────────────────
  const parts: string[] = [];

  if (s.showSeason && options.season) {
    parts.push(`S${options.season}`);
  }

  if (s.showEpisode) {
    parts.push(`Episode ${options.episode}`);
  }

  if (s.showLanguage && options.language) {
    const label = options.isDub
      ? `${options.language} Dub`
      : `${options.language} • Sub`;
    parts.push(label);
  }

  const state = parts.length > 0 ? parts.join(' • ') : 'Watching';

  // ── image — prefer external poster URL, fall back to registered asset key ──
  const largeImageKey = options.animeImageUrl || options.imageKey || 'logo';

  // ── timestamps ────────────────────────────────────────────────────────────
  const extra: RpcExtra = {
    largeImageKey,
    largeImageText: s.showAnimeTitle ? options.animeTitle : 'Tatakai',
    smallImageKey: 'play_icon',
    smallImageText: 'Playing',
  };

  if (s.showProgress) {
    const current = options.currentTime ?? 0;
    const duration = options.duration ?? 0;
    extra.startTime = new Date(Date.now() - current * 1000);
    if (duration > 0 && current < duration) {
      extra.endTime = new Date(Date.now() + (duration - current) * 1000);
    }
  }

  if (s.showButtons) {
    const buttons: Array<{ label: string; url: string }> = [];
    if (options.animeUrl) {
      buttons.push({ label: 'Show in Tatakai', url: options.animeUrl });
    }
    // Always offer a download button so Discord friends can get the app.
    buttons.push({ label: 'Download Tatakai', url: 'https://tatakai.me/download' });
    extra.buttons = buttons.slice(0, 2);
  }

  updateDiscordRpc(titlePart, state, extra);
}

/**
 * Set RPC for a paused episode. No timestamps (paused = no elapsed counter).
 */
export function setPausedRpc(options: {
  animeTitle: string;
  episode: number;
  season?: number;
  language?: string;
  isDub?: boolean;
  /** External URL of the anime poster — shown as the large image in Discord. Falls back to the app logo. */
  animeImageUrl?: string;
  imageKey?: string;
  animeUrl?: string;
}): void {
  if (!canShowDiscordRpc()) return;

  const s = getDiscordRpcSettings();

  const titlePart = s.showAnimeTitle ? `Paused ${options.animeTitle}` : 'Paused';

  const parts: string[] = [];
  if (s.showSeason && options.season) parts.push(`S${options.season}`);
  if (s.showEpisode) parts.push(`Episode ${options.episode}`);
  if (s.showLanguage && options.language) {
    parts.push(options.isDub ? `${options.language} Dub` : `${options.language} • Sub`);
  }
  const state = parts.length > 0 ? parts.join(' • ') : 'Paused';

  // ── image — prefer external poster URL, fall back to registered asset key ──
  const largeImageKey = options.animeImageUrl || options.imageKey || 'logo';

  const extra: RpcExtra = {
    largeImageKey,
    largeImageText: s.showAnimeTitle ? options.animeTitle : 'Tatakai',
    smallImageKey: 'pause_icon',
    smallImageText: 'Paused',
  };

  if (s.showButtons) {
    const buttons: Array<{ label: string; url: string }> = [];
    if (options.animeUrl) {
      buttons.push({ label: 'Show in Tatakai', url: options.animeUrl });
    }
    buttons.push({ label: 'Download Tatakai', url: 'https://tatakai.me/download' });
    extra.buttons = buttons.slice(0, 2);
  }

  updateDiscordRpc(titlePart, state, extra);
}

/**
 * Set RPC when viewing an anime detail page (not yet playing).
 */
export function setViewingRpc(options: {
  animeTitle: string;
  /** External URL of the anime poster — shown as the large image in Discord. Falls back to the app logo. */
  animeImageUrl?: string;
  imageKey?: string;
  animeUrl?: string;
}): void {
  if (!canShowDiscordRpc()) return;

  const s = getDiscordRpcSettings();

  const details = s.showAnimeTitle ? `Viewing ${options.animeTitle}` : 'Viewing Anime';

  // ── image — prefer external poster URL, fall back to registered asset key ──
  const largeImageKey = options.animeImageUrl || options.imageKey || 'logo';

  const extra: RpcExtra = {
    largeImageKey,
    largeImageText: s.showAnimeTitle ? options.animeTitle : 'Tatakai',
    smallImageKey: 'logo',
    smallImageText: 'Tatakai',
  };

  if (s.showButtons) {
    const buttons: Array<{ label: string; url: string }> = [];
    if (options.animeUrl) {
      buttons.push({ label: 'Show in Tatakai', url: options.animeUrl });
    }
    buttons.push({ label: 'Download Tatakai', url: 'https://tatakai.me/download' });
    extra.buttons = buttons.slice(0, 2);
  }

  updateDiscordRpc(details, 'Browsing details', extra);
}

/**
 * Set RPC for general browsing / home / search states.
 *
 * @param section  Human-readable label, e.g. "Anime", "Community", "Search"
 */
export function setBrowsingRpc(section: string = 'Anime'): void {
  if (!canShowDiscordRpc()) return;

  const s = getDiscordRpcSettings();

  const extra: RpcExtra = {
    largeImageKey: 'logo',
    largeImageText: 'Tatakai',
    smallImageKey: 'logo',
    smallImageText: 'Tatakai',
  };

  if (s.showButtons) {
    extra.buttons = [
      { label: 'Download Tatakai', url: 'https://tatakai.me/download' },
    ];
  }

  updateDiscordRpc(`Browsing ${section}`, 'Exploring Tatakai', extra);
}

/**
 * Set RPC for the episode selection screen.
 */
export function setSelectingRpc(options: {
  animeTitle: string;
  /** External URL of the anime poster — shown as the large image in Discord. Falls back to the app logo. */
  animeImageUrl?: string;
  imageKey?: string;
  animeUrl?: string;
}): void {
  if (!canShowDiscordRpc()) return;

  const s = getDiscordRpcSettings();

  const details = s.showAnimeTitle ? `Choosing an Episode` : 'Choosing an Episode';
  const state = s.showAnimeTitle ? options.animeTitle : 'On Tatakai';

  // ── image — prefer external poster URL, fall back to registered asset key ──
  const largeImageKey = options.animeImageUrl || options.imageKey || 'logo';

  const extra: RpcExtra = {
    largeImageKey,
    largeImageText: s.showAnimeTitle ? options.animeTitle : 'Tatakai',
    smallImageKey: 'logo',
    smallImageText: 'Tatakai',
  };

  if (s.showButtons) {
    const buttons: Array<{ label: string; url: string }> = [];
    if (options.animeUrl) {
      buttons.push({ label: 'Show in Tatakai', url: options.animeUrl });
    }
    buttons.push({ label: 'Download Tatakai', url: 'https://tatakai.me/download' });
    extra.buttons = buttons.slice(0, 2);
  }

  updateDiscordRpc(details, state, extra);
}

/**
 * Set RPC when actively reading a manga chapter.
 */
export function setReadingMangaRpc(options: {
  mangaTitle: string;
  chapter?: number | null;
  /** External URL of the manga cover — shown as the large image in Discord. Falls back to the app logo. */
  mangaImageUrl?: string | null;
  mangaUrl?: string;
}): void {
  if (!canShowDiscordRpc()) return;

  const s = getDiscordRpcSettings();

  const details = s.showAnimeTitle ? `Reading ${options.mangaTitle}` : 'Reading Manga';
  const state =
    s.showEpisode && options.chapter != null
      ? `Chapter ${options.chapter}`
      : 'Reading';

  const largeImageKey = options.mangaImageUrl || 'logo';

  const extra: RpcExtra = {
    largeImageKey,
    largeImageText: s.showAnimeTitle ? options.mangaTitle : 'Tatakai',
    smallImageKey: 'logo',
    smallImageText: 'Tatakai',
    startTime: new Date(),
  };

  if (s.showButtons) {
    const buttons: Array<{ label: string; url: string }> = [];
    if (options.mangaUrl) {
      buttons.push({ label: 'Show in Tatakai', url: options.mangaUrl });
    }
    buttons.push({ label: 'Download Tatakai', url: 'https://tatakai.me/download' });
    extra.buttons = buttons.slice(0, 2);
  }

  updateDiscordRpc(details, state, extra);
}

/**
 * Set RPC when viewing a manga detail / info page (not yet reading).
 */
export function setViewingMangaRpc(options: {
  mangaTitle: string;
  /** External URL of the manga cover — shown as the large image in Discord. Falls back to the app logo. */
  mangaImageUrl?: string | null;
  mangaUrl?: string;
}): void {
  if (!canShowDiscordRpc()) return;

  const s = getDiscordRpcSettings();

  const details = s.showAnimeTitle ? `Viewing ${options.mangaTitle}` : 'Viewing Manga';

  const largeImageKey = options.mangaImageUrl || 'logo';

  const extra: RpcExtra = {
    largeImageKey,
    largeImageText: s.showAnimeTitle ? options.mangaTitle : 'Tatakai',
    smallImageKey: 'logo',
    smallImageText: 'Tatakai',
  };

  if (s.showButtons) {
    const buttons: Array<{ label: string; url: string }> = [];
    if (options.mangaUrl) {
      buttons.push({ label: 'Show in Tatakai', url: options.mangaUrl });
    }
    buttons.push({ label: 'Download Tatakai', url: 'https://tatakai.me/download' });
    extra.buttons = buttons.slice(0, 2);
  }

  updateDiscordRpc(details, 'Browsing details', extra);
}
