import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Client bindings for the Phase-3 moderation RPCs (all written in
 * 20260924000100 / 20260925000200 / 20260925000400). The shared
 * ModerationMenu reads/writes through these so every surface behaves
 * identically. Enforcement of comments_paused / allow_repost / allow_requote
 * is app-layer: composers consult useContentFlags before allowing the action.
 */

export type ModContentType =
  | 'forum_post'
  | 'comment'
  | 'tier_list'
  | 'playlist'
  | 'anime'
  // 'user' is report/ban/view-in-admin only — it carries no content flags,
  // so never enable useContentFlags / set_content_flags for it.
  | 'user';

export interface ContentFlags {
  comments_paused: boolean;
  allow_repost: boolean;
  allow_requote: boolean;
}

const DEFAULT_FLAGS: ContentFlags = {
  comments_paused: false,
  allow_repost: true,
  allow_requote: true,
};

/** Public-read moderation flags for one piece of content. */
export function useContentFlags(
  contentType: ModContentType,
  contentId: string | null | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: ['content_flags', contentType, contentId],
    enabled: enabled && !!contentId,
    queryFn: async (): Promise<ContentFlags> => {
      const { data, error } = await supabase
        .from('content_moderation_flags' as any)
        .select('comments_paused, allow_repost, allow_requote')
        .eq('content_type', contentType)
        .eq('content_id', contentId as string)
        .maybeSingle();
      // Table may not exist yet (migration unapplied) — fail open to defaults.
      if (error) return DEFAULT_FLAGS;
      return { ...DEFAULT_FLAGS, ...(data as Partial<ContentFlags> | null) };
    },
  });
}

/** Staff (or a forum_post's own author) sets moderation flags. */
export function useSetContentFlags() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      contentType: ModContentType;
      contentId: string;
      comments_paused?: boolean;
      allow_repost?: boolean;
      allow_requote?: boolean;
    }) => {
      const { error } = await (supabase as any).rpc('set_content_flags', {
        p_content_type: args.contentType,
        p_content_id: args.contentId,
        p_comments_paused: args.comments_paused ?? null,
        p_allow_repost: args.allow_repost ?? null,
        p_allow_requote: args.allow_requote ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_r, args) => {
      queryClient.invalidateQueries({
        queryKey: ['content_flags', args.contentType, args.contentId],
      });
    },
  });
}

/** Staff-only ban. duration_hours null = permanent. */
export function useBanUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      userId: string;
      reason: string;
      durationHours: number | null;
    }) => {
      const { error } = await supabase.rpc('ban_user', {
        target_user_id: args.userId,
        reason: args.reason,
        duration_hours: args.durationHours,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_users'] });
    },
  });
}

// ---------------------------------------------------------------------------
// /admin/user/:userId  — per-user analytics profile + controls
// The :userId route param is an auth user id (= profiles.user_id).
// Reads are defensive: unapplied migrations mean some columns/tables/RPCs may
// not exist yet, so selects use '*' and fail-soft to empty/null.
// ---------------------------------------------------------------------------

export type Privilege =
  | 'can_comment'
  | 'can_post'
  | 'can_tierlist'
  | 'can_upload'
  | 'can_access_community';

export interface AdminUserProfile {
  id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  role: string | null;
  is_admin: boolean | null;
  is_moderator: boolean | null;
  is_banned: boolean | null;
  banned_at: string | null;
  ban_reason: string | null;
  created_at: string | null;
  last_login_at: string | null;
  device_name: string | null;
  country: string | null;
  total_watch_time_seconds: number | null;
  can_comment: boolean;
  can_post: boolean;
  can_tierlist: boolean;
  can_upload: boolean;
  can_access_community: boolean;
  // From 20260925000100_storage_quota (unapplied) — null/absent until then.
  storage_quota_bytes: number | null;
  storage_used_bytes: number | null;
}

export interface UserSession {
  id: string;
  ip_address: string | null;
  device_id: string | null;
  device_name: string | null;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
}

/** Full profile row for the admin user page, keyed by auth user_id. */
export function useAdminUserProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ['admin_user_profile', userId],
    enabled: !!userId,
    queryFn: async (): Promise<AdminUserProfile | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId as string)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const p = data as Record<string, any>;

      // Country fallback: profiles.country is written by nothing today, so fall
      // back to the most recent geolocated page_visit for this user (populated
      // by usePageTracking/ipapi). Fail-soft if the column/table is absent.
      let country: string | null = p.country ?? null;
      if (!country) {
        const { data: pv } = await (supabase as any)
          .from('page_visits')
          .select('country')
          .eq('user_id', userId as string)
          .not('country', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        country = pv?.country ?? null;
      }

      // Privilege columns may not exist yet (migration unapplied) → default on.
      return {
        ...(p as any),
        country,
        can_comment: p.can_comment ?? true,
        can_post: p.can_post ?? true,
        can_tierlist: p.can_tierlist ?? true,
        can_upload: p.can_upload ?? true,
        can_access_community: p.can_access_community ?? true,
      } as AdminUserProfile;
    },
  });
}

/** Active + revoked sessions for a user (staff-visible). Fail-soft to []. */
export function useUserSessions(userId: string | undefined) {
  return useQuery({
    queryKey: ['user_sessions', userId],
    enabled: !!userId,
    queryFn: async (): Promise<UserSession[]> => {
      const { data, error } = await (supabase as any)
        .from('user_sessions')
        .select('id, ip_address, device_id, device_name, user_agent, created_at, last_seen_at, revoked_at')
        .eq('user_id', userId as string)
        .order('last_seen_at', { ascending: false });
      if (error) return []; // table may not exist yet
      return (data ?? []) as UserSession[];
    },
  });
}

/** Cheap activity counts (comments / posts / recent page visits). */
export function useUserActivityCounts(userId: string | undefined) {
  return useQuery({
    queryKey: ['admin_user_activity', userId],
    enabled: !!userId,
    queryFn: async () => {
      const count = async (table: string, extra?: (q: any) => any) => {
        let q = (supabase as any).from(table).select('*', { count: 'exact', head: true }).eq('user_id', userId as string);
        if (extra) q = extra(q);
        const { count: c, error } = await q;
        return error ? 0 : c ?? 0;
      };
      const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      const [comments, posts, visits] = await Promise.all([
        count('comments'),
        count('forum_posts'),
        count('page_visits', (q: any) => q.gte('created_at', since)),
      ]);
      return { comments, posts, visits30d: visits };
    },
  });
}

/** Staff-only unban. */
export function useUnbanUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc('unban_user', { target_user_id: userId });
      if (error) throw error;
    },
    onSuccess: (_r, userId) => {
      queryClient.invalidateQueries({ queryKey: ['admin_user_profile', userId] });
      queryClient.invalidateQueries({ queryKey: ['admin_users'] });
    },
  });
}

/** Staff-only per-user privilege toggle. */
export function useSetPrivilege() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { userId: string; privilege: Privilege; enabled: boolean }) => {
      const { error } = await (supabase as any).rpc('set_user_privilege', {
        p_target_user_id: args.userId,
        p_privilege: args.privilege,
        p_enabled: args.enabled,
      });
      if (error) throw error;
    },
    onSuccess: (_r, args) => {
      queryClient.invalidateQueries({ queryKey: ['admin_user_profile', args.userId] });
    },
  });
}

/**
 * Admin override of a user's upload/storage quota (bytes). Backed by
 * admin_set_storage_quota (20260925000100, is_staff-gated at the DB layer);
 * the UI restricts the control to admins. Fails hard if the RPC/migration is
 * absent so the caller can surface a clear message.
 */
export function useSetStorageQuota() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { userId: string; bytes: number }) => {
      const { error } = await (supabase as any).rpc('admin_set_storage_quota', {
        p_target_user_id: args.userId,
        p_bytes: Math.max(0, Math.round(args.bytes)),
      });
      if (error) throw error;
    },
    onSuccess: (_r, args) => {
      queryClient.invalidateQueries({ queryKey: ['admin_user_profile', args.userId] });
    },
  });
}
export function useRevokeSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { sessionId: string; userId: string }) => {
      const { error } = await (supabase as any).rpc('revoke_user_session', { p_session_id: args.sessionId });
      if (error) throw error;
    },
    onSuccess: (_r, args) => {
      queryClient.invalidateQueries({ queryKey: ['user_sessions', args.userId] });
    },
  });
}

export function useRevokeAllSessions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await (supabase as any).rpc('revoke_all_user_sessions', { p_target_user_id: userId });
      if (error) throw error;
    },
    onSuccess: (_r, userId) => {
      queryClient.invalidateQueries({ queryKey: ['user_sessions', userId] });
    },
  });
}

// ---------------------------------------------------------------------------
// Comment pinning (20260926000000_comment_pin.sql)
// ---------------------------------------------------------------------------

/** Staff-only pin/unpin of a comment. Sorts pinned-first + shows a badge. */
export function useSetCommentPinned() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { commentId: string; pinned: boolean }) => {
      const { error } = await (supabase as any).rpc('set_comment_pinned', {
        p_comment_id: args.commentId,
        p_pinned: args.pinned,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      // Comment threads are keyed many ways; invalidate the families broadly.
      queryClient.invalidateQueries({ queryKey: ['comments'] });
      queryClient.invalidateQueries({ queryKey: ['user-comments-detailed'] });
      queryClient.invalidateQueries({ queryKey: ['recent-comments-detailed'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Whole-device / IP bans (20260926000100_ban_device_ip.sql)
// Recording only — device-ban enforcement is client-side on boot; IP-ban
// enforcement needs a server-side check (out of scope). All is_staff-gated.
// ---------------------------------------------------------------------------

/** Ban one device id (per-session button). */
export function useBanDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { deviceId: string; reason?: string; targetUserId?: string }) => {
      const { error } = await (supabase as any).rpc('admin_ban_device', {
        p_device_id: args.deviceId,
        p_reason: args.reason ?? 'Banned by staff',
        p_expires_at: null,
        p_target_user_id: args.targetUserId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_r, args) => {
      if (args.targetUserId) queryClient.invalidateQueries({ queryKey: ['user_sessions', args.targetUserId] });
    },
  });
}

/** Ban one IP (per-session button). Non-castable IPs are a server-side no-op. */
export function useBanIp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { ip: string; reason?: string; targetUserId?: string }) => {
      const { error } = await (supabase as any).rpc('admin_ban_ip', {
        p_ip: args.ip,
        p_reason: args.reason ?? 'Banned by staff',
        p_expires_at: null,
        p_target_user_id: args.targetUserId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_r, args) => {
      if (args.targetUserId) queryClient.invalidateQueries({ queryKey: ['user_sessions', args.targetUserId] });
    },
  });
}

/** Ban every device id known for a user. Returns the count acted on. */
export function useBanUserDevices() {
  return useMutation({
    mutationFn: async (args: { userId: string; reason?: string }): Promise<number> => {
      const { data, error } = await (supabase as any).rpc('admin_ban_user_devices', {
        p_target_user_id: args.userId,
        p_reason: args.reason ?? 'Banned by staff',
        p_expires_at: null,
      });
      if (error) throw error;
      return (data as number) ?? 0;
    },
  });
}

/** Ban every IP known for a user. Returns the count acted on. */
export function useBanUserIps() {
  return useMutation({
    mutationFn: async (args: { userId: string; reason?: string }): Promise<number> => {
      const { data, error } = await (supabase as any).rpc('admin_ban_user_ips', {
        p_target_user_id: args.userId,
        p_reason: args.reason ?? 'Banned by staff',
        p_expires_at: null,
      });
      if (error) throw error;
      return (data as number) ?? 0;
    },
  });
}

// ---------------------------------------------------------------------------
// Role changes from the user page (mirrors AdminPage toggleAdmin/toggleModerator
// via the set_staff_role RPC — 20260902000003).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Bulk delete of a target user's content (20260926000300_admin_delete_user_content.sql)
// is_staff-gated (admin OR moderator). Comments/forum posts are soft-deleted
// (tombstone, preserves thread structure); playlists/tier lists are hard-deleted
// with child-row cleanup. Returns per-scope counts.
// ---------------------------------------------------------------------------

export type DeleteScope = 'comments' | 'posts' | 'playlists' | 'tierlists' | 'all';

export interface DeleteUserContentResult {
  comments: number;
  posts: number;
  playlists: number;
  tierlists: number;
}

/** Staff bulk-delete of all of a user's content in one scope (or everything). */
export function useDeleteUserContent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { userId: string; scope: DeleteScope }): Promise<DeleteUserContentResult> => {
      const { data, error } = await (supabase as any).rpc('admin_delete_user_content', {
        p_target_user_id: args.userId,
        p_scope: args.scope,
      });
      if (error) throw error;
      const r = (Array.isArray(data) ? data[0] : data) ?? {};
      return {
        comments: r.comments ?? 0,
        posts: r.posts ?? 0,
        playlists: r.playlists ?? 0,
        tierlists: r.tierlists ?? 0,
      };
    },
    onSuccess: (_r, args) => {
      queryClient.invalidateQueries({ queryKey: ['admin_user_activity', args.userId] });
      queryClient.invalidateQueries({ queryKey: ['user_activity_comments', args.userId] });
      queryClient.invalidateQueries({ queryKey: ['user_activity_posts', args.userId] });
      queryClient.invalidateQueries({ queryKey: ['user_activity_tierlists', args.userId] });
      queryClient.invalidateQueries({ queryKey: ['user_activity_playlists', args.userId] });
      queryClient.invalidateQueries({ queryKey: ['admin_forum_posts'] });
      queryClient.invalidateQueries({ queryKey: ['admin_playlists'] });
      queryClient.invalidateQueries({ queryKey: ['admin_tier_lists'] });
    },
  });
}

/** Grant/revoke admin or moderator via the staff-role RPC. */
export function useSetStaffRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { userId: string; role: 'admin' | 'moderator'; enabled: boolean }) => {
      const { error } = await (supabase as any).rpc('set_staff_role', {
        target_user_id: args.userId,
        p_role: args.role,
        p_enabled: args.enabled,
      });
      if (error) throw error;
    },
    onSuccess: (_r, args) => {
      queryClient.invalidateQueries({ queryKey: ['admin_user_profile', args.userId] });
      queryClient.invalidateQueries({ queryKey: ['admin_users'] });
    },
  });
}
