// Pure helper: derives viewing-habit patterns from watch_history rows.
//
// Caveat: watch_history upserts per (user, episode), so watched_at reflects the
// LATEST watch of an episode, not every session. Metrics here are therefore
// "based on latest activity" approximations — the UI labels them as such.

export interface HistoryRow {
  watched_at?: string | null;
  updated_at?: string | null;
  anime_id?: string | null;
  episode_number?: number | null;
  duration_seconds?: number | null;
}

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface WatchingHabits {
  hourly: number[]; // length 24, activity count per local hour
  peakHour: number | null; // 0..23, null when no data
  peakHourLabel: string; // e.g. "10 PM – 12 AM", "" when no data
  byWeekday: number[]; // length 7, index 0 = Sunday
  mostActiveDay: string; // weekday name, "" when no data
  activeDays: number; // distinct local days with activity
  totalEvents: number;
  avgEpisodesPerActiveDay: number;
  uniqueAnime: number;
}

function hourRangeLabel(hour: number): string {
  const fmt = (h: number) => {
    const period = h < 12 ? 'AM' : 'PM';
    const base = h % 12 === 0 ? 12 : h % 12;
    return `${base} ${period}`;
  };
  const end = (hour + 2) % 24;
  return `${fmt(hour)} – ${fmt(end)}`;
}

export function computeWatchingHabits(history: HistoryRow[] = []): WatchingHabits {
  const hourly = new Array(24).fill(0);
  const byWeekday = new Array(7).fill(0);
  const dayKeys = new Set<string>();
  const animeIds = new Set<string>();
  let totalEvents = 0;

  for (const row of history || []) {
    const raw = row?.watched_at || row?.updated_at;
    if (!raw) continue;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) continue;

    hourly[d.getHours()] += 1;
    byWeekday[d.getDay()] += 1;
    dayKeys.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    if (row?.anime_id) animeIds.add(String(row.anime_id));
    totalEvents += 1;
  }

  let peakHour: number | null = null;
  let peakCount = 0;
  for (let h = 0; h < 24; h++) {
    if (hourly[h] > peakCount) {
      peakCount = hourly[h];
      peakHour = h;
    }
  }

  let mostActiveDayIdx = -1;
  let dayCount = 0;
  for (let d = 0; d < 7; d++) {
    if (byWeekday[d] > dayCount) {
      dayCount = byWeekday[d];
      mostActiveDayIdx = d;
    }
  }

  const activeDays = dayKeys.size;

  return {
    hourly,
    peakHour,
    peakHourLabel: peakHour === null ? '' : hourRangeLabel(peakHour),
    byWeekday,
    mostActiveDay: mostActiveDayIdx >= 0 ? WEEKDAY_LABELS[mostActiveDayIdx] : '',
    activeDays,
    totalEvents,
    avgEpisodesPerActiveDay: activeDays > 0 ? totalEvents / activeDays : 0,
    uniqueAnime: animeIds.size,
  };
}
