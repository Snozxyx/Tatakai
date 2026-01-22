import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface AdminMessage {
  id: string;
  title: string;
  content: string;
  message_type: 'broadcast' | 'individual';
  recipient_id: string | null;
  sender_id: string;
  is_read: boolean;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  created_at: string;
  read_at: string | null;
}

interface MaintenanceMode {
  id: string;
  is_active: boolean;
  message: string;
  enabled_at: string | null;
  enabled_by: string | null;
  updated_at: string;
}

export function useAdminMessages() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch unread messages for the current user
  const { data: messages, isLoading } = useQuery({
    queryKey: ['admin_messages', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      try {
        // Using type assertion since the table may not be in generated types yet
        const { data, error } = await (supabase
          .from('admin_messages' as any)
          .select('*')
          .or(`message_type.eq.broadcast,recipient_id.eq.${user.id}`)
          .order('created_at', { ascending: false }) as any);
        
        // Handle case where table doesn't exist or access is denied
        if (error) {
          // 42P01 = table doesn't exist, PGRST = PostgREST errors
          if (error.code === '42P01' || error.code === 'PGRST204' || error.message?.includes('permission denied')) {
            console.warn('admin_messages table not available:', error.message);
            return [];
          }
          throw error;
        }
        return (data || []) as AdminMessage[];
      } catch (e) {
        console.warn('Failed to fetch admin messages:', e);
        return [];
      }
    },
    enabled: !!user,
    refetchInterval: 60000, // Refetch every minute
    retry: false, // Don't retry if table doesn't exist
  });

  // Get unread count
  const unreadCount = messages?.filter(m => !m.is_read).length || 0;

  // Mark message as read
  const markAsRead = useMutation({
    mutationFn: async (messageId: string) => {
      const { error } = await (supabase
        .from('admin_messages' as any)
        .update({ 
          is_read: true, 
          read_at: new Date().toISOString() 
        })
        .eq('id', messageId) as any);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_messages', user?.id] });
    },
  });

  // Mark all as read
  const markAllAsRead = useMutation({
    mutationFn: async () => {
      if (!user) return;
      
      const unreadIds = messages?.filter(m => !m.is_read).map(m => m.id) || [];
      
      if (unreadIds.length === 0) return;
      
      const { error } = await (supabase
        .from('admin_messages' as any)
        .update({ 
          is_read: true, 
          read_at: new Date().toISOString() 
        })
        .in('id', unreadIds) as any);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_messages', user?.id] });
    },
  });

  return {
    messages: messages || [],
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
  };
}

export function useMaintenanceMode() {
  const { data: maintenanceMode, isLoading } = useQuery({
    queryKey: ['maintenance_mode_status'],
    queryFn: async () => {
      try {
        // Using type assertion since the table may not be in generated types yet
        const { data, error } = await (supabase
          .from('maintenance_mode' as any)
          .select('*')
          .single() as any);
        
        // Handle case where table doesn't exist
        if (error) {
          if (error.code === '42P01' || error.code === 'PGRST116' || error.message?.includes('permission denied')) {
            return null;
          }
          throw error;
        }
        return data as MaintenanceMode | null;
      } catch (e) {
        console.warn('Failed to fetch maintenance mode:', e);
        return null;
      }
    },
    refetchInterval: 30000, // Check every 30 seconds
    retry: false,
  });

  return {
    isMaintenanceMode: maintenanceMode?.is_active || false,
    maintenanceMessage: maintenanceMode?.message || '',
    isLoading,
  };
}
