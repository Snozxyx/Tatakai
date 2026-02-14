import { useState } from 'react';
import { Bell, X, CheckCheck, AlertTriangle, Info, AlertCircle, Megaphone } from 'lucide-react';
import { useAdminMessages, AdminMessage } from '@/hooks/useAdminMessages';
import { useNotifications } from '@/hooks/useNotifications';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { cn } from '@/lib/utils';

export function NotificationBell() {
  const { user } = useAuth();
  const { messages: adminMessages, unreadCount: adminUnreadCount, markAsRead: markAdminAsRead, markAllAsRead: markAllAdminAsRead } = useAdminMessages();
  const { data: notifications = [], unreadCount: notificationUnreadCount, markAsRead: markNotificationAsRead, markAllAsRead: markAllNotificationsAsRead } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);

  // Combine both admin messages and notifications
  const allMessages = [...adminMessages, ...notifications];
  const totalUnreadCount = adminUnreadCount + notificationUnreadCount;

  // Don't render if user is not logged in
  if (!user) {
    return null;
  }

  // Helper function to handle both admin messages and notifications
  const getPriorityIcon = (message: any) => {
    const adminMessage = message as any;
    if (adminMessage.priority) {
      // Admin message
      switch (adminMessage.priority) {
        case 'urgent':
          return <AlertCircle className="w-4 h-4 text-destructive" />;
        case 'high':
          return <AlertTriangle className="w-4 h-4 text-orange-500" />;
        case 'normal':
          return <Info className="w-4 h-4 text-primary" />;
        case 'low':
          return <Info className="w-4 h-4 text-muted-foreground" />;
        default:
          return <Megaphone className="w-4 h-4 text-primary" />;
      }
    } else {
      // Regular notification
      return <Megaphone className="w-4 h-4 text-primary" />;
    }
  };

  const getPriorityColor = (priority: any) => {
    if (!priority) return 'border-transparent';
    switch (priority) {
      case 'urgent': return 'border-destructive';
      case 'high': return 'border-orange-500';
      case 'normal': return 'border-primary';
      case 'low': return 'border-muted-foreground';
      default: return 'border-transparent';
    }
  };

  const isUnread = (message: any) => {
    return message.is_read === false || message.read === false;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="relative">
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl hover:bg-muted/50 transition-colors"
      >
        <Bell className="w-5 h-5 text-muted-foreground hover:text-foreground transition-colors" />
        {totalUnreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-primary-foreground text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
            {totalUnreadCount > 9 ? '9+' : totalUnreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)} 
          />
          
          {/* Panel */}
          <GlassPanel className="absolute right-0 top-12 w-80 md:w-96 max-h-[70vh] overflow-hidden z-50 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border/50">
              <div className="flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-primary" />
                <h3 className="font-semibold">Notifications</h3>
                {totalUnreadCount > 0 && (
                  <span className="px-2 py-0.5 bg-primary/20 text-primary text-xs rounded-full">
                    {totalUnreadCount} new
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {totalUnreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      markAllAdminAsRead.mutate();
                      markAllNotificationsAsRead.mutate();
                    }}
                    className="text-xs gap-1"
                  >
                    <CheckCheck className="w-3 h-3" />
                    Mark all read
                  </Button>
                )}
                <button onClick={() => setIsOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Messages List */}
            <div className="overflow-y-auto max-h-[calc(70vh-60px)]">
              {allMessages.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Bell className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p>No notifications yet</p>
                </div>
              ) : (
                <div className="divide-y divide-border/30">
                  {allMessages.map((message) => {
                    const adminMessage = message as any;
                    const notification = message as any;
                    const priority = adminMessage.priority || notification.priority;
                    
                    return (
                      <div
                        key={message.id}
                        className={cn(
                          'p-4 border-l-4 cursor-pointer transition-colors hover:bg-muted/30',
                          priority ? getPriorityColor(priority) : 'border-transparent',
                          isUnread(message) && 'bg-primary/5'
                        )}
                        onClick={() => {
                          if (isUnread(message)) {
                            if (adminMessage.priority) {
                              markAdminAsRead.mutate(message.id);
                            } else {
                              markNotificationAsRead.mutate(message.id);
                            }
                          }
                        }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5">
                          {adminMessage.priority ? getPriorityIcon(adminMessage.priority) : <Megaphone className="w-4 h-4 text-primary" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <h4 className={cn(
                              'font-medium truncate',
                              isUnread(message) ? 'text-foreground' : 'text-muted-foreground'
                            )}>
                              {message.title}
                            </h4>
                            {notification.data?.type === 'broadcast' && (
                              <span className="shrink-0 px-1.5 py-0.5 bg-secondary/20 text-secondary text-[10px] rounded">
                                ALL
                              </span>
                            )}
                          </div>
                          <p className={cn(
                            'text-sm line-clamp-2',
                            isUnread(message) ? 'text-foreground/80' : 'text-muted-foreground'
                          )}>
                            {adminMessage.content || notification.body || ''}
                          </p>
                          <p className="text-xs text-muted-foreground mt-2">
                            {formatDate(message.created_at)}
                          </p>
                        </div>
                        {isUnread(message) && (
                          <div className="w-2 h-2 bg-primary rounded-full shrink-0 mt-2" />
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          </GlassPanel>
        </>
      )}
    </div>
  );
}
