import type { ComponentType, LazyExoticComponent, ReactNode } from 'react';
import type { StaffRoleSource } from '@/lib/roles';
import type { ThemePreferences } from '@/lib/profileThemes';

export interface ThemeMediaItem { id: string; title: string; image: string; href: string; detail?: string; status?: string }
export interface ProfileThemeData {
  owner: StaffRoleSource & { user_id: string; username?: string | null; display_name?: string | null; avatar_url?: string | null; banner_url?: string | null; bio?: string | null };
  isOwner: boolean; canViewLibrary: boolean; canViewHistory: boolean; canViewCalendar: boolean;
  badges: { key: string; label: string; image: string }[];
  library: ThemeMediaItem[]; activity: ThemeMediaItem[]; favorites: ThemeMediaItem[];
  links: { label: string; url: string }[];
  stats: { anime: number; manga: number; episodes: number; hours: number; completed: number; streak: number; longestStreak: number };
  following: boolean; followPending: boolean; followers: number; onFollow: () => void;
  loading: boolean; error: boolean;
  tabs?: { id: string; label: string; summary: string }[];
  sections?: { watchlist: ThemeMediaItem[]; manga: ThemeMediaItem[]; novels: ThemeMediaItem[]; readingHistory: ThemeMediaItem[] };
  achievements?: { id: string; title: string; description: string; unlocked: boolean; progress?: number; total?: number }[];
}
export interface ThemeRendererProps { data: ProfileThemeData; configuration: unknown; preferences: ThemePreferences; onBack: () => void }
export interface ThemeLoadingProps { configuration: unknown; owner?: { username?: string | null; display_name?: string | null; avatar_url?: string | null } | null }
export interface ThemePreviewProps {
  userId?: string; configuration: unknown; name: string; username?: string | null; avatar?: string; banner?: string; bio?: string | null;
  badges: { key: string; label: string; image: string }[];
  followers?: number; following?: number; episodes?: number; watchTimeSeconds?: number;
  privateProfile: boolean; canViewHistory: boolean; canFollow: boolean; isFollowing: boolean; followPending: boolean;
  onFollow: () => void; onOpen: () => void; onClose: () => void; moderation?: ReactNode;
}
export interface ThemeEditorProps {
  configuration: unknown; preferences: ThemePreferences;
  onChange: (configuration: unknown) => void; onPresets: (presets: ThemePreferences['presets']) => void;
  selectedWidgetId?: string;
  initialSection?: string;
}
export interface ProfileThemeDefinition {
  accessBadges?: readonly string[];
  id: string; label: string; description: string; version: number;
  entitled: (owner: StaffRoleSource | null | undefined, badges: readonly { key: string }[]) => boolean;
  defaults: () => unknown; parse: (value: unknown) => unknown | null;
  Renderer?: LazyExoticComponent<ComponentType<ThemeRendererProps>>;
  Editor?: LazyExoticComponent<ComponentType<ThemeEditorProps>>;
  Loading?: ComponentType<ThemeLoadingProps>;
  Preview?: LazyExoticComponent<ComponentType<ThemePreviewProps>>;
  arrivalMs?: number;
  preload?: () => Promise<unknown>;
}
