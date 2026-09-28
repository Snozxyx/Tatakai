/**
 * Dedicated notifications page (docs/Plans.md §6 "unified notification alerts
 * across the in-app notification bar and dedicated notification page").
 *
 * The bell (`NotificationBell`) is the quick-glance surface; this is the full
 * history. Both read the same `useNotifications` hook, so a mention/reply
 * notification produced by the `notify_on_comment()` trigger shows up in both,
 * and clicking one deep-links through to the comment via `data.link`.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import {
  Bell,
  Check,
  CheckCircle2,
  Trash2,
  Loader2,
  AtSign,
  Reply,
  Megaphone,
  Heart,
  CalendarClock,
} from 'lucide-react';
import { Background } from '@/components/layout/Background';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { useNotifications, type Notification } from '@/hooks/community/useNotifications';
import { useAuth } from '@/contexts/AuthContext';
import { useIsNativeApp } from '@/hooks/ui/useIsNativeApp';
import { cn } from '@/lib/utils';

function typeIcon(n: Notification) {
  switch (n.data?.type) {
    case 'mention':
      return <AtSign className="h-4 w-4 text-primary" />;
    case 'reply':
      return <Reply className="h-4 w-4 text-primary" />;
    case 'like_milestone':
      return <Heart className="h-4 w-4 text-rose-400" />;
    case 'airing':
      return <CalendarClock className="h-4 w-4 text-violet-400" />;
    default:
      return <Megaphone className="h-4 w-4 text-primary" />;
  }
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isNative = useIsNativeApp();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const { data: notifications = [], isLoading, unreadCount, markAsRead, markAllAsRead, deleteNotification } =
    useNotifications();

  const shellClass = cn(
    'relative z-10 mx-auto max-w-3xl py-4 pb-24 pr-4 md:py-6 md:pb-6 md:pr-6',
    isNative ? 'pl-4' : 'pl-4 md:pl-32',
  );

  const visible = useMemo(
    () => (filter === 'unread' ? notifications.filter((n) => !n.read) : notifications),
    [notifications, filter],
  );

  const openNotification = (n: Notification) => {
    if (!n.read) markAsRead.mutate(n.id);
    const link = n.data?.link;
    if (typeof link === 'string' && link.startsWith('/')) navigate(link);
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <Background />
      <Sidebar />

      <main className={shellClass}>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/15">
              <Bell className="h-5 w-5 text-primary" />
            </span>
            <div>
              <h1 className="font-display text-2xl font-black tracking-tight">Notifications</h1>
              <p className="text-sm text-muted-foreground">
                {unreadCount > 0 ? `${unreadCount} unread` : 'You’re all caught up'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-lg bg-muted/40 p-1">
              {(['all', 'unread'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    'rounded-md px-3 py-1 text-xs font-semibold capitalize transition-colors',
                    filter === f ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => markAllAsRead.mutate()}
              disabled={unreadCount === 0 || markAllAsRead.isPending}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Mark all read
            </Button>
          </div>
        </div>

        {!user ? (
          <GlassPanel className="p-10 text-center">
            <p className="mb-3 text-muted-foreground">Sign in to see your notifications.</p>
            <Button onClick={() => navigate('/auth')}>Sign In</Button>
          </GlassPanel>
        ) : isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : visible.length === 0 ? (
          <GlassPanel className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted/30">
              <Bell className="h-7 w-7 text-muted-foreground/40" />
            </div>
            <h3 className="text-lg font-bold">{filter === 'unread' ? 'No unread notifications' : 'Nothing here yet'}</h3>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Mentions, replies and announcements will show up here.
            </p>
          </GlassPanel>
        ) : (
          <div className="space-y-2">
            {visible.map((n) => (
              <GlassPanel
                key={n.id}
                className={cn(
                  'group flex items-start gap-3 p-4 transition-colors',
                  !n.read && 'border-primary/20 bg-primary/[0.04]',
                )}
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/40">
                  {typeIcon(n)}
                </span>
                <button
                  type="button"
                  onClick={() => openNotification(n)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="mb-1 flex items-center gap-2">
                    <h4 className={cn('truncate text-sm font-bold', n.read ? 'text-muted-foreground' : 'text-foreground')}>
                      {n.title}
                    </h4>
                    {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                  </div>
                  <p className={cn('line-clamp-2 text-xs', n.read ? 'text-muted-foreground/60' : 'text-muted-foreground')}>
                    {n.body}
                  </p>
                  <span className="mt-1.5 block text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </span>
                </button>
                <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  {!n.read && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-lg bg-primary/5 text-primary hover:bg-primary/20"
                      onClick={() => markAsRead.mutate(n.id)}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg bg-destructive/5 text-destructive hover:bg-destructive/20"
                    onClick={() => deleteNotification.mutate(n.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </GlassPanel>
            ))}
          </div>
        )}
      </main>

      <MobileNav />
    </div>
  );
}
