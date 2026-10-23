import uiI18n from '@/lib/uiI18n';
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
  Database,
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
    get label() { return uiI18n.t('app.insight_1ed1264f'); },
    items: [
      { value: 'analytics', get label() { return uiI18n.t('app.analytics_25bc9629'); }, icon: BarChart3, roles: STAFF, keywords: 'dashboard traffic' },
      { value: 'userstats', get label() { return uiI18n.t('app.user_stats_9badffb5'); }, icon: Activity, roles: STAFF, keywords: 'growth retention' },
      { value: 'streaming', get label() { return uiI18n.t('app.streaming_1e832552'); }, icon: MonitorPlay, roles: ADMIN, keywords: 'playback sources' },
      { value: 'performance', get label() { return uiI18n.t('app.performance_63c90455'); }, icon: Gauge, roles: ADMIN, keywords: 'speed vitals' },
    ],
  },
  {
    id: 'queues',
    get label() { return uiI18n.t('app.queues_83dbc320'); },
    items: [
      { value: 'reports', get label() { return uiI18n.t('app.user_reports_08936e1a'); }, icon: ShieldAlert, roles: STAFF, badge: 'reports', keywords: 'flags abuse' },
      { value: 'suggestions', get label() { return uiI18n.t('app.suggestions_861edba0'); }, icon: Lightbulb, roles: STAFF, badge: 'suggestions', keywords: 'requests ideas' },
      { value: 'pending', get label() { return uiI18n.t('app.forum_moderation_9bc31494'); }, icon: MessageSquare, roles: STAFF, badge: 'posts', keywords: 'threads approval' },
    ],
  },
  {
    id: 'moderation',
    get label() { return uiI18n.t('app.moderation_28f3ebe2'); },
    items: [
      { value: 'comments', get label() { return uiI18n.t('app.comments_fce06e20'); }, icon: MessagesSquare, roles: STAFF, keywords: 'replies' },
      { value: 'content', get label() { return uiI18n.t('app.content_4f9be057'); }, icon: Layers, roles: STAFF, keywords: 'takedown media' },
      { value: 'ban-management', get label() { return uiI18n.t('app.ban_management_e76a0222'); }, icon: Ban, roles: ADMIN, keywords: 'device ip templates' },
      { value: 'ban-audit', get label() { return uiI18n.t('app.ban_audit_log_ca860feb'); }, icon: ScrollText, roles: STAFF, keywords: 'history' },
      { value: 'moderation', get label() { return uiI18n.t('app.staff_activity_01ce47ad'); }, icon: History, roles: STAFF, keywords: 'audit' },
      { value: 'logs', get label() { return uiI18n.t('app.staff_logs_06b56421'); }, icon: FileText, roles: STAFF, keywords: 'audit trail' },
    ],
  },
  {
    id: 'community',
    get label() { return uiI18n.t('app.community_bfd58ee3'); },
    items: [
      { value: 'users', get label() { return uiI18n.t('app.users_57f2b181'); }, icon: Users, roles: STAFF, keywords: 'accounts profiles bans' },
      { value: 'watchrooms', get label() { return uiI18n.t('app.watch_rooms_5dbc3cdb'); }, icon: Radio, roles: STAFF, keywords: 'party sync' },
      { value: 'achievements', get label() { return uiI18n.t('app.achievements_a6634f24'); }, icon: Trophy, roles: STAFF, keywords: 'badges' },
      { value: 'badges', get label() { return uiI18n.t('app.badges_2c578dc8'); }, icon: Award, roles: STAFF, keywords: 'badge role collectible rarity' },
      { value: 'notifications', get label() { return uiI18n.t('app.notifications_753a22b2'); }, icon: BellRing, roles: ADMIN, keywords: 'broadcast announcements' },
      { value: 'news', get label() { return uiI18n.t('app.news_34c808d0'); }, icon: Newspaper, roles: ADMIN, keywords: 'announcements press headlines publish' },
    ],
  },
  {
    id: 'catalogue',
    get label() { return uiI18n.t('app.catalogue_5a241023'); },
    items: [
      { value: 'catalog', label: 'Catalog entries', icon: Database, roles: ADMIN, keywords: 'anime manga novels content database supabase' },
      { value: 'popups', get label() { return uiI18n.t('app.popups_ads_6a58f867'); }, icon: Megaphone, roles: ADMIN, keywords: 'banners' },
    ],
  },
  {
    id: 'system',
    get label() { return uiI18n.t('app.system_bc0792d8'); },
    items: [
      { value: 'settings', get label() { return uiI18n.t('app.system_bc0792d8'); }, icon: Settings, roles: ADMIN, keywords: 'maintenance releases redirects' },
      { value: 'incidents', get label() { return uiI18n.t('app.incidents_5e326b17'); }, icon: AlertCircle, roles: ADMIN, keywords: 'status outage' },
      { value: 'changelog', get label() { return uiI18n.t('app.changelog_164b3d48'); }, icon: Rocket, roles: ADMIN, keywords: 'release notes' },
      { value: 'api-admin', get label() { return uiI18n.t('app.api_admin_8494de02'); }, icon: Webhook, roles: ADMIN, keywords: 'keys tokens' },
      { value: 'updates', get label() { return uiI18n.t('app.updates_c76d1807'); }, icon: DownloadCloud, roles: ADMIN, keywords: 'version electron' },
      { value: 'crashes', get label() { return uiI18n.t('app.crash_reports_b31c7ef2'); }, icon: Bug, roles: ADMIN, keywords: 'errors', desktopOnly: true },
      { value: 'desktop-logs', get label() { return uiI18n.t('app.desktop_logs_af241809'); }, icon: Terminal, roles: STAFF, keywords: 'electron', desktopOnly: true },
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
