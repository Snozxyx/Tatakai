import uiI18n from '@/lib/uiI18n';
import { lazy, type ComponentType } from 'react';
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
  Smartphone,
  Puzzle,
  Info,
  ScrollText,
  Languages,
} from 'lucide-react';
import type { SettingsCategoryId } from '@/contexts/SettingsModalContext';
const AccountPanel = lazy(() => import('./panels/AccountPanel').then(module => ({ default: module.AccountPanel })));
const SavedContentPanel = lazy(() => import('./panels/SavedContentPanel').then(module => ({ default: module.SavedContentPanel })));
const PrivacyPanel = lazy(() => import('./panels/PrivacyPanel').then(module => ({ default: module.PrivacyPanel })));
const IntegrationsPanel = lazy(() => import('./panels/IntegrationsPanel').then(module => ({ default: module.IntegrationsPanel })));
const AppearancePanel = lazy(() => import('./panels/AppearancePanel').then(module => ({ default: module.AppearancePanel })));
const ProfileStorePanel = lazy(() => import('./panels/ProfileStorePanel').then(module => ({ default: module.ProfileStorePanel })));
const DisplayPanel = lazy(() => import('./panels/DisplayPanel').then(module => ({ default: module.DisplayPanel })));
const TranslationPanel = lazy(() => import('./panels/TranslationPanel').then(module => ({ default: module.TranslationPanel })));
const VideoPlayerPanel = lazy(() => import('./panels/VideoPlayerPanel').then(module => ({ default: module.VideoPlayerPanel })));
const ReaderPanel = lazy(() => import('./panels/ReaderPanel').then(module => ({ default: module.ReaderPanel })));
const NovelReaderPanel = lazy(() => import('./panels/NovelReaderPanel').then(module => ({ default: module.NovelReaderPanel })));
const AppSettingsPanel = lazy(() => import('./panels/AppSettingsPanel').then(module => ({ default: module.AppSettingsPanel })));
const MobileAppSettingsPanel = lazy(() => import('./panels/MobileAppSettingsPanel').then(module => ({ default: module.MobileAppSettingsPanel })));
const ExtensionsPanel = lazy(() => import('./panels/ExtensionsPanel').then(module => ({ default: module.ExtensionsPanel })));
const AboutPanel = lazy(() => import('./panels/AboutPanel').then(module => ({ default: module.AboutPanel })));
const ChangelogPanel = lazy(() => import('./panels/ChangelogPanel').then(module => ({ default: module.ChangelogPanel })));

export type SettingsGroup = 'User' | 'App' | 'Info';

export interface SettingsCategory {
  id: SettingsCategoryId;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  group: SettingsGroup;
  /** Desktop-only categories are hidden on web / mobile. */
  requiresNative?: boolean;
  /** Mobile-only (Capacitor) categories are hidden on web / desktop. */
  requiresMobile?: boolean;
  /** Extra search terms so the modal filter surfaces a category by the settings it holds, not just its label. */
  keywords?: string[];
  /** Panels accept an optional `section` prop for deep-link scrolling. */
  Component: ComponentType<{ section?: string }>;
}

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  { id: 'account', get label() { return uiI18n.t('app.account_85dfa32c'); }, get description() { return uiI18n.t('app.identity_email_password_and_sessions_84bcccd6'); }, icon: User, group: 'User', keywords: ['username', 'display name', 'email', 'password', 'change password', 'sessions', 'sign out', 'log out', 'logout', 'avatar', 'banner', 'profile picture', 'delete account'], Component: AccountPanel },
  { id: 'profile-store', label: 'Profile Store', description: 'Themes, widgets, wallpapers, notes, presets, and cosmetics', icon: Palette, group: 'User', keywords: ['profile', 'store', 'themes', 'sekaipop', 'customization', 'wallpaper', 'sticky notes', 'widgets', 'presets', 'cosmetics'], Component: ProfileStorePanel },
  { id: 'saved', get label() { return uiI18n.t('app.saved_content_637c6180'); }, get description() { return uiI18n.t('app.bookmarks_tier_lists_playlists_and_uploaded_medi_5e7a37aa'); }, icon: Bookmark, group: 'User', keywords: ['bookmarks', 'tier lists', 'tierlist', 'playlists', 'uploads', 'uploaded media', 'favorites', 'watchlist', 'library', 'collections'], Component: SavedContentPanel },
  { id: 'privacy', get label() { return uiI18n.t('app.privacy_cf01481f'); }, get description() { return uiI18n.t('app.mature_content_profile_visibility_and_history_f98377cf'); }, icon: Shield, group: 'User', keywords: ['mature content', 'nsfw', 'adult', '18+', 'explicit', 'profile visibility', 'public profile', 'private', 'watch history', 'clear history', 'reading history', 'blur'], Component: PrivacyPanel },
  { id: 'integrations', get label() { return uiI18n.t('app.integrations_a7881cac'); }, get description() { return uiI18n.t('app.myanimelist_and_anilist_sync_f7eb7895'); }, icon: Plug, group: 'User', keywords: ['myanimelist', 'mal', 'anilist', 'sync', 'tracking', 'tracker', 'import list', 'export list', 'connect account'], Component: IntegrationsPanel },
  { id: 'appearance', get label() { return uiI18n.t('app.appearance_41def7a0'); }, get description() { return uiI18n.t('app.theme_and_visual_style_15db4cd5'); }, icon: Palette, group: 'App', keywords: ['theme', 'dark mode', 'light mode', 'colors', 'accent color', 'visual style', 'cards', 'poster', 'overlay', 'mobile appearance', 'wallpaper', 'background', 'window'], Component: AppearancePanel },
  { id: 'display', get label() { return uiI18n.t('app.display_574ff9b0'); }, get description() { return uiI18n.t('app.languages_motion_and_contrast_421de9db'); }, icon: Monitor, group: 'App', keywords: ['language', 'app language', 'interface language', 'idioma', 'subtitle language', 'audio language', 'reduce motion', 'high contrast', 'accessibility', 'ultra-lite', 'ultra lite', 'performance', 'feature flags', 'admin'], Component: DisplayPanel },
  { id: 'translation', get label() { return uiI18n.t('translation.settingsTitle'); }, get description() { return uiI18n.t('translation.settingsDescription'); }, icon: Languages, group: 'App', keywords: ['translation', 'translate', 'translator', 'google translate', 'deepl', 'deeplx', 'azure', 'openai', 'llm', 'provider', 'engine', 'subtitle translation', 'subtitles translate', 'comment translation', 'translated comments', 'novel translation', 'community translation', 'mobile translation', 'traducir', 'traducción', 'idioma'], Component: TranslationPanel },
  { id: 'player', get label() { return uiI18n.t('app.video_player_9def7c8c'); }, get description() { return uiI18n.t('app.playback_and_player_behavior_8db84524'); }, icon: PlayCircle, group: 'App', keywords: ['playback', 'autoplay', 'auto play', 'skip intro', 'skip outro', 'quality', 'subtitles', 'captions', 'external player', 'mpv', 'vlc', 'volume', 'speed'], Component: VideoPlayerPanel },
  { id: 'reader', get label() { return uiI18n.t('app.reader_ac5bbe82'); }, get description() { return uiI18n.t('app.manga_reading_layout_and_keybinds_ab64df2a'); }, icon: BookOpen, group: 'App', keywords: ['manga', 'reader', 'reading', 'reading direction', 'webtoon', 'vertical', 'paged', 'page fit', 'width', 'gap', 'background', 'preload', 'preloading', 'infinite scroll', 'auto scroll', 'keybinds', 'keyboard shortcuts', 'comments', 'zoom'], Component: ReaderPanel },
  { id: 'novel-reader', get label() { return uiI18n.t('app.novel_reader_ee9d95ed'); }, get description() { return uiI18n.t('app.light_novel_typography_narration_and_flow_09d7809e'); }, icon: ScrollText, group: 'App', keywords: ['novel', 'light novel', 'webnovel', 'typography', 'font', 'dyslexic', 'lora', 'georgia', 'text size', 'line spacing', 'paragraph spacing', 'text width', 'background', 'text colour', 'text to speech', 'tts', 'narrator', 'kitten', 'read aloud', 'continuous scroll', 'progress bar', 'percent read', 'chapter number', 'fullscreen', 'paragraph comments'], Component: NovelReaderPanel },
  { id: 'app', get label() { return uiI18n.t('app.app_settings_09439e42'); }, get description() { return uiI18n.t('app.desktop_and_torrent_preferences_77552d33'); }, icon: SlidersHorizontal, group: 'App', requiresNative: true, keywords: ['desktop', 'torrent', 'webtorrent', 'download location', 'storage path', 'startup', 'launch at startup', 'updates', 'auto update', 'logs', 'diagnostics', 'discord', 'rich presence', 'rpc', 'debrid', 'real-debrid', 'realdebrid', 'torbox', 'flaresolverr', 'cloudflare', 'proxy', 'home server', 'warp', 'country policy', 'region', 'developer mode', 'danger zone', 'reset app', 'bandwidth', 'connections', 'upnp'], Component: AppSettingsPanel },
  { id: 'mobile', get label() { return uiI18n.t('app.mobile_app_settings_5bf876af'); }, get description() { return uiI18n.t('app.haptics_display_notifications_and_device_prefere_bf0b1b31'); }, icon: Smartphone, group: 'App', requiresMobile: true, keywords: ['mobile', 'haptics', 'haptic feedback', 'vibration', 'vibrate', 'reduce motion', 'keep awake', 'keep screen awake', 'screen on', 'status bar', 'orientation', 'rotate', 'landscape', 'portrait', 'keyboard', 'playback', 'autoplay', 'quality', 'debrid', 'real-debrid', 'realdebrid', 'torbox', 'country policy', 'region', 'notifications', 'download notifications', 'storage', 'clear cache', 'developer mode', 'device info', 'app version'], Component: MobileAppSettingsPanel },
  { id: 'extensions', get label() { return uiI18n.t('app.extensions_656bcfe2'); }, get description() { return uiI18n.t('app.manage_source_extensions_9470e115'); }, icon: Puzzle, group: 'App', keywords: ['extensions', 'sources', 'plugins', 'extension hub', 'sideload', 'providers', 'repositories'], Component: ExtensionsPanel },
  { id: 'about', get label() { return uiI18n.t('app.about_6b21fb79'); }, get description() { return uiI18n.t('app.version_and_legal_information_0b946fea'); }, icon: Info, group: 'Info', keywords: ['version', 'legal', 'license', 'terms', 'privacy policy', 'credits', 'build'], Component: AboutPanel },
  { id: 'changelog', get label() { return uiI18n.t('app.changelog_164b3d48'); }, get description() { return uiI18n.t('app.recent_releases_and_changes_0837004a'); }, icon: ScrollText, group: 'Info', keywords: ['changelog', 'releases', 'updates', "what's new", 'whats new', 'version history', 'patch notes'], Component: ChangelogPanel },
];

/**
 * Resolve a category's display strings through i18n, falling back to the
 * hardcoded English label/description when a catalog entry is missing.
 */
export function getCategoryDisplay(
  t: (key: string) => string,
  category: SettingsCategory,
): { label: string; description: string } {
  const labelKey = `settings.categories.${category.id}.label`;
  const descKey = `settings.categories.${category.id}.description`;
  const label = t(labelKey);
  const description = t(descKey);
  return {
    label: label === labelKey ? category.label : label,
    description: description === descKey ? category.description : description,
  };
}

export const SETTINGS_GROUP_ORDER: SettingsGroup[] = ['User', 'App', 'Info'];

export function getSettingsCategory(id: SettingsCategoryId): SettingsCategory {
  return SETTINGS_CATEGORIES.find((c) => c.id === id) ?? SETTINGS_CATEGORIES[0];
}
