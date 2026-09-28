// Pure helper: builds REAL month-by-month activity series from row timestamps.
// Replaces the fabricated trend data that multiplied current totals by a made-up
// factor. Every number here is bucketed from an actual created_at / watched_at.
//
// Followers-over-time is intentionally excluded: user_follows has no per-row
// timestamp we rely on for this, and the product decision was to leave it out.

export interface DatedRow {
  created_at?: string | null;
  watched_at?: string | null;
  updated_at?: string | null;
}

export interface HistoryLike extends DatedRow {
  completed?: boolean | null;
}

export interface MonthlyPoint {
  key: string; // "YYYY-MM"
  label: string; // "Jan", "Feb", ...
  episodes: number;
  chapters: number;
  ratings: number;
  comments: number;
  animeAdded: number;
  mangaAdded: number;
}

export interface CumulativePoint {
  key: string;
  label: string;
  anime: number;
  manga: number;
  ratings: number;
  comments: number;
}

export interface CompletionPoint {
  key: string;
  label: string;
  rate: number; // 0..100 completed-episode ratio for that month
}

export interface GrowthSeries {
  monthly: MonthlyPoint[];
  cumulative: CumulativePoint[];
  completionTrend: CompletionPoint[];
  hasData: boolean;
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function parseDate(row: DatedRow): Date | null {
  const raw = row?.watched_at || row?.created_at || row?.updated_at;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface GrowthInputs {
  history?: HistoryLike[];
  watchlist?: DatedRow[];
  mangaReadlist?: DatedRow[];
  ratings?: DatedRow[];
  comments?: DatedRow[];
}

export function computeMonthlySeries(inputs: GrowthInputs = {}, months = 12): GrowthSeries {
  const { history = [], watchlist = [], mangaReadlist = [], ratings = [], comments = [] } = inputs;

  // Build the ordered window of month buckets ending on the current month.
  const now = new Date();
  const window: { key: string; label: string; date: Date }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    window.push({ key: monthKey(d), label: MONTH_LABELS[d.getMonth()], date: d });
  }
  const indexByKey = new Map(window.map((m, i) => [m.key, i]));

  const monthly: MonthlyPoint[] = window.map((m) => ({
    key: m.key,
    label: m.label,
    episodes: 0,
    chapters: 0,
    ratings: 0,
    comments: 0,
    animeAdded: 0,
    mangaAdded: 0,
  }));
  const completedByMonth = new Array(window.length).fill(0);

  const bump = (row: DatedRow, field: keyof MonthlyPoint, onIndex?: (i: number) => void) => {
    const d = parseDate(row);
    if (!d) return;
    const idx = indexByKey.get(monthKey(d));
    if (idx === undefined) return;
    (monthly[idx][field] as number) += 1;
    onIndex?.(idx);
  };

  for (const row of history) {
    bump(row, 'episodes', (idx) => {
      if (row?.completed) completedByMonth[idx] += 1;
    });
  }
  for (const row of watchlist) bump(row, 'animeAdded');
  for (const row of mangaReadlist) bump(row, 'chapters'); // manga rows added ≈ reading activity
  for (const row of mangaReadlist) bump(row, 'mangaAdded');
  for (const row of ratings) bump(row, 'ratings');
  for (const row of comments) bump(row, 'comments');

  // Cumulative running totals across the window.
  const cumulative: CumulativePoint[] = [];
  let anime = 0;
  let manga = 0;
  let ratingsAcc = 0;
  let commentsAcc = 0;
  for (let i = 0; i < monthly.length; i++) {
    anime += monthly[i].animeAdded;
    manga += monthly[i].mangaAdded;
    ratingsAcc += monthly[i].ratings;
    commentsAcc += monthly[i].comments;
    cumulative.push({
      key: monthly[i].key,
      label: monthly[i].label,
      anime,
      manga,
      ratings: ratingsAcc,
      comments: commentsAcc,
    });
  }

  const completionTrend: CompletionPoint[] = monthly.map((m, i) => ({
    key: m.key,
    label: m.label,
    rate: m.episodes > 0 ? Math.round((completedByMonth[i] / m.episodes) * 100) : 0,
  }));

  const hasData = monthly.some(
    (m) => m.episodes || m.chapters || m.ratings || m.comments || m.animeAdded || m.mangaAdded,
  );

  return { monthly, cumulative, completionTrend, hasData };
}
