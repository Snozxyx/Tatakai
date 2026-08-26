/**
 * Central provider registry for the Toko extension.
 * Import provider lists from here to keep index.ts focused on runtime logic.
 */
import type { StreamProvider, TorrentProvider, MangaProvider } from '../types/index.js';

// ── Stream providers ──────────────────────────────────────────────────────────
// Order is priority order. It is the extension — not the app — that decides
// which server the watch page opens on: every result is stamped with
// `providerPriority` derived from its index below (see `providerPriorityOf`),
// and the progressive runner holds non-lead chunks back briefly so the lead
// provider's sources are the first the UI ever sees (see LEAD_STREAM_PROVIDERS).
//
// Keep `nebula` first — it resolves straight from an AniList id with no title
// search, so it is both the fastest and the most reliable first frame.
import nebula from './stream/justanime.js';
import animepahe from './stream/animepahe.js';
import animeya from './stream/animeya.js';
import toonstream from './stream/toonstream.js';
import animelok from './stream/animelok.js';
import watchanimeworld from './stream/watchanimeworld.js';
import aniworld from './stream/aniworld.js';
import senshi from './stream/senshi.js';
import reanime from './stream/reanime.js';
import fouranime from './stream/fouranime.js';
import anikoto from './stream/anikoto.js';
import animeheaven from './stream/animeheaven.js';
import anizone from './stream/anizone.js';
import animesalt from './stream/animesalt.js';
import animeblkom from './stream/animeblkom.js';
import desidub from './stream/desidub.js';
import mkissa from './stream/mkissa.js';

export const STREAM_PROVIDERS: StreamProvider[] = [
  nebula,
  animepahe,
  animeya,
  toonstream,
  animelok,
  watchanimeworld,
  aniworld,
  senshi,
  reanime,
  fouranime,
  anikoto,
  animeheaven,
  anizone,
  animesalt,
  animeblkom,
  desidub,
  mkissa,
];

// ── Torrent providers ─────────────────────────────────────────────────────────
import nyaa from './torrent/nyaa.js';
import acgrip from './torrent/acgrip.js';
import animetosho from './torrent/animetosho.js';
import subplease from './torrent/subplease.js';
import seadex from './torrent/seadex.js';
import nekobt from './torrent/nekobt.js';
import aniliberty from './torrent/aniliberty.js';
export const TORRENT_PROVIDERS: TorrentProvider[] = [
  nyaa,
  acgrip,
  animetosho,
  subplease,
  seadex,
  nekobt,
  aniliberty,
];

// ── Manga providers ───────────────────────────────────────────────────────────
import allmanga from './manga/allmanga.js';
import atsu from './manga/atsu.js';
import mangafire from './manga/mangafire.js';
import animesama from './manga/animesama.js';
import asura from './manga/asura.js';

export const MANGA_PROVIDERS: MangaProvider[] = [
  allmanga,
  atsu,
  mangafire,
  animesama,
  asura,
];

// ── Priority ──────────────────────────────────────────────────────────────────

/**
 * Providers that get a head start.
 *
 * `runProvidersProgressive` emits chunks in *completion* order under a 10-way
 * worker pool, and `sourcesAll` runs the stream and torrent pools concurrently —
 * so a provider's position in `STREAM_PROVIDERS` says nothing about when its
 * chunk arrives. Whichever site answers fastest on the day was landing first,
 * and the watch page, which maps sources positionally, autoplayed that one.
 *
 * Naming a provider here makes the runner emit its chunk before any other, so
 * the ordering the registry declares is the ordering the UI receives. The wait
 * is bounded (`LEAD_GRACE_MS` in provider-runner.ts): if the lead provider is
 * slow or empty, the rest are released rather than held.
 */
export const LEAD_STREAM_PROVIDERS: string[] = ['nebula'];

/**
 * Rank of a provider within its pool, lowest = highest priority.
 *
 * Stamped onto every `SourceResult` as `providerPriority` so ordering survives
 * the trip through the host, the SSE stream and the renderer's source list —
 * none of which preserve the order results were produced in. Torrent providers
 * are offset past the end of the stream list: a direct stream always outranks a
 * torrent, which needs a download before it plays. Unknown providers sort last.
 */
const STREAM_RANK = new Map(STREAM_PROVIDERS.map((p, i) => [p.name, i]));
const TORRENT_RANK = new Map(
  TORRENT_PROVIDERS.map((p, i) => [p.name, STREAM_PROVIDERS.length + i]),
);
const UNRANKED = STREAM_PROVIDERS.length + TORRENT_PROVIDERS.length + 1000;

export function providerPriorityOf(providerName: string | undefined | null): number {
  const name = String(providerName || '').trim().toLowerCase();
  if (!name) return UNRANKED;
  const stream = STREAM_RANK.get(name);
  if (stream !== undefined) return stream;
  const torrent = TORRENT_RANK.get(name);
  if (torrent !== undefined) return torrent;
  // Providers that suffix their name per language/server (`nebula-dub`,
  // `animepahe-1080p`) still belong to their base provider's rank.
  const base = name.split('-')[0];
  const baseStream = STREAM_RANK.get(base);
  if (baseStream !== undefined) return baseStream;
  const baseTorrent = TORRENT_RANK.get(base);
  return baseTorrent !== undefined ? baseTorrent : UNRANKED;
}
