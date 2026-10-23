import { NotificationSoundToggle } from '@/components/community/NotificationSoundToggle';
import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
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
  { value: 'all', get label() { return uiI18n.t('app.all_6a720856'); }, icon: Bell },
  { value: 'mention', get label() { return uiI18n.t('app.mention_51258021'); }, icon: AtSign },
  { value: 'calendar', get label() { return uiI18n.t('app.calendar_adab5090'); }, icon: CalendarClock },
  { value: 'announcement', get label() { return uiI18n.t('app.announce_b6e44152'); }, icon: Megaphone },
  { value: 'system', get label() { return uiI18n.t('app.system_bc0792d8'); }, icon: Info },
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
  fromUserId?: string;
  rawId: string;
}

function categorize(type: string | undefined): Category {
  if (type === 'mention') return 'mention';
  if (type === 'airing') return 'calendar';
  if (type === 'broadcast' || type === 'announcement') return 'announcement';
  return 'system';
}

/** A quiet, consistent icon for each activity type. */
function iconFor(type: string): { icon: React.ElementType } {
  switch (type) {
    case 'mention':
      return { icon: AtSign };
    case 'airing':
      return { icon: CalendarClock };
    case 'broadcast':
    case 'announcement':
      return { icon: Megaphone };
    case 'like_milestone':
      return { icon: Heart };
    case 'reply':
      return { icon: Reply };
    default:
      return { icon: Info };
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
  return new Date(iso).toLocaleDateString(uiI18n.language);
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
  useUiTranslation();
  return (
    <div className="mb-2 mt-1 px-3 text-xs font-medium text-muted-foreground">
      {children}
    </div>
  );
}

function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  useUiTranslation();
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center text-muted-foreground">
        <Icon className="h-6 w-6" />
      </div>
      <p className="max-w-[260px] text-sm leading-relaxed text-muted-foreground">{message}</p>
    </div>
  );
}

function NotificationRow({ item, onClick }: { item: FeedItem; onClick: (item: FeedItem) => void }) {
  useUiTranslation();
  const { icon: Icon } = iconFor(item.iconType);
  const hasAvatar = !!item.fromUserId || !!item.fromAvatar || !!item.fromUsername;
  return (
    <button
      type="button"
      onClick={() => onClick(item)}
      className={cn(
        'group flex w-full items-start gap-3 rounded-lg px-3 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        item.read
          ? 'hover:bg-muted/40'
          : 'bg-muted/30 hover:bg-muted/50',
      )}
    >
      {hasAvatar ? (
        <Avatar className="h-10 w-10 shrink-0">
          <AvatarImage src={item.fromAvatar} alt={item.fromUsername || 'Notification sender'} />
          <AvatarFallback className="bg-white/[0.06] text-[11px] font-bold text-muted-foreground">
            {(item.fromUsername ?? '?').slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
          <Icon className="h-4 w-4" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className={cn('min-w-0 break-words text-sm leading-snug text-foreground', item.read ? 'font-medium' : 'font-semibold')}>{item.title}</p>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{relTime(item.createdAt)}</span>
        </div>
        {item.body && (
          <p className="mt-1 line-clamp-2 break-words text-[13px] leading-relaxed text-muted-foreground">{item.body}</p>
        )}
      </div>
      {!item.read && <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
    </button>
  );
}

function UpcomingCalendar({ onNavigate }: { onNavigate: (link: string) => void }) {
  useUiTranslation();
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
      <SectionLabel>{uiI18n.t('app.upcoming_your_calendar_d1ebb93f')}</SectionLabel>
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
                className="flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {m.coverImage ? (
                  <img src={m.coverImage} alt="" className="h-12 w-9 shrink-0 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-12 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <CalendarClock className="h-4 w-4" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{m.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground/80">
                    {m.episode != null ? uiI18n.t('app.ep_i18n_value_0_1a0eea94', { value0: m.episode }) : uiI18n.t('app.next_episode_882f1a46')}
                  </p>
                </div>
                <div className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                  {m.airingAt != null ? countdown(m.airingAt) : ''}
                </div>
              </button>
            ))}
      </div>
    </div>
  );
}

function SentMentionsList({ onNavigate }: { onNavigate: (link: string) => void }) {
  useUiTranslation();
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
    return <EmptyState icon={AtSign} message={uiI18n.t('app.you_haven_t_mentioned_anyone_yet_mention_someone_6957ff62')} />;
  }

  return (
    <div className="space-y-2">
      {sent.map((m) => {
        const names = m.mentioned
          .map((u) => `@${u.display_name || u.username || 'someone'}`)
          .join(', ');
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onNavigate(m.link)}
            className="flex w-full items-start gap-3 rounded-lg p-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              <p className="truncate text-sm font-semibold text-foreground">
                {uiI18n.t('app.you_mentioned_97bb3b2b')} <span className="text-foreground">{names}</span>
              </p>
              <p className="mt-1 line-clamp-2 break-words text-[13px] leading-relaxed text-muted-foreground">{m.preview}</p>
              <span className="mt-1 block text-[11px] font-medium text-muted-foreground">{relTime(m.created_at)}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function NotificationSheet({ open, onOpenChange }: NotificationSheetProps) {
  useUiTranslation();
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

  const senderIds = [...new Set([
    ...notifications.map((n) => n.data?.from_user ?? n.data?.actor_id),
    ...(messages ?? []).map((m) => m.sender_id),
  ].filter((id): id is string => typeof id === 'string' && !!id))].sort();
  const { data: senders = [] } = useQuery({
    queryKey: ['notification-senders', senderIds],
    enabled: open && senderIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles')
        .select('user_id, username, display_name, avatar_url').in('user_id', senderIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const items = useMemo<FeedItem[]>(() => {
    const senderById = new Map(senders.map((sender) => [sender.user_id, sender]));
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
      fromUserId: n.data?.from_user ?? n.data?.actor_id,
      fromUsername: senderById.get(n.data?.from_user ?? n.data?.actor_id)?.display_name
        || senderById.get(n.data?.from_user ?? n.data?.actor_id)?.username || n.data?.from_username,
      fromAvatar: senderById.get(n.data?.from_user ?? n.data?.actor_id)?.avatar_url || n.data?.from_avatar,
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
      fromUserId: m.sender_id,
      fromUsername: senderById.get(m.sender_id)?.display_name || senderById.get(m.sender_id)?.username,
      fromAvatar: senderById.get(m.sender_id)?.avatar_url,
      rawId: m.id,
    }));
    return [...notifItems, ...adminItems].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [notifications, messages, senders]);

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
    <div className="space-y-6">
      {BUCKET_ORDER.filter((b) => grouped[b].length > 0).map((bucket) => (
        <div key={bucket}>
          <SectionLabel>{bucket}</SectionLabel>
          <div className="space-y-1">
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
        className="z-50 flex w-full flex-col gap-0 overflow-hidden border-l border-border bg-background p-0 shadow-[-16px_0_64px_-24px_rgba(0,0,0,0.45)] sm:max-w-[440px] md:max-w-[480px]"
      >
        <SheetHeader className="shrink-0 px-6 pb-5 pt-8 text-left">
          <SheetTitle className="pr-8 font-display text-2xl font-semibold tracking-tight text-foreground">
            {uiI18n.t('app.notifications_753a22b2')}
          </SheetTitle>
          <div className="flex min-h-8 items-center justify-between gap-3">
            <SheetDescription className="text-xs text-muted-foreground">
              {totalUnread > 0 ? uiI18n.t('app.i18n_value_0_unread_notificationi18n_value_1_c7314901', { value0: totalUnread, value1: totalUnread === 1 ? '' : 's' }) : uiI18n.t('app.you_are_all_caught_up_c0b73100')}
            </SheetDescription>
            {totalUnread > 0 && (
              <button type="button" onClick={handleMarkAll}
                className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <CheckCheck className="h-3.5 w-3.5" />
                {uiI18n.t('app.mark_all_26cd1bb1')}
              </button>
            )}
          </div>
        </SheetHeader>

        <div className="grid shrink-0 grid-cols-5 border-b border-border px-4" role="group" aria-label={uiI18n.t('app.notifications_753a22b2')}>
          {TABS.map(({ value, label }) => (
            <button key={value} type="button" aria-pressed={tab === value} onClick={() => setTab(value)}
              className={cn('relative min-h-11 min-w-0 px-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                tab === value ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground hover:text-foreground')}>
              <span className="block truncate">{label}</span>
              {tab === value && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-foreground" />}
            </button>
          ))}
        </div>

        <div className="custom-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-5 sm:px-4">
          {tab === 'mention' ? (
            <div className="space-y-4">
              {/* Received / Sent toggle */}
              <div className="mx-3 grid grid-cols-2 gap-1 rounded-lg bg-muted/40 p-1">
                {(['received', 'sent'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setMentionView(v)}
                    className={cn(
                      'min-h-9 rounded-md px-3 text-xs font-medium capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      mentionView === v
                        ? 'bg-background text-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {uiI18n.t(({"received":"app.received_38428a69","sent":"app.sent_27e7700f"})[v])}
                  </button>
                ))}
              </div>
              {mentionView === 'received' ? (
                visible.length > 0 ? (
                  groupedList
                ) : (
                  <EmptyState icon={AtSign} message={uiI18n.t('app.no_mentions_yet_when_someone_mentions_you_it_app_aee55ba2')} />
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
                  message={uiI18n.t('app.no_airing_reminders_yet_we_ll_ping_you_when_a_tr_6a255f46')}
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
                  ? uiI18n.t('app.no_announcements_right_now_1fdd88ea')
                  : tab === 'system'
                    ? uiI18n.t('app.nothing_here_yet_ede1ba2f')
                    : uiI18n.t('app.no_notifications_yet_5537c608')
              }
            />
          )}
        </div>
        <div className="shrink-0 border-t border-border px-6 py-2 text-muted-foreground">
          <NotificationSoundToggle />
        </div>
      </SheetContent>
    </Sheet>
  );
}
