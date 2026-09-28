import type { ComponentType } from 'react';
import {
  User,
  Bookmark,
  Shield,
  Plug,
  Palette,
  Monitor,
  PlayCircle,
  BookOpen,
  SlidersHorizontal,
  Puzzle,
  Info,
  ScrollText,
} from 'lucide-react';
import type { SettingsCategoryId } from '@/contexts/SettingsModalContext';
import { AccountPanel } from './panels/AccountPanel';
import { SavedContentPanel } from './panels/SavedContentPanel';
import { PrivacyPanel } from './panels/PrivacyPanel';
import { IntegrationsPanel } from './panels/IntegrationsPanel';
import { AppearancePanel } from './panels/AppearancePanel';
import { DisplayPanel } from './panels/DisplayPanel';
import { VideoPlayerPanel } from './panels/VideoPlayerPanel';
import { ReaderPanel } from './panels/ReaderPanel';
import { AppSettingsPanel } from './panels/AppSettingsPanel';
import { ExtensionsPanel } from './panels/ExtensionsPanel';
import { AboutPanel } from './panels/AboutPanel';
import { ChangelogPanel } from './panels/ChangelogPanel';

export type SettingsGroup = 'User' | 'App' | 'Info';

export interface SettingsCategory {
  id: SettingsCategoryId;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  group: SettingsGroup;
  /** Desktop-only categories are hidden on web / mobile. */
  requiresNative?: boolean;
  /** Extra search terms so the modal filter surfaces a category by the settings it holds, not just its label. */
  keywords?: string[];
  /** Panels accept an optional `section` prop for deep-link scrolling. */
  Component: ComponentType<{ section?: string }>;
}

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  { id: 'account', label: 'Account', description: 'Identity, email, password, and sessions', icon: User, group: 'User', keywords: ['username', 'display name', 'email', 'password', 'change password', 'sessions', 'sign out', 'log out', 'logout', 'avatar', 'banner', 'profile picture', 'delete account'], Component: AccountPanel },
  { id: 'saved', label: 'Saved Content', description: 'Bookmarks, tier lists, playlists, and uploaded media', icon: Bookmark, group: 'User', keywords: ['bookmarks', 'tier lists', 'tierlist', 'playlists', 'uploads', 'uploaded media', 'favorites', 'watchlist', 'library', 'collections'], Component: SavedContentPanel },
  { id: 'privacy', label: 'Privacy', description: 'Mature content, profile visibility, and history', icon: Shield, group: 'User', keywords: ['mature content', 'nsfw', 'adult', '18+', 'explicit', 'profile visibility', 'public profile', 'private', 'watch history', 'clear history', 'reading history', 'blur'], Component: PrivacyPanel },
  { id: 'integrations', label: 'Integrations', description: 'MyAnimeList and AniList sync', icon: Plug, group: 'User', keywords: ['myanimelist', 'mal', 'anilist', 'sync', 'tracking', 'tracker', 'import list', 'export list', 'connect account'], Component: IntegrationsPanel },
  { id: 'appearance', label: 'Appearance', description: 'Theme and visual style', icon: Palette, group: 'App', keywords: ['theme', 'dark mode', 'light mode', 'colors', 'accent color', 'visual style', 'wallpaper', 'background', 'window'], Component: AppearancePanel },
  { id: 'display', label: 'Display', description: 'Languages, motion, and contrast', icon: Monitor, group: 'App', keywords: ['language', 'subtitle language', 'audio language', 'reduce motion', 'high contrast', 'accessibility', 'ultra-lite', 'ultra lite', 'performance', 'feature flags', 'admin'], Component: DisplayPanel },
  { id: 'player', label: 'Video Player', description: 'Playback and player behavior', icon: PlayCircle, group: 'App', keywords: ['playback', 'autoplay', 'auto play', 'skip intro', 'skip outro', 'quality', 'subtitles', 'captions', 'external player', 'mpv', 'vlc', 'volume', 'speed'], Component: VideoPlayerPanel },
  { id: 'reader', label: 'Reader', description: 'Manga reading layout and keybinds', icon: BookOpen, group: 'App', keywords: ['manga', 'reader', 'reading', 'reading direction', 'webtoon', 'vertical', 'paged', 'page fit', 'width', 'gap', 'background', 'preload', 'preloading', 'infinite scroll', 'auto scroll', 'keybinds', 'keyboard shortcuts', 'comments', 'zoom'], Component: ReaderPanel },
  { id: 'app', label: 'App Settings', description: 'Desktop and torrent preferences', icon: SlidersHorizontal, group: 'App', requiresNative: true, keywords: ['desktop', 'torrent', 'webtorrent', 'download location', 'storage path', 'startup', 'launch at startup', 'updates', 'auto update', 'logs', 'diagnostics', 'discord', 'rich presence', 'rpc', 'debrid', 'real-debrid', 'realdebrid', 'torbox', 'flaresolverr', 'cloudflare', 'proxy', 'home server', 'warp', 'country policy', 'region', 'developer mode', 'danger zone', 'reset app', 'bandwidth', 'connections', 'upnp'], Component: AppSettingsPanel },
  { id: 'extensions', label: 'Extensions', description: 'Manage source extensions', icon: Puzzle, group: 'App', keywords: ['extensions', 'sources', 'plugins', 'extension hub', 'sideload', 'providers', 'repositories'], Component: ExtensionsPanel },
  { id: 'about', label: 'About', description: 'Version and legal information', icon: Info, group: 'Info', keywords: ['version', 'legal', 'license', 'terms', 'privacy policy', 'credits', 'build'], Component: AboutPanel },
  { id: 'changelog', label: 'Changelog', description: 'Recent releases and changes', icon: ScrollText, group: 'Info', keywords: ['changelog', 'releases', 'updates', "what's new", 'whats new', 'version history', 'patch notes'], Component: ChangelogPanel },
];

export const SETTINGS_GROUP_ORDER: SettingsGroup[] = ['User', 'App', 'Info'];

export function getSettingsCategory(id: SettingsCategoryId): SettingsCategory {
  return SETTINGS_CATEGORIES.find((c) => c.id === id) ?? SETTINGS_CATEGORIES[0];
}
