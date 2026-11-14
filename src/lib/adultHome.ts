import { adultApi, type AdultHome, type AdultMedia } from './adultApi';
import { getAdultMode, getAdultModeRevision } from './adultMode';
import { resolveApiV3Base } from './api/backendOrigin';
import { matchesContentMode, normalizeAdultCategories, selectedAdultCategories } from './adultContentPolicy';

const unique = (rows: AdultMedia[]) => [...new Map(rows.map(row => [row.id, row])).values()];
function categories() {
  try { return selectedAdultCategories(normalizeAdultCategories(JSON.parse(localStorage.getItem('tatakai_content_safety') || '{}').adultCategories)); }
  catch { return selectedAdultCategories(normalizeAdultCategories(null)); }
}

/** Feed adapters keep the SFW page components and their motion unchanged. */
export async function readAdultHome(kind: 'anime' | 'manga' | 'novel') {
  if (getAdultMode() !== 'adult') throw new Error('Adult Mode is disabled');
  const revision = getAdultModeRevision();
  const [home, extra] = await Promise.all([
    adultApi<AdultHome>('home', { kind }),
    kind === 'anime' ? Promise.resolve({}) : fetch(resolveApiV3Base() + '/' + kind + '/home?adult=1').then(async response => { if (!response.ok) return {}; const json = await response.json(); return json.data ?? json; }).catch(() => ({})),
  ]);
  if (revision !== getAdultModeRevision()) throw new DOMException('Content mode changed', 'AbortError');
  const allowed = categories();
  const restrict = (rows: AdultMedia[] | undefined) => (rows || []).filter(row => matchesContentMode(row, 'adult', allowed));
  const spotlight = restrict(home.spotlight), trending = restrict(home.trending), popular = restrict(home.popular), latest = restrict(home.latest), top = restrict(home.top);
  const catalog = unique([...spotlight, ...trending, ...popular, ...latest, ...top]);
  return { spotlight, trending, popular, latest, top, pornhwa: restrict(home.pornhwa), catalog,
    newChapters: restrict((extra as any).newChapters), manhwa: restrict((extra as any).manhwa), manhua: restrict((extra as any).manhua),
    genres: [...new Set(catalog.flatMap(row => row.genres || []))], fetchedAt: Date.now(), trendingSource: home.trendingSource, trendingNote: home.trendingNote };
}

export function adultAnimeHomeBundle(home: Awaited<ReturnType<typeof readAdultHome>>) {
  return { spotlight: home.spotlight, trending: home.trending, popular: home.popular,
    topAiring: home.catalog.filter(row => row.status === 'RELEASING'),
    topUpcoming: home.catalog.filter(row => row.status === 'NOT_YET_RELEASED'),
    latestCompleted: home.catalog.filter(row => row.status === 'FINISHED'),
    top10: { today: home.trending.slice(0, 10), week: home.popular.slice(0, 10), month: home.top.slice(0, 10) },
    genres: home.genres, fetchedAt: home.fetchedAt, catalogRankings: true, trendingSource: home.trendingSource, trendingNote: home.trendingNote };
}

export function adultReadingHomeBundle(home: Awaited<ReturnType<typeof readAdultHome>>) {
  return { spotlight: home.spotlight, trending: home.trending, popular: home.popular, topRated: home.top,
    newChapters: home.newChapters, manhwa: home.manhwa, manhua: home.manhua,
    adultLatest: home.latest, adultPopular: home.pornhwa.length ? home.pornhwa : home.popular,
    genres: home.genres, fetchedAt: home.fetchedAt, trendingPending: false, trendingSource: home.trendingSource, trendingNote: home.trendingNote };
}
