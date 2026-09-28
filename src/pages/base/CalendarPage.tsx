/**
 * Tatakai Calendar (docs/Plans.md §6) — a Google-Calendar-style week view of the
 * anime airing schedule, powered by AniList (`useAiringSchedule`) and rendered in
 * the Tatakai design language (dark, GlassPanel, primary accents).
 *
 * Seven day-columns with a sticky date header; each column is an agenda of the
 * episodes airing that day, ordered by air time. Shows the user has pinned from
 * an anime page (`tracked_shows`, matched on AniList id) are highlighted and can
 * be isolated with the "My shows" toggle. Prev / Today / Next move the window,
 * so past and upcoming weeks are all reachable.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Star,
  Filter,
  CalendarSearch,
  CalendarPlus,
  CalendarX,
  Clock,
  Tv,
  Sparkles,
  Play,
} from 'lucide-react';
import { Background } from '@/components/layout/Background';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { useAuth } from '@/contexts/AuthContext';
import { useIsNativeApp } from '@/hooks/ui/useIsNativeApp';
import { useAiringSchedule, type AiringEntry } from '@/hooks/api/useAiringSchedule';
import { useTrackedShows, useToggleTrackedShowByAnilist } from '@/hooks/user/useTrackedShows';
import { cn } from '@/lib/utils';
import { contentGraph } from '@/core';

const DAY_MS = 86400000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function startOfWeek(base: Date): Date {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // back to Sunday
  return d;
}

function formatTime(unix: number) {
  return new Date(unix * 1000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/* ------------------------------------------------------------------ */
/* Entry card                                                          */
/* ------------------------------------------------------------------ */

function EntryCard({
  entry,
  tracked,
  isPast,
  isNext,
  canTrack,
  onToggle,
  onOpen,
}: {
  entry: AiringEntry;
  tracked: boolean;
  isPast: boolean;
  isNext: boolean;
  canTrack: boolean;
  onToggle: (entry: AiringEntry, tracked: boolean) => void;
  onOpen: (entry: AiringEntry) => void;
}) {
  const time = formatTime(entry.airingAt);

  const card = (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl border transition-all duration-200',
        'hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30',
        tracked
          ? 'border-primary/50 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent hover:border-primary/70'
          : 'border-white/[0.06] bg-white/[0.03] hover:border-white/[0.14] hover:bg-white/[0.06]',
        isPast && !tracked && 'opacity-55 hover:opacity-90',
        isNext && 'ring-1 ring-primary/60 shadow-[0_0_24px_-6px] shadow-primary/50',
      )}
    >
      {/* Tracked accent bar */}
      {tracked && <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" aria-hidden />}

      <button
        type="button"
        onClick={() => onOpen(entry)}
        className="flex w-full gap-2.5 p-2 text-left"
      >
        {/* Cover */}
        <div className="relative h-16 w-11 shrink-0 overflow-hidden rounded-md bg-muted/40">
          {entry.coverImage ? (
            <img
              src={entry.coverImage}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Tv className="h-4 w-4 text-muted-foreground/50" />
            </div>
          )}
          {/* Play overlay */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
            <Play className="h-4 w-4 fill-white text-white" />
          </div>
        </div>

        {/* Text */}
        <div className="min-w-0 flex-1 py-0.5">
          <div className="mb-1 flex items-center gap-1.5">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
                isPast
                  ? 'bg-muted/50 text-muted-foreground'
                  : 'bg-primary/15 text-primary',
              )}
            >
              <Clock className="h-2.5 w-2.5" />
              {time}
            </span>
            {isNext && (
              <span className="rounded-md bg-primary px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-primary-foreground">
                Next
              </span>
            )}
            {tracked && <Star className="ml-auto h-3 w-3 shrink-0 fill-primary text-primary" />}
          </div>
          <p className="line-clamp-2 text-xs font-semibold leading-snug text-foreground/95">
            {entry.title}
          </p>
          <p className="mt-1 text-[10px] font-medium text-muted-foreground">
            Episode <span className="text-foreground/80">{entry.episode}</span>
            {entry.totalEpisodes ? (
              <span className="text-muted-foreground/60"> / {entry.totalEpisodes}</span>
            ) : null}
          </p>
        </div>
      </button>

      {/* Quick pin (hover) */}
      {canTrack && (
        <button
          type="button"
          title={tracked ? 'Remove from calendar' : 'Add to calendar'}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(entry, tracked);
          }}
          className={cn(
            'absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-md border transition-all',
            'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
            tracked
              ? 'border-primary/40 bg-primary/20 text-primary hover:bg-destructive/20 hover:text-destructive hover:border-destructive/40'
              : 'border-white/10 bg-black/40 text-muted-foreground hover:bg-primary/20 hover:text-primary hover:border-primary/40',
          )}
        >
          {tracked ? <CalendarX className="h-3 w-3" /> : <CalendarPlus className="h-3 w-3" />}
        </button>
      )}
    </div>
  );

  if (!canTrack) return card;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{card}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onSelect={() => onOpen(entry)}>
          <Play className="mr-2 h-4 w-4" />
          Watch now
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onToggle(entry, tracked)}>
          {tracked ? (
            <>
              <CalendarX className="mr-2 h-4 w-4" />
              Remove from calendar
            </>
          ) : (
            <>
              <CalendarPlus className="mr-2 h-4 w-4" />
              Add to calendar
            </>
          )}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/* ------------------------------------------------------------------ */
/* Skeleton                                                            */
/* ------------------------------------------------------------------ */

function DaySkeleton({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="h-14 animate-pulse rounded-xl bg-white/[0.04]" />
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-20 animate-pulse rounded-xl bg-white/[0.03]"
          style={{ animationDelay: `${i * 80}ms` }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function CalendarPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isNative = useIsNativeApp();

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [mineOnly, setMineOnly] = useState(false);
  const [mobileDay, setMobileDay] = useState(() => new Date().getDay());
  const [now, setNow] = useState(() => Date.now());

  // Keep "past / next" markers fresh.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const { data: entries = [], isLoading } = useAiringSchedule(weekStart);
  const { data: tracked = [] } = useTrackedShows();
  const toggleTrack = useToggleTrackedShowByAnilist();

  const handleToggle = (entry: AiringEntry, isTracked: boolean) => {
    toggleTrack.mutate({
      anilistId: entry.mediaId,
      title: entry.title,
      imageUrl: entry.coverImage,
      tracked: isTracked,
    });
  };

  // Clicking an entry should take you straight to watching. The calendar only
  // knows the AniList id, so resolve it to our internal media (for its
  // `tatakaiId`), then jump to that show's episode 1 — WatchPage matches the
  // `?ep=` number against the real episode list. If the show can't be resolved
  // (not in our catalogue), fall back to the anime page for its AniList id.
  const handleOpen = async (entry: AiringEntry) => {
    try {
      const media = await contentGraph.getMedia(`anilist-${entry.mediaId}`);
      const baseId = media.tatakaiId || `anilist-${entry.mediaId}`;
      navigate(`/watch/${encodeURIComponent(`${baseId}?ep=1`)}`);
    } catch {
      navigate(`/anime/anilist-${entry.mediaId}`);
    }
  };

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const trackedAnilistIds = useMemo(
    () => new Set(tracked.map((t) => t.anilist_id).filter((x): x is number => typeof x === 'number')),
    [tracked],
  );

  const days = useMemo(() => {
    const buckets: AiringEntry[][] = [[], [], [], [], [], [], []];
    const startMs = weekStart.getTime();
    for (const e of entries) {
      if (mineOnly && !trackedAnilistIds.has(e.mediaId)) continue;
      const idx = Math.floor((e.airingAt * 1000 - startMs) / DAY_MS);
      if (idx >= 0 && idx < 7) buckets[idx].push(e);
    }
    buckets.forEach((b) => b.sort((a, z) => a.airingAt - z.airingAt));
    return buckets;
  }, [entries, weekStart, mineOnly, trackedAnilistIds]);

  const todayIdx = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    const idx = Math.floor((t.getTime() - weekStart.getTime()) / DAY_MS);
    return idx >= 0 && idx < 7 ? idx : -1;
  }, [weekStart]);

  // The single next-airing episode in the visible week (if it's the current week).
  const nextEntryId = useMemo(() => {
    let best: AiringEntry | null = null;
    for (const b of days) {
      for (const e of b) {
        if (e.airingAt * 1000 >= now && (!best || e.airingAt < best.airingAt)) best = e;
      }
    }
    return best?.id ?? null;
  }, [days, now]);

  const totalThisWeek = days.reduce((n, b) => n + b.length, 0);
  const trackedThisWeek = days.reduce(
    (n, b) => n + b.filter((e) => trackedAnilistIds.has(e.mediaId)).length,
    0,
  );

  const shellClass = cn(
    'relative z-10 mx-auto max-w-[1800px] py-4 pb-24 pr-4 md:py-6 md:pb-6 md:pr-6',
    isNative ? 'pl-4' : 'pl-4 md:pl-32',
  );

  const weekEnd = new Date(weekStart.getTime() + 6 * DAY_MS);
  const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
  const rangeLabel = sameMonth
    ? `${weekStart.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })} – ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`
    : `${weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${weekEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;

  const isCurrentWeek = todayIdx !== -1;
  const shiftWeek = (dir: number) => setWeekStart((w) => new Date(w.getTime() + dir * 7 * DAY_MS));
  const goToday = () => {
    setWeekStart(startOfWeek(new Date()));
    setMobileDay(new Date().getDay());
  };

  const renderDay = (i: number) => {
    const dayEntries = days[i];
    const date = new Date(weekStart.getTime() + i * DAY_MS);
    const isToday = i === todayIdx;
    const isPastDay = date.getTime() + DAY_MS < now;

    return (
      <div key={i} className="flex min-w-0 flex-col">
        {/* Day header */}
        <div
          className={cn(
            'sticky top-0 z-10 mb-2 overflow-hidden rounded-xl border px-3 py-2 backdrop-blur-md transition-colors',
            isToday
              ? 'border-primary/50 bg-primary/15 shadow-[0_0_30px_-10px] shadow-primary/60'
              : 'border-white/[0.06] bg-card/70',
          )}
        >
          {isToday && (
            <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent" />
          )}
          <div className="flex items-end justify-between gap-2">
            <div>
              <div
                className={cn(
                  'text-[10px] font-bold uppercase tracking-[0.18em]',
                  isToday ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                {WEEKDAYS[i]}
              </div>
              <div className="flex items-baseline gap-1">
                <span
                  className={cn(
                    'font-display text-2xl font-black leading-none',
                    isToday ? 'text-primary' : isPastDay ? 'text-foreground/60' : 'text-foreground',
                  )}
                >
                  {date.getDate()}
                </span>
                <span className="text-[10px] font-medium text-muted-foreground">
                  {date.toLocaleDateString(undefined, { month: 'short' })}
                </span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              {isToday && (
                <span className="rounded-full bg-primary px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-primary-foreground">
                  Today
                </span>
              )}
              {dayEntries.length > 0 && (
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums',
                    isToday ? 'bg-primary/20 text-primary' : 'bg-white/[0.06] text-muted-foreground',
                  )}
                >
                  {dayEntries.length} ep{dayEntries.length === 1 ? '' : 's'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Agenda */}
        <div
          className={cn(
            'flex-1 space-y-2 rounded-xl p-1',
            isToday && 'bg-primary/[0.04] ring-1 ring-inset ring-primary/10',
          )}
        >
          {dayEntries.length === 0 ? (
            <div className="flex h-28 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/[0.06] text-muted-foreground/40">
              <Tv className="h-4 w-4" />
              <span className="text-[10px] font-medium">Nothing airing</span>
            </div>
          ) : (
            dayEntries.map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                tracked={trackedAnilistIds.has(entry.mediaId)}
                isPast={entry.airingAt * 1000 < now}
                isNext={entry.id === nextEntryId}
                canTrack={!!user}
                onToggle={handleToggle}
                onOpen={handleOpen}
              />
            ))
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <Background />
      <Sidebar />

      <main className={shellClass}>
        {/* ---------------------------------------------------------- */}
        {/* Header                                                     */}
        {/* ---------------------------------------------------------- */}
        <section className="relative mb-5 overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-card/80 via-card/50 to-primary/5 p-4 backdrop-blur-xl md:p-5">
          <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-primary/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />

          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/30 bg-primary/15 shadow-[0_0_30px_-8px] shadow-primary/70">
                <CalendarDays className="h-5 w-5 text-primary" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-display text-2xl font-black tracking-tight md:text-3xl">
                    Tatakai Calendar
                  </h1>
                  {isCurrentWeek && (
                    <span className="hidden items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary sm:inline-flex">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                      This week
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground/85">{rangeLabel}</span>
                  <span className="mx-1.5 text-muted-foreground/40">·</span>
                  <span className="text-muted-foreground/70">{timeZone}</span>
                </p>
              </div>
            </div>

            {/* Stats */}
            <div className="hidden items-center gap-2 lg:flex">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Episodes
                </div>
                <div className="font-display text-xl font-black leading-none tabular-nums">
                  {isLoading ? '—' : totalThisWeek}
                </div>
              </div>
              {user && (
                <div className="rounded-xl border border-primary/20 bg-primary/10 px-3 py-2">
                  <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                    <Star className="h-2.5 w-2.5 fill-primary" />
                    Yours
                  </div>
                  <div className="font-display text-xl font-black leading-none tabular-nums text-primary">
                    {isLoading ? '—' : trackedThisWeek}
                  </div>
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              {user && (
                <Button
                  variant={mineOnly ? 'default' : 'outline'}
                  size="sm"
                  className={cn('gap-1.5 rounded-lg', mineOnly && 'shadow-[0_0_20px_-6px] shadow-primary')}
                  onClick={() => setMineOnly((v) => !v)}
                >
                  <Filter className="h-3.5 w-3.5" />
                  My shows
                  {mineOnly && trackedThisWeek > 0 && (
                    <span className="ml-0.5 rounded-full bg-primary-foreground/20 px-1.5 text-[10px] tabular-nums">
                      {trackedThisWeek}
                    </span>
                  )}
                </Button>
              )}

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5 rounded-lg">
                    <CalendarSearch className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Jump to date</span>
                    <span className="sm:hidden">Date</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="single"
                    selected={weekStart}
                    onSelect={(d) => {
                      if (!d) return;
                      setWeekStart(startOfWeek(d));
                      setMobileDay(d.getDay());
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              <div className="ml-auto flex items-center rounded-lg border border-white/[0.06] bg-black/30 p-0.5 sm:ml-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-md hover:bg-white/10"
                  onClick={() => shiftWeek(-1)}
                  aria-label="Previous week"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'h-8 rounded-md px-3 text-xs font-bold hover:bg-white/10',
                    isCurrentWeek && 'text-primary',
                  )}
                  onClick={goToday}
                >
                  Today
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-md hover:bg-white/10"
                  onClick={() => shiftWeek(1)}
                  aria-label="Next week"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- */}
        {/* Mobile day picker                                          */}
        {/* ---------------------------------------------------------- */}
        <div className="mb-3 grid grid-cols-7 gap-1 lg:hidden">
          {WEEKDAYS.map((wd, i) => {
            const date = new Date(weekStart.getTime() + i * DAY_MS);
            const active = i === mobileDay;
            const isToday = i === todayIdx;
            const count = days[i]?.length ?? 0;
            return (
              <button
                key={wd}
                type="button"
                onClick={() => setMobileDay(i)}
                className={cn(
                  'relative flex flex-col items-center rounded-xl border py-1.5 transition-all',
                  active
                    ? 'border-primary/50 bg-primary/15 text-primary'
                    : 'border-white/[0.06] bg-white/[0.03] text-muted-foreground hover:bg-white/[0.06]',
                )}
              >
                <span className="text-[9px] font-bold uppercase tracking-wider">{wd}</span>
                <span
                  className={cn(
                    'text-base font-black leading-tight',
                    isToday && !active && 'text-primary',
                    active && 'text-primary',
                    !active && !isToday && 'text-foreground',
                  )}
                >
                  {date.getDate()}
                </span>
                <span
                  className={cn(
                    'mt-0.5 h-1 w-1 rounded-full',
                    count > 0 ? (active ? 'bg-primary' : 'bg-muted-foreground/50') : 'bg-transparent',
                  )}
                />
                {isToday && (
                  <span className="absolute inset-x-3 top-0 h-0.5 rounded-b bg-primary" />
                )}
              </button>
            );
          })}
        </div>

        {/* ---------------------------------------------------------- */}
        {/* Body                                                       */}
        {/* ---------------------------------------------------------- */}
        {isLoading ? (
          <>
            <div className="hidden grid-cols-7 gap-2 lg:grid">
              {[3, 5, 4, 6, 3, 5, 4].map((rows, i) => (
                <DaySkeleton key={i} rows={rows} />
              ))}
            </div>
            <div className="lg:hidden">
              <DaySkeleton rows={5} />
            </div>
          </>
        ) : totalThisWeek === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] px-6 py-20 text-center">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.03]">
              {mineOnly ? (
                <Star className="h-6 w-6 text-muted-foreground" />
              ) : (
                <Sparkles className="h-6 w-6 text-muted-foreground" />
              )}
            </span>
            <h2 className="font-display text-lg font-bold">
              {mineOnly ? 'None of your shows air this week' : 'Nothing on the schedule'}
            </h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {mineOnly
                ? 'Pin more shows from their anime page, or turn off the filter to see everything airing.'
                : 'AniList has no airing data for this week yet. Try a different week.'}
            </p>
            {mineOnly && (
              <Button variant="outline" size="sm" className="mt-4" onClick={() => setMineOnly(false)}>
                Show all
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop week grid */}
            <div className="hidden grid-cols-7 gap-2 lg:grid">
              {days.map((_, i) => renderDay(i))}
            </div>

            {/* Mobile single day */}
            <div className="lg:hidden">
              <div className="mb-2 flex items-center justify-between px-1">
                <h2 className="font-display text-base font-bold">
                  {WEEKDAYS_LONG[mobileDay]}
                  {mobileDay === todayIdx && <span className="ml-2 text-xs text-primary">Today</span>}
                </h2>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {days[mobileDay].length} episode{days[mobileDay].length === 1 ? '' : 's'}
                </span>
              </div>
              {renderDay(mobileDay)}
            </div>
          </>
        )}

        {/* Sign-in nudge */}
        {!user && (
          <div className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
            <Star className="h-4 w-4 shrink-0 text-primary" />
            <p>
              <button className="font-semibold text-primary hover:underline" onClick={() => navigate('/auth')}>
                Sign in
              </button>{' '}
              and pin shows from their anime page to highlight them here.
            </p>
          </div>
        )}
      </main>

      <MobileNav />
    </div>
  );
}