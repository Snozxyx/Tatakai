import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, X, AlertTriangle, Info, Shield, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';

interface AdminNotification {
  id: string;
  title: string;
  message: string;
  type: 'system' | 'warning' | 'error' | 'info';
  priority: number;
  is_read: boolean;
  created_at: string;
  updated_at: string;
  admin_id: string;
}

export function NotificationPopup() {
  const queryClient = useQueryClient();
  const [showPanel, setShowPanel] = useState(false);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Fetch notifications
  const { data: adminNotifications, isLoading } = useQuery<AdminNotification[]>({
    queryKey: ['admin_notifications_popup'],
    queryFn: async () => {
      const { data: currentUser } = await supabase.auth.getUser();
      if (!currentUser.user) return [];

      const { data, error } = await supabase
        .from('admin_notifications')
        .select('*')
        .eq('admin_id', currentUser.user.id)
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return data || [];
    },
  });

  // Mark notification as read
  const markAsRead = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('admin_notifications')
        .update({ is_read: true, updated_at: new Date().toISOString() })
        .eq('id', notificationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_notifications_popup'] });
    },
  });

  // Mark all as read
  const markAllAsRead = useMutation({
    mutationFn: async () => {
      const { data: currentUser } = await supabase.auth.getUser();
      if (!currentUser.user) throw new Error('User not authenticated');

      const { error } = await supabase
        .from('admin_notifications')
        .update({ is_read: true, updated_at: new Date().toISOString() })
        .eq('admin_id', currentUser.user.id)
        .eq('is_read', false);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_notifications_popup'] });
    },
  });

  // Update local state when data changes
  useEffect(() => {
    if (adminNotifications) {
      setNotifications(adminNotifications);
      setUnreadCount(adminNotifications.length);
    }
  }, [adminNotifications]);

  const getIconForType = (type: string) => {
    switch (type) {
      case 'system': return <Shield className="w-5 h-5" />;
      case 'warning': return <AlertTriangle className="w-5 h-5" />;
      case 'error': return <AlertCircle className="w-5 h-5" />;
      case 'info': return <Info className="w-5 h-5" />;
      default: return <Bell className="w-5 h-5" />;
    }
  };

  const getColorForType = (type: string) => {
    switch (type) {
      case 'system': return 'bg-primary';
      case 'warning': return 'bg-yellow-500';
      case 'error': return 'bg-destructive';
      case 'info': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Auto-dismiss notifications after 5 seconds
  useEffect(() => {
    if (notifications.length > 0 && showPanel) {
      const timer = setTimeout(() => {
        setShowPanel(false);
      }, 30000); // 30 seconds for panel
      return () => clearTimeout(timer);
    }
  }, [notifications.length, showPanel]);

  return (
    <div className="fixed top-6 right-6 z-50">
      {/* Notification bell button */}
      <Button
        variant="outline"
        size="icon"
        onClick={() => setShowPanel(!showPanel)}
        className="relative w-12 h-12 rounded-full bg-background/80 backdrop-blur-md border-white/20 hover:bg-background"
      >
        <Bell className="w-5 h-5 text-primary" />
        {unreadCount > 0 && (
          <Badge className="absolute -top-1 -right-1 px-2 py-0.5 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary">
            {unreadCount}
          </Badge>
        )}
      </Button>

      {/* Notification panel */}
      <AnimatePresence>
        {showPanel && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="absolute right-0 mt-2 w-80 origin-top-right rounded-xl border border-border/30 bg-background/95 backdrop-blur-xl shadow-2xl p-4"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Bell className="w-4 h-4" />
                Notifications
              </h3>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => markAllAsRead.mutate()}
                  disabled={unreadCount === 0}
                  className="text-xs gap-1"
                >
                  <Check className="w-3 h-3" />
                  Mark all read
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPanel(false)}
                  className="w-6 h-6 p-0"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {isLoading ? (
              <div className="text-center py-4 text-muted-foreground text-sm">
                Loading notifications...
              </div>
            ) : notifications.length > 0 ? (
              <div className="max-h-96 overflow-y-auto space-y-3 pr-2">
                {notifications.map((notification) => (
                  <motion.div
                    key={notification.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ type: 'spring', damping: 20, stiffness: 200 }}
                    className={`p-3 rounded-lg border-l-4 ${getColorForType(notification.type)} bg-muted/30 hover:bg-muted/50 transition-colors`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${getColorForType(notification.type)}/20`}>
                        {getIconForType(notification.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="font-medium text-sm">{notification.title}</h4>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDate(notification.created_at)}
                          </span>
                        </div>
                        <p className="text-sm text-foreground/80 mb-2 line-clamp-2">
                          {notification.message}
                        </p>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className={`text-xs ${getColorForType(notification.type)}/20 ${getColorForType(notification.type).replace('bg-', 'text-')}`}> 
                            Priority {notification.priority}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => markAsRead.mutate(notification.id)}
                            className="text-xs gap-1 h-6 px-2"
                          >
                            <Check className="w-3 h-3" />
                            Mark read
                          </Button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-muted-foreground text-sm">
                No unread notifications
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}