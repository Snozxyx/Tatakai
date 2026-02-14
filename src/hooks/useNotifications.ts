import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

export interface Notification {
    id: string;
    user_id: string;
    title: string;
    body: string;
    data: any;
    read: boolean;
    created_at: string;
}

// Helper to show native notification on mobile
async function showNativeNotification(notification: Notification) {
    if (!Capacitor.isNativePlatform()) return;
    
    try {
        const { display } = await LocalNotifications.checkPermissions();
        if (display !== 'granted') {
            await LocalNotifications.requestPermissions();
        }
        
        await LocalNotifications.schedule({
            notifications: [{
                title: notification.title,
                body: notification.body,
                id: Math.abs(notification.id.hashCode?.() || Date.now()) % 2147483647,
                smallIcon: 'ic_stat_notification',
                largeIcon: 'ic_launcher',
                sound: 'default',
            }]
        });
    } catch (error) {
        console.warn('Failed to show native notification:', error);
    }
}

// Simple hash function for string IDs
declare global {
    interface String {
        hashCode(): number;
    }
}
String.prototype.hashCode = function() {
    let hash = 0;
    for (let i = 0; i < this.length; i++) {
        const char = this.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash;
};

export function useNotifications() {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    // Real-time subscription for notifications
    useEffect(() => {
        if (!user) return;

        const channel = supabase
            .channel(`notifications-${user.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'notifications',
                filter: `user_id=eq.${user.id}`
            }, (payload) => {
                queryClient.invalidateQueries({ queryKey: ['notifications', user.id] });
                
                // Show native notification on mobile
                if (payload.new) {
                    showNativeNotification(payload.new as Notification);
                }
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'notifications',
                filter: `user_id=eq.${user.id}`
            }, () => {
                queryClient.invalidateQueries({ queryKey: ['notifications', user.id] });
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user, queryClient]);

    const query = useQuery<Notification[]>({
        queryKey: ['notifications', user?.id],
        queryFn: async () => {
            if (!user) return [];
            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data as Notification[];
        },
        enabled: !!user,
    });

    const markAsRead = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from('notifications')
                .update({ read: true })
                .eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
        },
    });

    const markAllAsRead = useMutation({
        mutationFn: async () => {
            if (!user) return;
            const { error } = await supabase
                .from('notifications')
                .update({ read: true })
                .eq('user_id', user.id)
                .eq('read', false);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
        },
    });

    const deleteNotification = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from('notifications')
                .delete()
                .eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
            toast.success('Notification deleted');
        },
    });

    return {
        ...query,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        unreadCount: query.data?.filter(n => !n.read).length || 0,
    };
}
