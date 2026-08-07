import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface AdminLog {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: any;
  ip_address: string | null;
  created_at: string;
  profiles?: {
    username: string;
    display_name: string;
    avatar_url: string;
  } | null;
}

// Fetch admin logs
export function useAdminLogs(limit = 100, filters?: { action?: string; entityType?: string }) {
  const { user, isAdmin } = useAuth();

  return useQuery<AdminLog[]>({
    queryKey: ['admin_logs', limit, filters],
    queryFn: async () => {
      let query = supabase
        .from('admin_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (filters?.action) query = query.eq('action', filters.action);
      if (filters?.entityType) query = query.eq('entity_type', filters.entityType);

      const { data, error } = await query;

      if (error) {
        // Use central logger so production behavior is consistent
        const { logger } = await import('@/lib/logger');
        void logger.error('[AdminLogs] Error:', error);
        return [];
      }

      const logs = data ?? [];

      if (!logs || logs.length === 0) {
        const { logger } = await import('@/lib/logger');
        void logger.info('[AdminLogs] No logs found');
        return [];
      }

      // Then fetch profiles separately
      const userIds = [...new Set(logs.map(l => l.user_id).filter(Boolean))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url')
        .in('user_id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      const result = logs.map(log => ({
        ...log,
        profiles: profileMap.get(log.user_id) || null,
      })) as AdminLog[];

      const { logger: _logger } = await import('@/lib/logger');
      void _logger.info('[AdminLogs] Found:', result.length, 'logs');
      return result;
    },
    enabled: !!user,
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 60,
  });
}

// Create admin log
export function useCreateAdminLog() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      action,
      entityType,
      entityId,
      details,
    }: {
      action: string;
      entityType: string;
      entityId?: string | null;
      details?: any;
    }) => {
      if (!user) throw new Error('Must be logged in');

      const { data, error } = await supabase
        .from('admin_logs')
        .insert({
          user_id: user.id,
          action,
          entity_type: entityType,
          entity_id: entityId || null,
          details: details || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_logs'] });
    },
  });
}

// Helper function to log admin actions
export async function logAdminAction(
  userId: string,
  action: string,
  entityType: string,
  entityId?: string,
  details?: any
) {
  try {
    await supabase.from('admin_logs').insert({
      user_id: userId,
      action,
      entity_type: entityType,
      entity_id: entityId || null,
      details: details || null,
    });
  } catch (error) {
    const { logger } = await import('@/lib/logger');
    void logger.error('Failed to log admin action:', error);
  }
}

// Delete admin logs by filter or explicit list of ids
export function useDeleteAdminLogs() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (opts: {
      ids?: string[];
      action?: string;
      entity_type?: string;
      created_before?: string;
      created_after?: string;
    }) => {
      if (!user) throw new Error('Must be logged in');

      const { ids, action, entity_type, created_before, created_after } = opts;

      let query: any = supabase.from('admin_logs').delete();

      if (ids && ids.length > 0) {
        query = query.in('id', ids);
      } else {
        if (action) query = query.eq('action', action);
        if (entity_type) query = query.eq('entity_type', entity_type);
        if (created_before) query = query.lt('created_at', created_before);
        if (created_after) query = query.gt('created_at', created_after);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_logs'] });
    },
  });
}
