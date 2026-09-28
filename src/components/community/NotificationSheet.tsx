import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useNotifications, type Notification } from '@/hooks/community/useNotifications';
import { useAdminMessages } from '@/hooks/admin/useAdminMessages';
import { useSentMentions } from '@/hooks/community/useSentMentions';
import { useTrackedShows } from '@/hooks/user/useTrackedShows';
import { useNextAiringEpisodes } from '@/hooks/api/useNextAiringEpisodes';
import {
  Bell,
  AtSign,
  CalendarClock,
  Megaphone,
  Info,
  Heart,
  Reply,
  CheckCheck,
  Inbox,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface NotificationSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Category = 'mention' | 'calendar' | 'announcement' | 'system';
type Tab = 'all' | Category;

const TABS: Array<{ value: Tab; label: string; icon: React.ElementType }> = [
  { value: 'all', label: 'All', icon: Bell },
  { value: 'mention', label: 'Mention', icon: AtSign },
  { value: 'calendar', label: 'Calendar', icon: CalendarClock },
  { value: 'announcement', label: 'Announce', icon: Megaphone },
  { value: 'system', label: 'System', icon: Info },
];

interface FeedItem {
  key: string;
  source: 'notification' | 'admin';
  category: Category;
  iconType: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  link?: string;
  fromUsername?: string;
  fromAvatar?: string;
  rawId: string;
}

function categorize(type: string | undefined): Category {
  if (type === 'mention') return 'mention';
  if (type === 'airing') return 'calendar';
  if (type === 'broadcast' || type === 'announcement') return 'announcement';
  return 'system';
}

/** Per-type icon + tint for the row's leading chip. */
function iconFor(type: string): { icon: React.ElementType; tint: string } {
  switch (type) {
    case 'mention':
      return { icon: AtSign, tint: 'text-sky-400 bg-sky-500/15 border-sky-500/25' };
    case 'airing':
      return { icon: CalendarClock, tint: 'text-violet-400 bg-violet-500/15 border-violet-500/25' };
    case 'broadcast':
    case 'announcement':
      return { icon: Megaphone, tint: 'text-amber-400 bg-amber-500/15 border-amber-500/25' };
    case 'like_milestone':
      return { icon: Heart, tint: 'text-rose-400 bg-rose-500/15 border-rose-500/25' };
    case 'reply':
      return { icon: Reply, tint: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/25' };
    default:
      return { icon: Info, tint: 'text-muted-foreground bg-white/[0.06] border-white/10' };
  }
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function dayBucket(iso: string): 'Today' | 'Yesterday' | 'Earlier' {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = new Date(iso).getTime();
  if (t >= startOfToday) return 'Today';
  if (t >= startOfToday - 86_400_000) return 'Yesterday';
  return 'Earlier';
}

function countdown(airingAtSec: number): string {
  const diff = airingAtSec * 1000 - Date.now();
  if (diff <= 0) return 'Airing now';
  const totalMin = Math.floor(diff / 60000);
  const days = Math.floor(totalMin / 1440);
  const hrs = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d ${hrs}h`;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

const BUCKET_ORDER: Array<'Today' | 'Yesterday' | 'Earlier'> = ['Today', 'Yesterday', 'Earlier'];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 mt-1 px-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground/60">
      {children}
    </div>
  );
}

function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.02] text-muted-foreground/50">
        <Icon className="h-6 w-6" />
      </div>
      <p className="max-w-[220px] text-xs font-medium text-muted-foreground/70">{message}</p>
    </div>
  );
}

function NotificationRow({ item, onClick }: { item: FeedItem; onClick: (item: FeedItem) => void }) {
  const { icon: Icon, tint } = iconFor(item.iconType);
  const hasAvatar = !!item.fromAvatar || !!item.fromUsername;
  return (
    <motion.button
      type="button"
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => onClick(item)}
      className={cn(
        'group flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition-all duration-200',
        item.read
          ? 'border-white/[0.05] bg-white/[0.01] hover:bg-white/[0.03]'
          : 'border-primary/20 bg-primary/[0.06] hover:bg-primary/[0.09]',
      )}
    >
      {hasAvatar ? (
        <Avatar className="h-9 w-9 shrink-0 border border-white/10">
          <AvatarImage src={item.fromAvatar} />
          <AvatarFallback className="bg-white/[0.06] text-[11px] font-bold text-muted-foreground">
            {(item.fromUsername ?? '?').slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      ) : (
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border', tint)}>
          <Icon className="h-4 w-4" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-bold text-white">{item.title}</p>
        {item.body && (
          <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground/80">{item.body}</p>
        )}
        <span className="mt-1 block text-[10px] font-medium text-muted-foreground/50">{relTime(item.createdAt)}</span>
      </div>
      {!item.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.6)]" />}
    </motion.button>
  );
}

function UpcomingCalendar({ onNavigate }: { onNavigate: (link: string) => void }) {
  const { data: tracked } = useTrackedShows();
  const anilistIds = useMemo(
    () => (tracked ?? []).map((t) => Number(t.anilist_id)).filter((n) => Number.isFinite(n) && n > 0),
    [tracked],
  );
  const { data: airing, isLoading } = useNextAiringEpisodes(anilistIds);

  const upcoming = useMemo(() => {
    const rows = Object.values(airing ?? {}).filter((m) => m.airingAt != null);
    return rows.sort((a, b) => (a.airingAt ?? 0) - (b.airingAt ?? 0));
  }, [airing]);

  if (anilistIds.length === 0 || (!isLoading && upcoming.length === 0)) return null;

  return (
    <div>
      <SectionLabel>Upcoming · Your calendar</SectionLabel>
      <div className="space-y-2">
        {isLoading
          ? Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-2xl bg-white/[0.03]" />
            ))
          : upcoming.slice(0, 6).map((m) => (
              <button
                key={m.mediaId}
                type="button"
                onClick={() => onNavigate(`/anime/anilist-${m.mediaId}`)}
                className="flex w-full items-center gap-3 rounded-2xl border border-violet-500/15 bg-violet-500/[0.04] p-2.5 text-left transition-all duration-200 hover:bg-violet-500/[0.08]"
              >
                {m.coverImage ? (
                  <img src={m.coverImage} alt="" className="h-12 w-9 shrink-0 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-12 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-400">
                    <CalendarClock className="h-4 w-4" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold text-white">{m.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground/80">
                    {m.episode != null ? `Ep ${m.episode}` : 'Next episode'}
                  </p>
                </div>
                <div className="shrink-0 rounded-lg bg-violet-500/15 px-2 py-1 text-[11px] font-bold tabular-nums text-violet-300">
                  {m.airingAt != null ? countdown(m.airingAt) : ''}
                </div>
              </button>
            ))}
      </div>
    </div>
  );
}

function SentMentionsList({ onNavigate }: { onNavigate: (link: string) => void }) {
  const { data: sent, isLoading } = useSentMentions();

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-2xl bg-white/[0.03]" />
        ))}
      </div>
    );
  }

  if (!sent || sent.length === 0) {
    return <EmptyState icon={AtSign} message="You haven't mentioned anyone yet. @mention someone in a comment and it shows up here." />;
  }

  return (
    <div className="space-y-2">
      {sent.map((m) => {
        const names = m.mentioned
          .map((u) => `@${u.display_name || u.username || 'someone'}`)
          .join(', ');
        return (
          <motion.button
            key={m.id}
            type="button"
            layout
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => onNavigate(m.link)}
            className="flex w-full items-start gap-3 rounded-2xl border border-white/[0.05] bg-white/[0.01] p-3 text-left transition-all duration-200 hover:bg-white/[0.03]"
          >
            <div className="flex -space-x-2">
              {m.mentioned.slice(0, 3).map((u) => (
                <Avatar key={u.user_id} className="h-8 w-8 border border-white/10">
                  <AvatarImage src={u.avatar_url ?? undefined} />
                  <AvatarFallback className="bg-white/[0.06] text-[10px] font-bold text-muted-foreground">
                    {(u.display_name || u.username || '?').slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              ))}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold text-white">
                You mentioned <span className="text-sky-400">{names}</span>
              </p>
              <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground/80">{m.preview}</p>
              <span className="mt-1 block text-[10px] font-medium text-muted-foreground/50">{relTime(m.created_at)}</span>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}

export function NotificationSheet({ open, onOpenChange }: NotificationSheetProps) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('all');
  const [mentionView, setMentionView] = useState<'received' | 'sent'>('received');

  const {
    data: notifications = [],
    markAsRead,
    markAllAsRead,
    unreadCount: notifUnread,
  } = useNotifications();
  const {
    messages,
    markAsRead: markAdminAsRead,
    markAllAsRead: markAllAdminAsRead,
    unreadCount: adminUnread,
  } = useAdminMessages();

  const items = useMemo<FeedItem[]>(() => {
    const notifItems = (notifications as Notification[]).map<FeedItem>((n) => ({
      key: `n-${n.id}`,
      source: 'notification',
      category: categorize(n.data?.type),
      iconType: n.data?.type ?? 'system',
      title: n.title,
      body: n.body,
      createdAt: n.created_at,
      read: n.read,
      link: n.data?.link,
      fromUsername: n.data?.from_username,
      fromAvatar: n.data?.from_avatar,
      rawId: n.id,
    }));
    const adminItems = (messages ?? []).map<FeedItem>((m) => ({
      key: `a-${m.id}`,
      source: 'admin',
      category: 'announcement',
      iconType: 'announcement',
      title: m.title,
      body: m.content,
      createdAt: m.created_at,
      read: m.is_read,
      rawId: m.id,
    }));
    return [...notifItems, ...adminItems].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [notifications, messages]);

  const totalUnread = notifUnread + adminUnread;

  const visible = useMemo(
    () => (tab === 'all' ? items : items.filter((i) => i.category === tab)),
    [items, tab],
  );

  const grouped = useMemo(() => {
    const map: Record<string, FeedItem[]> = { Today: [], Yesterday: [], Earlier: [] };
    for (const i of visible) map[dayBucket(i.createdAt)].push(i);
    return map;
  }, [visible]);

  const handleItemClick = (item: FeedItem) => {
    if (!item.read) {
      if (item.source === 'admin') markAdminAsRead.mutate(item.rawId);
      else markAsRead.mutate(item.rawId);
    }
    if (item.link) {
      onOpenChange(false);
      navigate(item.link);
    }
  };

  const handleNavigate = (link: string) => {
    onOpenChange(false);
    navigate(link);
  };

  const handleMarkAll = () => {
    markAllAsRead.mutate();
    markAllAdminAsRead.mutate();
  };

  const groupedList = (
    <div className="space-y-4">
      {BUCKET_ORDER.filter((b) => grouped[b].length > 0).map((bucket) => (
        <div key={bucket}>
          <SectionLabel>{bucket}</SectionLabel>
          <div className="space-y-2">
            {grouped[bucket].map((item) => (
              <NotificationRow key={item.key} item={item} onClick={handleItemClick} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden border-l border-white/[0.08] bg-background/60 p-0 backdrop-blur-[40px] sm:max-w-md md:max-w-lg shadow-[-20px_0_40px_rgba(0,0,0,0.5)] z-50"
      >
        {/* Ambient glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-primary/15 blur-[120px] rounded-full" />
          <div className="absolute bottom-20 left-0 w-72 h-72 bg-sky-500/10 blur-[100px] rounded-full" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/80 to-background/95" />
        </div>

        {/* Header */}
        <SheetHeader className="relative shrink-0 border-b border-white/[0.05] bg-white/[0.01] p-6 pb-5 text-left z-10">
          <div className="flex items-center justify-between gap-3">
            <SheetTitle className="flex items-center gap-3 text-2xl font-black tracking-tight text-white drop-shadow-md">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/30 to-primary/5 border border-primary/20 text-primary shadow-[0_0_20px_rgba(var(--primary),0.2)]">
                <Bell className="h-5 w-5" />
              </div>
              Notifications
            </SheetTitle>
            {totalUnread > 0 && (
              <button
                type="button"
                onClick={handleMarkAll}
                className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] font-bold text-muted-foreground transition-all hover:bg-white/[0.06] hover:text-white"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all
              </button>
            )}
          </div>
          <p className="mt-1 text-xs font-medium text-muted-foreground/80">
            {totalUnread > 0 ? `${totalUnread} unread notification${totalUnread === 1 ? '' : 's'}` : 'You are all caught up'}
          </p>
        </SheetHeader>

        {/* Scrollable body */}
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6 custom-scrollbar relative z-10">
          {/* Filter tabs */}
          <div className="grid grid-cols-5 gap-1.5 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-1.5 shadow-xl backdrop-blur-md">
            {TABS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[10px] font-bold tracking-tight transition-all duration-200',
                  tab === value
                    ? 'bg-primary text-primary-foreground shadow-[0_0_20px_rgba(var(--primary),0.35)]'
                    : 'text-muted-foreground hover:text-white hover:bg-white/[0.03]',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>

          {tab === 'mention' ? (
            <div className="space-y-4">
              {/* Received / Sent toggle */}
              <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-1.5">
                {(['received', 'sent'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setMentionView(v)}
                    className={cn(
                      'rounded-xl px-3 py-1.5 text-xs font-bold capitalize transition-all duration-200',
                      mentionView === v
                        ? 'bg-primary text-primary-foreground shadow-[0_0_16px_rgba(var(--primary),0.3)]'
                        : 'text-muted-foreground hover:text-white',
                    )}
                  >
                    {v}
                  </button>
                ))}
              </div>
              {mentionView === 'received' ? (
                visible.length > 0 ? (
                  groupedList
                ) : (
                  <EmptyState icon={AtSign} message="No mentions yet. When someone @mentions you, it appears here." />
                )
              ) : (
                <SentMentionsList onNavigate={handleNavigate} />
              )}
            </div>
          ) : tab === 'calendar' ? (
            <div className="space-y-5">
              <UpcomingCalendar onNavigate={handleNavigate} />
              {visible.length > 0 ? (
                groupedList
              ) : (
                <EmptyState
                  icon={CalendarClock}
                  message="No airing reminders yet — we'll ping you when a tracked show is about to air."
                />
              )}
            </div>
          ) : visible.length > 0 ? (
            groupedList
          ) : (
            <EmptyState
              icon={tab === 'announcement' ? Megaphone : Inbox}
              message={
                tab === 'announcement'
                  ? 'No announcements right now.'
                  : tab === 'system'
                    ? 'Nothing here yet.'
                    : 'No notifications yet.'
              }
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
