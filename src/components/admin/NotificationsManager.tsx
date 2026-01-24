import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Bell, Check, Trash2, Search, Filter, X } from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';

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

export function NotificationsManager() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterReadStatus, setFilterReadStatus] = useState('all');

  // Fetch admin notifications
  const { data: notifications, isLoading, error } = useQuery<AdminNotification[]>({
    queryKey: ['admin_notifications'],
    queryFn: async () => {
      const { data: currentUser } = await supabase.auth.getUser();
      if (!currentUser.user) return [];

      const { data, error } = await supabase
        .from('admin_notifications')
        .select('*')
        .eq('admin_id', currentUser.user.id)
        .order('created_at', { ascending: false });

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
      queryClient.invalidateQueries({ queryKey: ['admin_notifications'] });
      toast.success('Notification marked as read');
    },
    onError: () => {
      toast.error('Failed to mark notification as read');
    },
  });

  // Delete notification
  const deleteNotification = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('admin_notifications')
        .delete()
        .eq('id', notificationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_notifications'] });
      toast.success('Notification deleted');
    },
    onError: () => {
      toast.error('Failed to delete notification');
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
      queryClient.invalidateQueries({ queryKey: ['admin_notifications'] });
      toast.success('All notifications marked as read');
    },
    onError: () => {
      toast.error('Failed to mark all notifications as read');
    },
  });

  // Filter notifications
  const filteredNotifications = notifications?.filter((notification: AdminNotification) => {
    const matchesSearch = notification.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         notification.message.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType = filterType === 'all' || notification.type === filterType;
    const matchesPriority = filterPriority === 'all' || notification.priority.toString() === filterPriority;
    const matchesReadStatus = filterReadStatus === 'all' || 
                            (filterReadStatus === 'read' && notification.is_read) ||
                            (filterReadStatus === 'unread' && !notification.is_read);

    return matchesSearch && matchesType && matchesPriority && matchesReadStatus;
  });

  // Count unread notifications
  const unreadCount = notifications?.filter((n: AdminNotification) => !n.is_read).length || 0;

  const getPriorityColor = (priority: number) => {
    switch (priority) {
      case 1: return 'bg-blue-500';
      case 2: return 'bg-green-500';
      case 3: return 'bg-yellow-500';
      case 4: return 'bg-orange-500';
      case 5: return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'system': return 'bg-primary';
      case 'warning': return 'bg-yellow-500';
      case 'error': return 'bg-destructive';
      case 'info': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div className="text-center py-12 text-muted-foreground">Loading notifications...</div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-destructive">Error loading notifications</div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with stats and actions */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold flex items-center gap-2 mb-1">
            <Bell className="w-5 h-5 text-primary" />
            Notifications
          </h2>
          <p className="text-sm text-muted-foreground">
            {notifications?.length || 0} total • {unreadCount} unread
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAllAsRead.mutate()}
            disabled={markAllAsRead.isPending || unreadCount === 0}
            className="gap-2"
          >
            <Check className="w-4 h-4" />
            Mark All Read
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (filteredNotifications && filteredNotifications.length > 0) {
                const unreadIds = filteredNotifications.filter((n: AdminNotification) => !n.is_read).map((n: AdminNotification) => n.id);
                unreadIds.forEach((id: string) => markAsRead.mutate(id));
              }
            }}
            disabled={markAsRead.isPending || unreadCount === 0}
            className="gap-2"
          >
            <Check className="w-4 h-4" />
            Mark Page Read
          </Button>
        </div>
      </div>

      {/* Filters */}
      <GlassPanel className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search notifications..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-muted/50"
            />
          </div>
          <div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="bg-muted/50">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="system">System</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="info">Info</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Select value={filterPriority} onValueChange={setFilterPriority}>
              <SelectTrigger className="bg-muted/50">
                <SelectValue placeholder="Filter by priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="1">Priority 1 (Low)</SelectItem>
                <SelectItem value="2">Priority 2</SelectItem>
                <SelectItem value="3">Priority 3</SelectItem>
                <SelectItem value="4">Priority 4</SelectItem>
                <SelectItem value="5">Priority 5 (High)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Select value={filterReadStatus} onValueChange={setFilterReadStatus}>
              <SelectTrigger className="bg-muted/50">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="read">Read</SelectItem>
                <SelectItem value="unread">Unread</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </GlassPanel>

      {/* Notifications List */}
      {filteredNotifications && filteredNotifications.length > 0 ? (
        <div className="space-y-3">
          {filteredNotifications.map((notification: AdminNotification) => (
            <GlassPanel
              key={notification.id}
              className={`p-4 transition-all ${!notification.is_read ? 'border-l-4 border-primary' : 'border-l-4 border-transparent'}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <Badge className={getTypeColor(notification.type) + ' text-white'}> 
                        {notification.type}
                      </Badge>
                      <Badge className={getPriorityColor(notification.priority) + ' text-white'}> 
                        Priority {notification.priority}
                      </Badge>
                      {!notification.is_read && (
                        <Badge variant="secondary" className="bg-blue-500/20 text-blue-500">
                          New
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
                      {formatDate(notification.created_at)}
                    </span>
                  </div>
                  <h3 className="font-semibold mb-1">{notification.title}</h3>
                  <p className="text-sm text-foreground/80 mb-3">{notification.message}</p>
                </div>
                <div className="flex flex-col gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => markAsRead.mutate(notification.id)}
                    disabled={notification.is_read || markAsRead.isPending}
                    className="w-8 h-8 p-0"
                    title="Mark as read"
                  >
                    <Check className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteNotification.mutate(notification.id)}
                    disabled={deleteNotification.isPending}
                    className="w-8 h-8 p-0 text-destructive hover:text-destructive"
                    title="Delete notification"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </GlassPanel>
          ))}
        </div>
      ) : (
        <GlassPanel className="p-8 text-center">
          <Bell className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No notifications found</p>
        </GlassPanel>
      )}
    </div>
  );
}