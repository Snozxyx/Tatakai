/**
 * The admin dashboard's navigation model (docs/Plans.md §2 — "Admin Dashboard").
 *
 * The nav used to be a flat 26-entry array inside `AdminPage`, rendered twice:
 * once in a mobile sheet without badge counts, once in a desktop rail with them.
 * Two hand-maintained copies of one list is how `custom-sources` and
 * `notifications` ended up with panels that nothing in the UI could open, so the
 * list lives here now and `AdminNav` renders it for both breakpoints.
 *
 * Sections are grouped because thirty near-identical rows in one column is a
 * list you scan rather than read, and every icon is distinct for the same
 * reason — the old array reused `Star` for both Achievements and Extensions and
 * `History` three times over.
 *
 * Named `adminSections` rather than `adminNav` because a module whose path
 * differs from `AdminNav.tsx` only in casing resolves to whichever of the two a
 * case-insensitive filesystem finds first — `@/components/admin/AdminNav` picked
 * up this file's exports and the component's import failed to compile.
 */
import {
  Activity,
  AlertCircle,
  Award,
  Ban,
  BarChart3,
  BellRing,
  Bug,
  DownloadCloud,
  FileText,
  Gauge,
  History,
  Layers,
  Lightbulb,
  Megaphone,
  MessageSquare,
  MessagesSquare,
  MonitorPlay,
  Newspaper,
  Radio,
  Rocket,
  ScrollText,
  Settings,
  ShieldAlert,
  Terminal,
  Trophy,
  Users,
  Webhook,
  type LucideIcon,
} from 'lucide-react';

/** The two staff roles the dashboard distinguishes. */
export type AdminRole = 'admin' | 'moderator';

/** Keys of the dashboard's live counter query, for the rail's badges. */
export type AdminBadgeKey = 'reports' | 'suggestions' | 'posts';

export interface AdminNavItem {
  /** Matches the `TabsContent value` this row opens, and the `?section=` slug. */
  value: string;
  label: string;
  icon: LucideIcon;
  roles: readonly AdminRole[];
  /** Live pending count to show, for the sections that are work queues. */
  badge?: AdminBadgeKey;
  /** Extra search terms, so "marketplace" finds Submissions. */
  keywords?: string;
  /** Electron-only sections — they have nothing to report in a browser. */
  desktopOnly?: boolean;
}

export interface AdminNavGroup {
  id: string;
  label: string;
  items: AdminNavItem[];
}

const ADMIN: readonly AdminRole[] = ['admin'];
const STAFF: readonly AdminRole[] = ['admin', 'moderator'];

/**
 * Every section, in rail order. The `value`s have to stay in step with the
 * `TabsContent` blocks in `AdminPage`: a value with no panel opens an empty
 * pane, and a panel with no value here cannot be reached at all.
 */
const NAV: readonly AdminNavGroup[] = [
  {
    id: 'insight',
    label: 'Insight',
    items: [
      { value: 'analytics', label: 'Analytics', icon: BarChart3, roles: STAFF, keywords: 'dashboard traffic' },
      { value: 'userstats', label: 'User Stats', icon: Activity, roles: STAFF, keywords: 'growth retention' },
      { value: 'streaming', label: 'Streaming', icon: MonitorPlay, roles: ADMIN, keywords: 'playback sources' },
      { value: 'performance', label: 'Performance', icon: Gauge, roles: ADMIN, keywords: 'speed vitals' },
    ],
  },
  {
    id: 'queues',
    label: 'Queues',
    items: [
      { value: 'reports', label: 'User Reports', icon: ShieldAlert, roles: STAFF, badge: 'reports', keywords: 'flags abuse' },
      { value: 'suggestions', label: 'Suggestions', icon: Lightbulb, roles: STAFF, badge: 'suggestions', keywords: 'requests ideas' },
      { value: 'pending', label: 'Forum Moderation', icon: MessageSquare, roles: STAFF, badge: 'posts', keywords: 'threads approval' },
    ],
  },
  {
    id: 'moderation',
    label: 'Moderation',
    items: [
      { value: 'comments', label: 'Comments', icon: MessagesSquare, roles: STAFF, keywords: 'replies' },
      { value: 'content', label: 'Content', icon: Layers, roles: STAFF, keywords: 'takedown media' },
      { value: 'ban-management', label: 'Ban Management', icon: Ban, roles: ADMIN, keywords: 'device ip templates' },
      { value: 'ban-audit', label: 'Ban Audit Log', icon: ScrollText, roles: STAFF, keywords: 'history' },
      { value: 'moderation', label: 'Staff Activity', icon: History, roles: STAFF, keywords: 'audit' },
      { value: 'logs', label: 'Staff Logs', icon: FileText, roles: STAFF, keywords: 'audit trail' },
    ],
  },
  {
    id: 'community',
    label: 'Community',
    items: [
      { value: 'users', label: 'Users', icon: Users, roles: STAFF, keywords: 'accounts profiles bans' },
      { value: 'watchrooms', label: 'Watch Rooms', icon: Radio, roles: STAFF, keywords: 'party sync' },
      { value: 'achievements', label: 'Achievements', icon: Trophy, roles: STAFF, keywords: 'badges' },
      { value: 'badges', label: 'Badges', icon: Award, roles: STAFF, keywords: 'badge role collectible rarity' },
      { value: 'notifications', label: 'Notifications', icon: BellRing, roles: ADMIN, keywords: 'broadcast announcements' },
      { value: 'news', label: 'News', icon: Newspaper, roles: ADMIN, keywords: 'announcements press headlines publish' },
    ],
  },
  {
    id: 'catalogue',
    label: 'Catalogue',
    items: [
      { value: 'popups', label: 'Popups & Ads', icon: Megaphone, roles: ADMIN, keywords: 'banners' },
    ],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      { value: 'settings', label: 'System', icon: Settings, roles: ADMIN, keywords: 'maintenance releases redirects' },
      { value: 'incidents', label: 'Incidents', icon: AlertCircle, roles: ADMIN, keywords: 'status outage' },
      { value: 'changelog', label: 'Changelog', icon: Rocket, roles: ADMIN, keywords: 'release notes' },
      { value: 'api-admin', label: 'API Admin', icon: Webhook, roles: ADMIN, keywords: 'keys tokens' },
      { value: 'updates', label: 'Updates', icon: DownloadCloud, roles: ADMIN, keywords: 'version electron' },
      { value: 'crashes', label: 'Crash Reports', icon: Bug, roles: ADMIN, keywords: 'errors', desktopOnly: true },
      { value: 'desktop-logs', label: 'Desktop Logs', icon: Terminal, roles: STAFF, keywords: 'electron', desktopOnly: true },
    ],
  },
];

export interface AdminNavOptions {
  isAdmin: boolean;
  isModerator: boolean;
  /** Running inside the Electron shell. Gates the two desktop-only sections. */
  isDesktopApp: boolean;
}

/**
 * The sections this viewer may open — grouped for the rail, and flattened for
 * the page, which needs the first entry as its default and the whole set to
 * validate `?section=` against.
 */
export function buildAdminNav({ isAdmin, isModerator, isDesktopApp }: AdminNavOptions): {
  groups: AdminNavGroup[];
  items: AdminNavItem[];
} {
  const role: AdminRole | null = isAdmin ? 'admin' : isModerator ? 'moderator' : null;
  if (!role) return { groups: [], items: [] };

  const groups = NAV.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => item.roles.includes(role) && (!item.desktopOnly || isDesktopApp),
    ),
  })).filter((group) => group.items.length > 0);

  return { groups, items: groups.flatMap((group) => group.items) };
}

/** Case-insensitive match over labels and keywords; emptied groups drop out. */
export function filterAdminNav(groups: AdminNavGroup[], query: string): AdminNavGroup[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return groups;
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        `${item.label} ${item.keywords ?? ''}`.toLowerCase().includes(needle),
      ),
    }))
    .filter((group) => group.items.length > 0);
}
