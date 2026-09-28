import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { resolveBadges, type BadgeDef } from '@/lib/badges';
import { deriveIsAdmin, deriveIsModerator } from '@/lib/roles';

interface BadgeRow {
  user_id: string;
  badge_key: string;
}

interface RoleRow {
  user_id: string;
  is_admin: boolean | null;
  is_moderator: boolean | null;
  role: string | null;
}

/**
 * Badges for a single user (stored grants + derived admin/mod).
 * Pass the user's auth id (= profiles.user_id).
 */
export function useUserBadges(userId?: string) {
  return useQuery<BadgeDef[]>({
    queryKey: ['user_badges', userId],
    enabled: !!userId,
    queryFn: async () => {
      const [{ data: badgeRows }, { data: profileRow }] = await Promise.all([
        supabase.from('user_badges' as any).select('badge_key').eq('user_id', userId!),
        supabase.from('profiles').select('is_admin, is_moderator, role').eq('user_id', userId!).maybeSingle(),
      ]);

      const storedKeys = ((badgeRows ?? []) as { badge_key: string }[]).map((r) => r.badge_key);
      return resolveBadges(storedKeys, {
        isAdmin: deriveIsAdmin(profileRow as any),
        isModerator: deriveIsModerator(profileRow as any),
      });
    },
  });
}

/**
 * Batch badge lookup for a list of users (e.g. a comment thread). Returns a map
 * of auth-user-id → resolved badges. One query per table instead of N.
 */
export function useBatchUserBadges(userIds: string[]) {
  const ids = [...new Set(userIds.filter(Boolean))].sort();
  const key = ids.join(',');

  return useQuery<Record<string, BadgeDef[]>>({
    queryKey: ['user_badges_batch', key],
    enabled: ids.length > 0,
    queryFn: async () => {
      const [{ data: badgeRows }, { data: profileRows }] = await Promise.all([
        supabase.from('user_badges' as any).select('user_id, badge_key').in('user_id', ids),
        supabase.from('profiles').select('user_id, is_admin, is_moderator, role').in('user_id', ids),
      ]);

      const keysByUser = new Map<string, string[]>();
      ((badgeRows ?? []) as BadgeRow[]).forEach((r) => {
        const list = keysByUser.get(r.user_id) ?? [];
        list.push(r.badge_key);
        keysByUser.set(r.user_id, list);
      });

      const roleByUser = new Map<string, RoleRow>();
      ((profileRows ?? []) as RoleRow[]).forEach((r) => roleByUser.set(r.user_id, r));

      const out: Record<string, BadgeDef[]> = {};
      for (const id of ids) {
        const role = roleByUser.get(id);
        out[id] = resolveBadges(keysByUser.get(id) ?? [], {
          isAdmin: deriveIsAdmin(role as any),
          isModerator: deriveIsModerator(role as any),
        });
      }
      return out;
    },
  });
}
