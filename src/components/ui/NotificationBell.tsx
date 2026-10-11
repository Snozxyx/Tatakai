import { useState } from 'react';
import { Bell } from 'lucide-react';
import { useAdminMessages } from '@/hooks/admin/useAdminMessages';
import { useNotifications } from '@/hooks/community/useNotifications';
import { useAuth } from '@/contexts/AuthContext';
import { NotificationSheet } from '@/components/community/NotificationSheet';

export function NotificationBell() {
  const { user } = useAuth();
  const { unreadCount: adminUnreadCount } = useAdminMessages();
  const { unreadCount: notificationUnreadCount } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);

  const totalUnreadCount = adminUnreadCount + notificationUnreadCount;

  // Don't render if user is not logged in
  if (!user) {
    return null;
  }

  return (
    <div className="relative flex items-center justify-center">
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="relative flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted/50 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5 shrink-0 text-muted-foreground hover:text-foreground transition-colors" />
        {totalUnreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-primary-foreground text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
            {totalUnreadCount > 9 ? '9+' : totalUnreadCount}
          </span>
        )}
      </button>

      <NotificationSheet open={isOpen} onOpenChange={setIsOpen} />
    </div>
  );
}

