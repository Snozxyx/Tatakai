import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  CalendarDays, CalendarPlus, CalendarSearch, CalendarX, Check,
  ChevronDown, ChevronLeft, ChevronRight, Clock, Menu, Star, Tv,
} from "lucide-react";
import { ThemedSelect } from "@/components/ui/themed-select";
import { MangaReleaseCalendar } from "@/components/manga/MangaUpdatesDiscovery";
import { MobileNav } from "@/components/layout/MobileNav";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useAuth } from "@/contexts/AuthContext";
import { useIsDesktopApp } from "@/hooks/ui/useIsNativeApp";
import { useAiringSchedule, type AiringEntry } from "@/hooks/api/useAiringSchedule";
import { useTrackedShows, useToggleTrackedShowByAnilist } from "@/hooks/user/useTrackedShows";
import { calendarDateKey, calendarDay, parseCalendarDate, groupDailyAirings } from "@/lib/calendarDates";
import { useUiTranslation } from "@/hooks/ui/useUiTranslation";
import uiI18n from "@/lib/uiI18n";
import { cn } from "@/lib/utils";
import { contentGraph } from "@/core";
import { CalendarDateHeaders } from "@/components/calendar/CalendarDateHeaders";
import { CalendarArtwork, CalendarReleasePreview } from "@/components/calendar/CalendarReleasePreview";
import "./calendar-page.css";

const HOUR_HEIGHT = 72;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

function startOfWeek(base: Date): Date {
  const date = new Date(base);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - date.getDay());
  return date;
}

function formatTime(unix: number) {
  return new Date(unix * 1000).toLocaleTimeString(uiI18n.language, {
    hour: "numeric", minute: "2-digit",
  });
}

/** Simultaneous airings share a block. Nearby blocks get separate lanes. */
function layoutAirings(entries: AiringEntry[]) {
  const slots = groupDailyAirings(entries).flatMap(period => period.slots).map(slot => {
    const date = new Date(slot.airingAt * 1000);
    return { ...slot, minute: date.getHours() * 60 + date.getMinutes(), lane: 0, lanes: 1 };
  });
  let cluster: typeof slots = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;
  const finishCluster = () => cluster.forEach(slot => { slot.lanes = laneEnds.length; });
  for (const slot of slots) {
    if (slot.minute >= clusterEnd) {
      finishCluster();
      cluster = [];
      laneEnds = [];
    }
    const available = laneEnds.findIndex(end => end <= slot.minute);
    slot.lane = available < 0 ? laneEnds.length : available;
    laneEnds[slot.lane] = slot.minute + 60;
    clusterEnd = Math.max(...laneEnds);
    cluster.push(slot);
  }
  finishCluster();
  return slots;
}

function EntryCard({ entry, tracked, canTrack, onToggle, onOpen }: {
  entry: AiringEntry;
  tracked: boolean;
  canTrack: boolean;
  onToggle: (entry: AiringEntry, tracked: boolean) => void;
  onOpen: (entry: AiringEntry) => void;
}) {
  const { t } = useTranslation();
  const card = (
    <div className="calendar-entry">
      <button type="button" className="calendar-entry-open" onClick={() => onOpen(entry)}>
        {entry.coverImage ? <img src={entry.coverImage} alt="" loading="lazy" /> : <Tv aria-hidden="true" />}
        <span className="min-w-0">
          <span className="calendar-entry-title">{entry.title}</span>
          <span className="calendar-entry-meta">
            {t("app.episode_8669aa56")} {entry.episode}{entry.totalEpisodes ? ` / ${entry.totalEpisodes}` : ""} · {formatTime(entry.airingAt)}
          </span>
          <span className="calendar-entry-meta">{t(entry.airingAt * 1000 < Date.now() ? "calendarView.aired" : "calendarView.upcoming")}{entry.format ? ` · ${entry.format.replace(/_/g, " ")}` : ""}</span>
        </span>
      </button>
      {canTrack && (
        <button type="button" className={cn("calendar-entry-pin", tracked && "is-tracked")}
          aria-label={t(tracked ? "app.remove_from_calendar_b9650b4e" : "app.add_to_calendar_4f05cd64")}
          aria-pressed={tracked} onClick={() => onToggle(entry, tracked)}>
          {tracked ? <CalendarX aria-hidden="true" /> : <CalendarPlus aria-hidden="true" />}
        </button>
      )}
    </div>
  );
  if (!canTrack) return card;
  return <ContextMenu>
    <ContextMenuTrigger asChild>{card}</ContextMenuTrigger>
    <ContextMenuContent>
      <ContextMenuItem onClick={() => onToggle(entry, tracked)}>
        {tracked ? <CalendarX className="mr-2 size-4" /> : <CalendarPlus className="mr-2 size-4" />}
        {t(tracked ? "app.remove_from_calendar_b9650b4e" : "app.add_to_calendar_4f05cd64")}
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>;
}

export default function CalendarPage() {
  const { t } = useTranslation();
  useUiTranslation();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isDesktopApp = useIsDesktopApp();
  const view = params.get("view") === "week" ? "week" : "day";
  const mediaTab = params.get("media") === "manga" ? "manga" : "anime";
  const initialDate = parseCalendarDate(params.get("date")) || new Date();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(initialDate));
  const [selectedDay, setSelectedDay] = useState(() => initialDate.getDay());
  const [month, setMonth] = useState(initialDate);
  const [mineOnly, setMineOnly] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const timelineRef = useRef<HTMLDivElement>(null);
  const selectedDate = calendarDay(weekStart, selectedDay);
  const selectedKey = calendarDateKey(selectedDate);

  const selectDate = (date: Date) => {
    setWeekStart(startOfWeek(date));
    setSelectedDay(date.getDay());
    setMonth(date);
    setParams(previous => {
      const next = new URLSearchParams(previous);
      next.set("date", calendarDateKey(date));
      return next;
    });
  };
  useEffect(() => {
    const date = parseCalendarDate(params.get("date"));
    if (date) {
      setWeekStart(startOfWeek(date));
      setSelectedDay(date.getDay());
      setMonth(date);
    }
  }, [params]);
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const { data: entries = [], isLoading, isError, refetch } = useAiringSchedule(weekStart);
  const { data: tracked = [] } = useTrackedShows();
  const toggleTrack = useToggleTrackedShowByAnilist();
  const trackedIds = useMemo(() => new Set(tracked.map(show => show.anilist_id)
    .filter((id): id is number => typeof id === "number")), [tracked]);
  const days = useMemo(() => {
    const buckets: AiringEntry[][] = Array.from({ length: 7 }, () => []);
    const keys = buckets.map((_, index) => calendarDateKey(calendarDay(weekStart, index)));
    for (const entry of entries) {
      if (mineOnly && !trackedIds.has(entry.mediaId)) continue;
      const index = keys.indexOf(calendarDateKey(new Date(entry.airingAt * 1000)));
      if (index >= 0) buckets[index].push(entry);
    }
    buckets.forEach(bucket => bucket.sort((a, b) => a.airingAt - b.airingAt));
    return buckets;
  }, [entries, weekStart, mineOnly, trackedIds]);
  const visibleDays = view === "day" ? [selectedDay] : [0, 1, 2, 3, 4, 5, 6];
  const today = new Date(now);
  const todayKey = calendarDateKey(today);
  const total = visibleDays.reduce((count, day) => count + days[day].length, 0);
  const nextEntry = visibleDays.flatMap(day => days[day])
    .filter(entry => entry.airingAt * 1000 >= now).sort((a, b) => a.airingAt - b.airingAt)[0];
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const offset = -today.getTimezoneOffset();
  const zoneLabel = `GMT${offset >= 0 ? "+" : "−"}${Math.floor(Math.abs(offset) / 60)}${Math.abs(offset) % 60 ? `:${String(Math.abs(offset) % 60).padStart(2, "0")}` : ""}`;
  const rangeLabel = view === "day"
    ? selectedDate.toLocaleDateString(uiI18n.language, { month: "long", day: "numeric", year: "numeric" })
    : selectedDate.toLocaleDateString(uiI18n.language, { month: "long", year: "numeric" });

  // Open at daytime, while keeping overnight episodes reachable above it.
  useEffect(() => {
    if (timelineRef.current) timelineRef.current.scrollTop = 7 * HOUR_HEIGHT;
  }, [selectedKey, view, mediaTab]);

  const handleToggle = (entry: AiringEntry, isTracked: boolean) => toggleTrack.mutate({
    anilistId: entry.mediaId, title: entry.title, imageUrl: entry.coverImage, tracked: isTracked,
  });
  const handleOpen = async (entry: AiringEntry) => {
    try {
      const media = await contentGraph.getMedia(`anilist-${entry.mediaId}`);
      const baseId = media.tatakaiId || `anilist-${entry.mediaId}`;
      navigate(`/watch/${encodeURIComponent(`${baseId}?ep=${entry.episode}`)}`);
    } catch {
      navigate(`/anime/anilist-${entry.mediaId}`);
    }
  };
  const setMediaTab = (media: "anime" | "manga") => setParams(previous => {
    const next = new URLSearchParams(previous);
    next.set("media", media);
    return next;
  });
  const datePicker = <Calendar mode="single" selected={selectedDate} month={month}
    onMonthChange={setMonth} onSelect={date => date && selectDate(date)}
    className="calendar-mini" classNames={{
      caption: "calendar-mini-caption", caption_label: "rdp-caption_label",
      nav_button: "rdp-nav_button", nav_button_previous: "rdp-nav_button_previous",
      nav_button_next: "rdp-nav_button_next", head_cell: "rdp-head_cell",
      cell: "rdp-cell", day: "rdp-day", row: "rdp-row", day_selected: "rdp-day_selected",
      day_today: "rdp-day_today", day_outside: "rdp-day_outside",
    }} />;

  return (
    <div className="calendar-page">
      <main className={cn("calendar-shell", !isDesktopApp && "calendar-shell-web")}>
        <header className="calendar-toolbar">
          <div className="calendar-brand">
            <Button variant="ghost" size="icon" className="calendar-icon-button calendar-menu-button"
              aria-label={t("calendarView.toggleSidebar", { defaultValue: "Toggle calendar sidebar" })}
              aria-expanded={sidebarOpen} aria-controls="calendar-sidebar"
              onClick={() => setSidebarOpen(open => !open)}><Menu aria-hidden="true" /></Button>
            <CalendarDays className="calendar-brand-icon" aria-hidden="true" />
            <h1>{t("calendarView.title", { defaultValue: "Calendar" })}</h1>
          </div>
          <div className="calendar-navigation">
            <Button variant="outline" className="calendar-today" onClick={() => selectDate(new Date())}>
              {t("app.today_24345a14")}
            </Button>
            <Button variant="ghost" size="icon" className="calendar-icon-button"
              aria-label={t(view === "day" ? "calendarView.previousDay" : "app.previous_week_c4970e09")}
              onClick={() => selectDate(calendarDay(selectedDate, view === "day" ? -1 : -7))}>
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="icon" className="calendar-icon-button"
              aria-label={t(view === "day" ? "calendarView.nextDay" : "app.next_week_5a20763a")}
              onClick={() => selectDate(calendarDay(selectedDate, view === "day" ? 1 : 7))}>
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
          <Popover>
            <PopoverTrigger asChild><button type="button" className="calendar-range calendar-range-picker"
              aria-label={t("app.jump_to_date_288a6887")}>
              <span aria-live="polite">{rangeLabel}</span><ChevronDown aria-hidden="true" />
            </button></PopoverTrigger>
            <PopoverContent className="w-auto p-3" align="start">
              {datePicker}
              <label className="calendar-date-input">{t("app.jump_to_date_288a6887")}
                <input type="date" value={selectedKey} onChange={event => {
                  const date = parseCalendarDate(event.target.value);
                  if (date) selectDate(date);
                }} />
              </label>
            </PopoverContent>
          </Popover>
          <div className="calendar-toolbar-end">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="calendar-icon-button"
                  aria-label={t("app.jump_to_date_288a6887")}><CalendarSearch aria-hidden="true" /></Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-3" align="end">{datePicker}</PopoverContent>
            </Popover>
            <ThemedSelect aria-label={t("calendarView.layout")} value={view} className="calendar-view-select"
              onChange={event => setParams(previous => {
                const next = new URLSearchParams(previous);
                next.set("view", event.target.value);
                next.set("date", selectedKey);
                return next;
              })}>
              <option value="day">{t("calendarView.day")}</option>
              <option value="week">{t("calendarView.week")}</option>
            </ThemedSelect>
          </div>
        </header>

        <div className={cn("calendar-workspace", !sidebarOpen && "calendar-sidebar-hidden")}>
          <aside id="calendar-sidebar" className="calendar-sidebar" aria-label={t("discovery.calendarType")}>
            <Button variant="secondary" className="calendar-browse" onClick={() => navigate("/search")}>
              <CalendarPlus aria-hidden="true" />{t("app.add_to_calendar_4f05cd64")}
            </Button>
            {datePicker}
            <div className="calendar-sidebar-section">
              <h2>{t("discovery.calendarType")}</h2>
              <div className="calendar-types" role="group" aria-label={t("discovery.calendarType")}>
                {(["anime", "manga"] as const).map(media => (
                  <button type="button" key={media} aria-pressed={mediaTab === media}
                    className={cn("calendar-filter-row", mediaTab === media && "is-selected")}
                    onClick={() => setMediaTab(media)}>
                    <span className={cn("calendar-check", media === "manga" && "calendar-check-manga")}>
                      {mediaTab === media && <Check aria-hidden="true" />}
                    </span>
                    {t(media === "anime" ? "discovery.anime" : "discovery.mangaReleases")}
                  </button>
                ))}
              </div>
            </div>
            {mediaTab === "anime" && <div className="calendar-sidebar-section">
              <h2>{t("app.my_shows_739eef73")}</h2>
              {user ? <label className="calendar-filter-row calendar-tracked-filter">
                <input type="checkbox" checked={mineOnly} onChange={event => setMineOnly(event.target.checked)} />
                <Star aria-hidden="true" />
                <span>{t("app.my_shows_739eef73")}</span>
                <span className="calendar-filter-count">{tracked.length}</span>
              </label> : <p className="calendar-sidebar-hint">
                <button type="button" onClick={() => navigate("/auth")}>{t("app.sign_in_ada2e9e9")}</button>{" "}
                {t("app.and_pin_shows_from_their_anime_page_to_highlight_d6f7f7e8")}
              </p>}
              {user && <p className="calendar-sidebar-hint">{t("app.pin_more_shows_from_their_anime_page_or_turn_off_50d99c50")}</p>}
            </div>}
            <div className="calendar-sidebar-footer">
              <span><Clock aria-hidden="true" />{timeZone.replace(/_/g, " ")}</span>
              {mediaTab === "anime" && <span>{isLoading ? "…" : total} {t("app.episodes_49d641ba")}</span>}
            </div>
          </aside>

          <section className="calendar-board" aria-label={rangeLabel}>
            <nav className="calendar-date-strip" aria-label={t("calendarView.chooseDate")}>
              {Array.from({ length: 7 }, (_, day) => {
                const date = calendarDay(weekStart, day);
                return <button type="button" key={day} aria-pressed={selectedKey === calendarDateKey(date)}
                  aria-label={date.toLocaleDateString(uiI18n.language, { dateStyle: "full" })}
                  onClick={() => selectDate(date)}>
                  <span>{date.toLocaleDateString(uiI18n.language, { weekday: "short" })}</span>
                  <span>{date.toLocaleDateString(uiI18n.language, { month: "short", day: "numeric" })}</span>
                </button>;
              })}
            </nav>
            <div className="calendar-mobile-types" role="group" aria-label={t("discovery.calendarType")}>
              <button type="button" aria-pressed={mediaTab === "anime"} onClick={() => setMediaTab("anime")}>{t("discovery.anime")}</button>
              <button type="button" aria-pressed={mediaTab === "manga"} onClick={() => setMediaTab("manga")}>{t("discovery.mangaReleases")}</button>
              {user && mediaTab === "anime" && <button type="button" aria-pressed={mineOnly} onClick={() => setMineOnly(value => !value)}>{t("app.my_shows_739eef73")}</button>}
            </div>
            {mediaTab === "manga" ?
              <MangaReleaseCalendar weekStart={weekStart} selectedDay={view === "day" ? selectedDay : undefined} onSelectDate={selectDate} />
             : <>
              {(isError || (!isLoading && total === 0)) && <div className="calendar-status" role={isError ? "alert" : "status"}>
                <Tv aria-hidden="true" />
                <span>{isError ? t("favoritesHub.unavailable") : mineOnly
                  ? t("app.none_of_your_shows_air_this_week_5fe3bd92") : t("app.nothing_airing_f2a424a3")}</span>
                {isError && <Button variant="outline" size="sm" onClick={() => void refetch()}>{t("favoritesHub.retry")}</Button>}
                {!isError && mineOnly && <Button variant="ghost" size="sm" onClick={() => setMineOnly(false)}>{t("app.show_all_50a279de")}</Button>}
              </div>}
              <div ref={timelineRef} className="calendar-timeline-scroll" tabIndex={0}
                aria-label={t("calendarView.dailySchedule")} aria-busy={isLoading}>
                <CalendarDateHeaders weekStart={weekStart} days={visibleDays} todayKey={todayKey} label={zoneLabel} onSelect={selectDate} />
                <div className={cn("calendar-time-grid", view === "week" && "calendar-week")}
                  style={{ gridTemplateColumns: `64px repeat(${visibleDays.length}, minmax(0, 1fr))`, height: 25 * HOUR_HEIGHT }}>
                  <div className="calendar-time-labels">
                    {HOURS.map(hour => <time key={hour} style={{ top: hour * HOUR_HEIGHT }}>
                      {new Date(2026, 0, 1, hour).toLocaleTimeString(uiI18n.language, { hour: "numeric" })}
                    </time>)}
                  </div>
                  {visibleDays.map(day => <div className="calendar-day-column" key={day}>
                    {HOURS.map(hour => <div className="calendar-hour-line" key={hour} style={{ top: hour * HOUR_HEIGHT }} />)}
                    {isLoading ? <div className="calendar-loading" role="status">{t("calendarView.loading", { defaultValue: "Loading schedule…" })}</div>
                      : layoutAirings(days[day]).map(slot => {
                        const saved = slot.entries.some(entry => trackedIds.has(entry.mediaId));
                        const upcoming = slot.entries.some(entry => entry.id === nextEntry?.id);
                        const position = { top: slot.minute / 60 * HOUR_HEIGHT + 2, height: HOUR_HEIGHT - 4,
                          left: `calc(${slot.lane / slot.lanes * 100}% + 4px)`, width: `calc(${100 / slot.lanes}% - 8px)` };
                        const event = <button type="button" className={cn("calendar-event", saved && "is-tracked", upcoming && "is-next", slot.airingAt * 1000 < now && "is-past")}
                          aria-label={slot.entries.map(entry => `${entry.title}, ${t("app.episode_8669aa56")} ${entry.episode}, ${formatTime(entry.airingAt)}`).join("; ")}>
                          <CalendarArtwork src={slot.entries[0].bannerImage || slot.entries[0].coverImage} />
                          <span className="calendar-event-title">{slot.entries[0].title}</span>
                          <span className="calendar-event-meta">{formatTime(slot.airingAt)} · {t("app.ep_881baaed")} {slot.entries[0].episode}</span>
                          <span className="calendar-event-detail">
                            {saved && <Star aria-hidden="true" />}
                            {slot.entries.length > 1 ? t("calendarView.moreAirings", { defaultValue: "+{{count}} more", count: slot.entries.length - 1 })
                              : upcoming ? t("calendarView.nextUp") : slot.entries[0].format?.replace(/_/g, " ")}
                          </span>
                        </button>;
                        return <div key={slot.airingAt} className="calendar-event-container" style={position}>
                          <CalendarReleasePreview trigger={event}>
                            <div className="calendar-preview-banner">
                              <CalendarArtwork src={slot.entries[0].bannerImage || slot.entries[0].coverImage} />
                              <span>{new Date(slot.airingAt * 1000).toLocaleDateString(uiI18n.language, { month: "short", day: "numeric" })} · {formatTime(slot.airingAt)}</span>
                            </div>
                            <div className="calendar-preview-body">
                              <h3>{t("calendarView.releaseDetails")}</h3>
                              {slot.entries.map(entry => <EntryCard key={entry.id} entry={entry} tracked={trackedIds.has(entry.mediaId)}
                                canTrack={!!user} onToggle={handleToggle} onOpen={handleOpen} />)}
                            </div>
                          </CalendarReleasePreview>
                          {user && slot.entries.length === 1 && <button type="button" className="calendar-event-pin"
                            aria-label={t(saved ? "app.remove_from_calendar_b9650b4e" : "app.add_to_calendar_4f05cd64")}
                            aria-pressed={saved} onClick={() => handleToggle(slot.entries[0], saved)}>
                            {saved ? <CalendarX aria-hidden="true" /> : <CalendarPlus aria-hidden="true" />}
                          </button>}
                        </div>;
                      })}
                    {calendarDateKey(calendarDay(weekStart, day)) === todayKey && <div className="calendar-now-line"
                      style={{ top: (today.getHours() + today.getMinutes() / 60) * HOUR_HEIGHT }} aria-hidden="true" />}
                  </div>)}
                </div>
              </div>
            </>}
          </section>
        </div>
      </main>
      <MobileNav />
    </div>
  );
}
