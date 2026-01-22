import { useState } from 'react';
import { Bell, X, CheckCheck, AlertTriangle, Info, AlertCircle, Megaphone } from 'lucide-react';
import { useAdminMessages, AdminMessage } from '@/hooks/useAdminMessages';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { cn } from '@/lib/utils';

export function NotificationBell() {
  const { user } = useAuth();
  const { messages, unreadCount, markAsRead, markAllAsRead } = useAdminMessages();
  const [isOpen, setIsOpen] = useState(false);

  // Don't render if user is not logged in
  if (!user) {
    return null;
  }

  const getPriorityIcon = (priority: AdminMessage['priority']) => {
    switch (priority) {
      case 'urgent':
        return <AlertCircle className="w-4 h-4 text-destructive" />;
      case 'high':
        return <AlertTriangle className="w-4 h-4 text-orange-500" />;
      case 'normal':
        return <Info className="w-4 h-4 text-primary" />;
      case 'low':
        return <Info className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getPriorityColor = (priority: AdminMessage['priority']) => {
    switch (priority) {
      case 'urgent':
        return 'border-l-destructive bg-destructive/5';
      case 'high':
        return 'border-l-orange-500 bg-orange-500/5';
      case 'normal':
        return 'border-l-primary bg-primary/5';
      case 'low':
        return 'border-l-muted-foreground bg-muted/30';
    }
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
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-primary-foreground text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
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
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 bg-primary/20 text-primary text-xs rounded-full">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => markAllAsRead.mutate()}
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
              {messages.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Bell className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p>No notifications yet</p>
                </div>
              ) : (
                <div className="divide-y divide-border/30">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={cn(
                        'p-4 border-l-4 cursor-pointer transition-colors hover:bg-muted/30',
                        getPriorityColor(message.priority),
                        !message.is_read && 'bg-primary/5'
                      )}
                      onClick={() => {
                        if (!message.is_read) {
                          markAsRead.mutate(message.id);
                        }
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5">
                          {getPriorityIcon(message.priority)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <h4 className={cn(
                              'font-medium truncate',
                              !message.is_read && 'text-foreground',
                              message.is_read && 'text-muted-foreground'
                            )}>
                              {message.title}
                            </h4>
                            {message.message_type === 'broadcast' && (
                              <span className="shrink-0 px-1.5 py-0.5 bg-secondary/20 text-secondary text-[10px] rounded">
                                ALL
                              </span>
                            )}
                          </div>
                          <p className={cn(
                            'text-sm line-clamp-2',
                            message.is_read ? 'text-muted-foreground' : 'text-foreground/80'
                          )}>
                            {message.content}
                          </p>
                          <p className="text-xs text-muted-foreground mt-2">
                            {formatDate(message.created_at)}
                          </p>
                        </div>
                        {!message.is_read && (
                          <div className="w-2 h-2 bg-primary rounded-full shrink-0 mt-2" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </GlassPanel>
        </>
      )}
    </div>
  );
}
