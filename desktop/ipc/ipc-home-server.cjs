'use strict';

const path = require('path');
const fs = require('fs');
const { createHomeServerRuntime } = require('../runtime/home-server/index.cjs');

const TATAKAI_API_BASE = (process.env.VITE_TATAKAI_API_URL || 'https://api.tatakai.app/api/v3').replace(/\/+$/, '');

function currentAniListSeason(now = new Date()) {
  const month = now.getMonth() + 1;
  if (month <= 3) return 'WINTER';
  if (month <= 6) return 'SPRING';
  if (month <= 9) return 'SUMMER';
  return 'FALL';
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs) || 15_000);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'X-Tatakai-Client': 'home-server',
        'X-Tatakai-Version': '6.0.0',
        ...(options.headers || {}),
      },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.message || json?.error || `HTTP ${res.status}`);
    if (json?.status === 'ok') return json.data;
    if (json?.success === true && Object.prototype.hasOwnProperty.call(json, 'data')) return json.data;
    if (Object.prototype.hasOwnProperty.call(json, 'data')) return json.data;
    return json;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchTatakaiApi(apiPath, query = {}, apiBase = TATAKAI_API_BASE) {
  const base = String(apiBase || TATAKAI_API_BASE).replace(/\/+$/, '');
  const url = new URL(`${base}/${String(apiPath || '').replace(/^\/+/, '')}`);
  for (const [key, value] of Object.entries(query || {})) {
    if (value == null || value === '') continue;
    url.searchParams.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  return fetchJson(url.href);
}

const ANILIST_MEDIA_FIELDS = `
  id
  idMal
  title { romaji english native userPreferred }
  coverImage { extraLarge large medium color }
  bannerImage
  description(asHtml: false)
  episodes
  duration
  format
  status
  season
  seasonYear
  averageScore
  meanScore
  popularity
  favourites
  genres
  synonyms
  isAdult
  countryOfOrigin
  startDate { year month day }
  nextAiringEpisode { episode airingAt timeUntilAiring }
  streamingEpisodes { title thumbnail url site }
  studios { edges { isMain node { id name siteUrl } } }
`;

async function queryAniList(query, variables = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18_000);
  let json;
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Tatakai-Client': 'home-server',
        'X-Tatakai-Version': '6.0.0',
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
    json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.errors?.[0]?.message || json?.error || `HTTP ${res.status}`);
  } finally {
    clearTimeout(timeout);
  }
  if (json?.errors?.length) throw new Error(json.errors[0]?.message || 'anilist_error');
  return json?.data || {};
}

function normalizeAniListMedia(media) {
  if (!media) return null;
  const title = media.title || {};
  return {
    anilistId: media.id,
    malId: media.idMal || undefined,
    tatakaiId: media.id ? `anilist:${media.id}` : undefined,
    titleRomaji: title.romaji || title.userPreferred || title.english || 'Untitled',
    titleEnglish: title.english || undefined,
    titleNative: title.native || undefined,
    synonyms: Array.isArray(media.synonyms) ? media.synonyms : [],
    coverImageLarge: media.coverImage?.extraLarge || media.coverImage?.large || media.coverImage?.medium || '',
    coverImageMedium: media.coverImage?.medium || media.coverImage?.large || '',
    bannerImage: media.bannerImage || '',
    color: media.coverImage?.color || undefined,
    format: media.format || undefined,
    status: media.status || undefined,
    season: media.season || undefined,
    seasonYear: media.seasonYear || undefined,
    episodes: media.episodes || undefined,
    duration: media.duration || undefined,
    startDate: media.startDate || undefined,
    description: media.description || '',
    averageScore: media.averageScore || undefined,
    meanScore: media.meanScore || undefined,
    popularity: media.popularity || undefined,
    favourites: media.favourites || undefined,
    genres: Array.isArray(media.genres) ? media.genres : [],
    isAdult: Boolean(media.isAdult),
    countryOfOrigin: media.countryOfOrigin || undefined,
    nextAiringEpisode: media.nextAiringEpisode || undefined,
    streamingEpisodes: Array.isArray(media.streamingEpisodes) ? media.streamingEpisodes : [],
    studios: (media.studios?.edges || []).map((edge) => ({
      id: edge?.node?.id,
      name: edge?.node?.name,
      isMain: Boolean(edge?.isMain),
      siteUrl: edge?.node?.siteUrl,
    })).filter((row) => row.id && row.name),
    tags: [],
    source_api: 'anilist',
    fetchedAt: Date.now(),
  };
}

async function fetchAniListHomeFallback() {
  const season = currentAniListSeason();
  const seasonYear = new Date().getFullYear();
  const query = `
    query Home($season: MediaSeason, $seasonYear: Int) {
      trending: Page(page: 1, perPage: 10) {
        media(type: ANIME, sort: TRENDING_DESC, isAdult: false) { ${ANILIST_MEDIA_FIELDS} }
      }
      popular: Page(page: 1, perPage: 10) {
        media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) { ${ANILIST_MEDIA_FIELDS} }
      }
      seasonal: Page(page: 1, perPage: 12) {
        media(type: ANIME, sort: POPULARITY_DESC, season: $season, seasonYear: $seasonYear, isAdult: false) { ${ANILIST_MEDIA_FIELDS} }
      }
      upcoming: Page(page: 1, perPage: 12) {
        media(type: ANIME, sort: POPULARITY_DESC, status: NOT_YET_RELEASED, isAdult: false) { ${ANILIST_MEDIA_FIELDS} }
      }
      GenreCollection
    }
  `;
  const data = await queryAniList(query, { season, seasonYear });
  const trending = (data.trending?.media || []).map(normalizeAniListMedia).filter(Boolean);
  const popular = (data.popular?.media || []).map(normalizeAniListMedia).filter(Boolean);
  const seasonal = (data.seasonal?.media || []).map(normalizeAniListMedia).filter(Boolean);
  const upcoming = (data.upcoming?.media || []).map(normalizeAniListMedia).filter(Boolean);
  const topAiring = seasonal.filter((row) => row.status === 'RELEASING');
  const latestCompleted = seasonal.filter((row) => row.status === 'FINISHED');
  return {
    spotlight: trending.slice(0, 8),
    trending,
    topAiring: topAiring.length ? topAiring : trending.slice(0, 10),
    popular,
    topUpcoming: upcoming,
    latestCompleted: latestCompleted.length ? latestCompleted : popular.slice(0, 10),
    top10: {
      today: trending.slice(0, 10),
      week: popular.slice(0, 10),
      month: seasonal.slice(0, 10),
    },
    genres: Array.isArray(data.GenreCollection) ? data.GenreCollection.slice(0, 40) : [],
    fetchedAt: Date.now(),
  };
}

async function fetchAniListSearchFallback(params = {}) {
  const query = `
    query Search($page: Int, $perPage: Int, $search: String, $genres: [String], $sort: [MediaSort]) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { total perPage currentPage lastPage hasNextPage }
        media(type: ANIME, search: $search, genre_in: $genres, sort: $sort, isAdult: false) { ${ANILIST_MEDIA_FIELDS} }
      }
    }
  `;
  const data = await queryAniList(query, {
    page: Number(params.page) || 1,
    perPage: Number(params.perPage) || 24,
    search: params.q || params.query || undefined,
    genres: params.genres ? String(params.genres).split(',').filter(Boolean) : undefined,
    sort: [params.sort || (params.q || params.query ? 'SEARCH_MATCH' : 'POPULARITY_DESC')],
  });
  return {
    media: (data.Page?.media || []).map(normalizeAniListMedia).filter(Boolean),
    pageInfo: data.Page?.pageInfo || { currentPage: Number(params.page) || 1, hasNextPage: false },
  };
}

async function fetchAniListMediaFallback(id) {
  const query = `
    query Media($id: Int!) {
      Media(id: $id, type: ANIME) { ${ANILIST_MEDIA_FIELDS} }
    }
  `;
  const data = await queryAniList(query, { id: Number(id) });
  return normalizeAniListMedia(data.Media);
}

function buildEpisodeList(media) {
  const streaming = Array.isArray(media?.streamingEpisodes) ? media.streamingEpisodes : [];
  if (streaming.length > 0) {
    return streaming.map((ep, idx) => ({
      id: ep.url || `${media.anilistId || media.tatakaiId}?ep=${idx + 1}`,
      number: idx + 1,
      title: ep.title || `Episode ${idx + 1}`,
      thumbnail: ep.thumbnail || null,
      site: ep.site || null,
    }));
  }
  const count = Math.min(Number(media?.episodes || 0), 2000);
  return Array.from({ length: count }, (_row, idx) => ({
    id: `${media?.tatakaiId || media?.anilistId || 'anime'}?ep=${idx + 1}`,
    number: idx + 1,
    title: `Episode ${idx + 1}`,
  }));
}

/**
 * Home Server IPC: start/stop/config + HTTP adapters for library/downloads/extensions.
 */
module.exports = function registerHomeServerIpc(
  ipcMain,
  app,
  fsApi,
  pathApi,
  logger,
  getMainWindow,
  { getExtensionRuntime, getTorrentFacade } = {},
) {
  const fsMod = fsApi || fs;
  const pathMod = pathApi || path;
  let runtime = null;

  function catalogApiBase() {
    return String(runtime?.store?.read?.()?.catalogApiBase || TATAKAI_API_BASE).replace(/\/+$/, '');
  }

  function isVideoFile(filePath) {
    return ['.mp4', '.mkv', '.webm', '.avi', '.mov', '.m4v'].includes(pathMod.extname(String(filePath || '')).toLowerCase());
  }

  function readOfflineLibrary() {
    const downloadPath = pathMod.join(app.getPath('videos'), 'Tatakai');
    if (!fsMod.existsSync(downloadPath)) return [];
    const library = [];
    const animeDirs = fsMod
      .readdirSync(downloadPath)
      .filter((f) => {
        try {
          return fsMod.statSync(pathMod.join(downloadPath, f)).isDirectory();
        } catch {
          return false;
        }
      });

    for (const dirName of animeDirs) {
      const animeDir = pathMod.join(downloadPath, dirName);
      const manifestPath = pathMod.join(animeDir, 'manifest.json');
      let manifest = { animeName: dirName, episodes: [] };
      try {
        if (fsMod.existsSync(manifestPath)) {
          manifest = JSON.parse(fsMod.readFileSync(manifestPath, 'utf8'));
        }
      } catch {
        /* ignore */
      }
      if (!Array.isArray(manifest.episodes) || manifest.episodes.length === 0) {
        const videoFiles = fsMod.readdirSync(animeDir).filter((file) => isVideoFile(file));
        manifest.episodes = videoFiles.map((file, index) => ({
          id: `auto-${dirName}-${index + 1}`,
          number: index + 1,
          file,
          synced: true,
        }));
      }
      const animeName = manifest.animeName || dirName;
      const episodes = (manifest.episodes || []).filter((ep) => {
        if (!ep?.file || !isVideoFile(ep.file)) return false;
        const fullPath = pathMod.join(animeDir, ep.file);
        return fsMod.existsSync(fullPath);
      }).map((ep) => {
        const episodeKey = String(ep.number ?? ep.id ?? ep.file ?? '');
        const subtitles = (Array.isArray(ep.subtitles) ? ep.subtitles : []).map((sub, index) => ({
          label: sub.label || sub.lang || sub.language || `Subtitle ${index + 1}`,
          language: sub.language || sub.lang || 'en',
          default: Boolean(sub.default || index === 0),
          file: sub.file || null,
          originalUrl: sub.url || null,
          url: `/api/home/catalog/${encodeURIComponent(animeName)}/subtitle/${encodeURIComponent(episodeKey)}/${index}`,
        }));
        return {
          id: ep.id,
          number: ep.number,
          file: ep.file,
          title: ep.title || null,
          subtitles,
          // For MKV files without extracted subtitles, provide extraction endpoint
          // The home server client can probe /api/home/catalog/:name/extract-subtitle/:ep/:track
          supportsEmbeddedSubtitles: /\.(mkv|avi|mov)$/i.test(ep.file || ''),
          audioLanguage: ep.audioLanguage || null,
        };
      });
      library.push({
        name: animeName,
        title: animeName,
        anilistId: manifest.anilistId || manifest.anilistID || manifest.anilist_id || null,
        malId: manifest.malId || manifest.malID || manifest.mal_id || null,
        // For home server web clients, use the HTTP poster endpoint
        poster: `/api/home/catalog/${encodeURIComponent(animeName)}/poster`,
        posterOriginal: manifest.poster || manifest.posterUrl || manifest.animePoster || null,
        bannerImage: manifest.bannerImage || null,
        path: animeDir,
        episodeCount: episodes.length,
        episodes,
      });
    }
    return library;
  }

  function getLoadedExtensionIds(runtime, preferredIds) {
    const loaded = runtime?.registry?.listLoaded?.() || [];
    if (!Array.isArray(preferredIds) || preferredIds.length === 0) return loaded;
    const wanted = preferredIds.map((id) => String(id)).filter(Boolean);
    return loaded.filter((id) => wanted.includes(id));
  }

  function buildSourceOptions(payload = {}) {
    const media = payload.media && typeof payload.media === 'object' ? payload.media : {};
    const titles = [
      payload.animeName,
      media.titleRomaji,
      media.titleEnglish,
      media.titleNative,
      ...(Array.isArray(media.synonyms) ? media.synonyms : []),
      ...(Array.isArray(payload.titles) ? payload.titles : []),
    ]
      .map((title) => String(title || '').trim())
      .filter(Boolean);
    const category = String(payload.category || payload.languageMode || 'sub').toLowerCase();
    const preferredLanguages = Array.isArray(payload.preferredLanguages)
      ? payload.preferredLanguages
      : category === 'dub'
        ? ['en', 'dub']
        : ['ja', 'sub'];

    return {
      anilistId: Number(payload.anilistId || media.anilistId || media.id || 0) || 0,
      titles: Array.from(new Set(titles)),
      episode: Number(payload.episodeNumber || payload.episode || 0) || undefined,
      episodeCount: Number(payload.episodeCount || media.episodes || 0) || undefined,
      resolution: String(payload.resolution || '1080p'),
      tatakaiId: payload.tatakaiId || media.tatakaiId || undefined,
      preferredLanguage: String(preferredLanguages[0] || category),
      preferredLanguages,
      exclusions: Array.isArray(payload.exclusions) ? payload.exclusions : [],
    };
  }

  const adapters = {
    async getCatalogHome() {
      try {
        return await fetchTatakaiApi('/content/home', {}, catalogApiBase());
      } catch (err) {
        logger?.warn?.('[HomeServer] catalog home fallback to AniList:', err?.message || err);
        return fetchAniListHomeFallback();
      }
    },
    async searchCatalog(params = {}) {
      const query = {
        q: params.q || params.query || '',
        page: Number(params.page) || 1,
        perPage: Number(params.perPage) || 24,
        genres: params.genres || undefined,
        format: params.format || undefined,
        status: params.status || undefined,
        sort: params.sort || (params.q || params.query ? 'SEARCH_MATCH' : 'POPULARITY_DESC'),
        isAdult: params.isAdult === 'true' ? 'true' : 'false',
      };
      try {
        return await fetchTatakaiApi('/content/search', query, catalogApiBase());
      } catch (err) {
        logger?.warn?.('[HomeServer] catalog search fallback to AniList:', err?.message || err);
        return fetchAniListSearchFallback(query);
      }
    },
    async getCatalogMedia(id) {
      try {
        const media = await fetchTatakaiApi(
          `/content/by-anilist/${encodeURIComponent(String(id))}`,
          {},
          catalogApiBase(),
        );
        return { ...media, episodesList: buildEpisodeList(media) };
      } catch (err) {
        logger?.warn?.('[HomeServer] media fallback to AniList:', err?.message || err);
        const media = await fetchAniListMediaFallback(id);
        return media ? { ...media, episodesList: buildEpisodeList(media) } : null;
      }
    },
    async getLibrary() {
      return readOfflineLibrary();
    },
    async getDownloads() {
      return {
        libraryRoot: pathMod.join(app.getPath('videos'), 'Tatakai'),
        items: readOfflineLibrary().flatMap((anime) =>
          (anime.episodes || []).map((ep) => ({
            anime: anime.name,
            episode: ep.number,
            file: ep.file,
            status: 'completed',
          })),
        ),
      };
    },
    async listExtensions() {
      const runtime = getExtensionRuntime?.() || {};
      const ids = runtime.registry?.listLoaded?.() || [];
      return ids.map((id) => {
        const entry = runtime.registry.lookup(id);
        return {
          id,
          name: entry?.manifest?.name || id,
          version: entry?.manifest?.version || null,
          type: entry?.manifest?.type || null,
        };
      });
    },
    async invokeExtension(extensionId, method, args) {
      const runtime = getExtensionRuntime?.() || {};
      if (!runtime.workerPool || !runtime.registry) {
        throw new Error('Extension runtime unavailable');
      }
      const entry = runtime.registry.lookup(extensionId);
      if (!entry) throw new Error('Extension not loaded');
      if (!fsMod.existsSync(entry.bundlePath)) throw new Error('Extension bundle missing');
      if (typeof runtime.ensureExtensionFetchProxy === 'function') {
        await runtime.ensureExtensionFetchProxy();
      }
      const code = fsMod.readFileSync(entry.bundlePath, 'utf8');
      await runtime.workerPool.getOrSpawn(extensionId, code, entry.manifest);
      return runtime.workerPool.invoke(extensionId, method, Array.isArray(args) ? args : [args]);
    },
    async resolveSources(payload = {}) {
      const runtime = getExtensionRuntime?.() || {};
      if (!runtime.workerPool || !runtime.registry) {
        throw new Error('Extension runtime unavailable');
      }
      const methodRaw = String(payload.method || 'single').toLowerCase();
      const method = ['single', 'batch', 'movie', 'search'].includes(methodRaw) ? methodRaw : 'single';
      const targetIds = getLoadedExtensionIds(runtime, payload.extensionIds);
      const sourceOptions = buildSourceOptions(payload);
      const sources = [];
      const errors = [];

      if (typeof runtime.ensureExtensionFetchProxy === 'function') {
        await runtime.ensureExtensionFetchProxy();
      }

      for (const extensionId of targetIds) {
        const entry = runtime.registry.lookup(extensionId);
        if (!entry || !fsMod.existsSync(entry.bundlePath)) continue;
        const code = fsMod.readFileSync(entry.bundlePath, 'utf8');
        await runtime.workerPool.getOrSpawn(extensionId, code, entry.manifest);
        try {
          const result = await runtime.workerPool.invoke(extensionId, method, [sourceOptions]);
          const rows = Array.isArray(result) ? result : result ? [result] : [];
          for (const row of rows) {
            if (!row || typeof row !== 'object' || !row.url) continue;
            sources.push({
              ...row,
              extensionId,
              extensionName: entry.manifest?.name || extensionId,
              extensionType: entry.manifest?.type || row.sourceType || null,
            });
          }
        } catch (err) {
          errors.push({ extensionId, message: err?.message || String(err) });
        }
      }

      return {
        sources,
        errors,
        extensionCount: targetIds.length,
        sourceOptions,
      };
    },
    async searchTorrents(options = {}) {
      const facade = getTorrentFacade?.();
      if (!facade) throw new Error('Torrent runtime unavailable');
      return facade.search(options);
    },
    async startTorrent(source, options = {}) {
      const facade = getTorrentFacade?.();
      if (!facade) throw new Error('Torrent runtime unavailable');
      if (source && typeof source === 'object' && source.torrentBuffer != null) {
        const buf = Buffer.isBuffer(source.torrentBuffer)
          ? source.torrentBuffer
          : Buffer.from(source.torrentBuffer instanceof Uint8Array ? source.torrentBuffer : Object.values(source.torrentBuffer));
        return facade.startFromBuffer(buf, options);
      }
      return facade.start(String(source || options.magnet || options.infoHash || ''), options);
    },
    async streamTorrent(sessionId, fileIndex = 0, options = {}) {
      const facade = getTorrentFacade?.();
      if (!facade) throw new Error('Torrent runtime unavailable');
      return facade.stream(sessionId, fileIndex, options);
    },
    async getTorrentStats(sessionId) {
      const facade = getTorrentFacade?.();
      if (!facade) throw new Error('Torrent runtime unavailable');
      return facade.stats(sessionId);
    },
    async listTorrents() {
      const facade = getTorrentFacade?.();
      if (!facade) throw new Error('Torrent runtime unavailable');
      return facade.listSessions();
    },
    async getStreamProxyInfo() {
      return {
        note: 'Stream URLs are issued by the host desktop runtime; remote clients must use authenticated Home Server sessions.',
        localOnlyPorts: [8888, 8890],
        remotePlayback: 'Use /api/home/playback/resolve or /api/home/streams/source/:token so LAN browsers never need local-only ports.',
      };
    },
  };

  runtime = createHomeServerRuntime({
    app,
    fs: fsMod,
    path: pathMod,
    logger,
    adapters,
  });

  ipcMain.handle('home-server:get-status', async () => runtime.getStatus());

  ipcMain.handle('home-server:get-config', async () => {
    const config = runtime.store.read();
    return {
      enabled: config.enabled,
      port: config.port,
      bindMode: config.bindMode,
      remoteEnabled: config.remoteEnabled,
      remoteBaseUrl: config.remoteBaseUrl,
      catalogApiBase: config.catalogApiBase || TATAKAI_API_BASE,
      shareCatalog: Boolean(config.shareCatalog),
      requireConsent: Boolean(config.requireConsent),
      passwordConfigured: Boolean(config.passwordHash),
      corsOrigins: config.corsOrigins,
      rateLimitPerMinute: config.rateLimitPerMinute,
      users: (config.users || []).map((u) => ({
        id: u.id,
        name: u.name,
        role: u.role,
        permissions: u.permissions,
        hasPassword: Boolean(u.passwordHash),
      })),
    };
  });

  ipcMain.handle('home-server:list-consent', async () => {
    const config = runtime.store.read();
    return { requests: config.consentRequests || [] };
  });

  ipcMain.handle('home-server:decide-consent', async (_event, payload = {}) => {
    const config = runtime.store.read();
    const id = String(payload.id || '');
    const approve = Boolean(payload.approve);
    config.consentRequests = (config.consentRequests || []).map((row) => {
      if (row.id !== id) return row;
      return { ...row, status: approve ? 'approved' : 'denied', decidedAt: Date.now() };
    });
    runtime.store.write(config);
    return { success: true, requests: config.consentRequests };
  });

  ipcMain.handle('home-server:set-config', async (_event, patch = {}) => {
    const config = runtime.store.read();
    if (patch.port != null) config.port = Number(patch.port) || config.port;
    if (patch.bindMode) config.bindMode = String(patch.bindMode);
    if (typeof patch.remoteEnabled === 'boolean') config.remoteEnabled = patch.remoteEnabled;
    if (patch.remoteBaseUrl != null) config.remoteBaseUrl = String(patch.remoteBaseUrl);
    if (patch.catalogApiBase != null) config.catalogApiBase = String(patch.catalogApiBase);
    if (typeof patch.shareCatalog === 'boolean') config.shareCatalog = patch.shareCatalog;
    if (typeof patch.requireConsent === 'boolean') config.requireConsent = patch.requireConsent;
    if (Array.isArray(patch.corsOrigins)) config.corsOrigins = patch.corsOrigins;
    if (patch.rateLimitPerMinute != null) {
      config.rateLimitPerMinute = Number(patch.rateLimitPerMinute) || 120;
    }
    if (patch.password) {
      const { hash, salt } = runtime.store.hashPassword(String(patch.password));
      config.passwordHash = hash;
      config.passwordSalt = salt;
      const admin = (config.users || []).find((u) => u.id === 'admin');
      if (admin) {
        admin.passwordHash = hash;
        admin.passwordSalt = salt;
      }
    }
    runtime.store.write(config);
    return {
      success: true,
      passwordConfigured: Boolean(config.passwordHash),
      port: config.port,
      bindMode: config.bindMode,
      remoteEnabled: config.remoteEnabled,
      shareCatalog: Boolean(config.shareCatalog),
      requireConsent: Boolean(config.requireConsent),
    };
  });

  ipcMain.handle('home-server:start', async (_event, overrides = {}) => {
    try {
      const status = await runtime.start(overrides);
      const win = getMainWindow?.();
      if (win && !win.isDestroyed()) {
        win.webContents.send('home-server:status', status);
      }
      return { success: true, status };
    } catch (err) {
      logger.error('[HomeServer] start failed', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('home-server:stop', async () => {
    const status = await runtime.stop();
    return { success: true, status };
  });

  ipcMain.handle('home-server:create-token', async (_event, { userId = 'admin', label = 'device' } = {}) => {
    const token = runtime.store.issueToken(userId, label);
    return { success: true, token };
  });

  ipcMain.handle('home-server:revoke-token', async (_event, token) => {
    runtime.store.revokeToken(token);
    return { success: true };
  });

  ipcMain.handle('home-server:upsert-user', async (_event, userInput = {}) => {
    const config = runtime.store.read();
    const id = String(userInput.id || '').trim();
    if (!id) return { success: false, error: 'id_required' };
    let user = (config.users || []).find((u) => u.id === id);
    if (!user) {
      user = {
        id,
        name: userInput.name || id,
        role: userInput.role || 'viewer',
        permissions: userInput.permissions || ['library', 'streams'],
        passwordHash: null,
        passwordSalt: null,
      };
      config.users.push(user);
    } else {
      if (userInput.name) user.name = String(userInput.name);
      if (userInput.role) user.role = String(userInput.role);
      if (Array.isArray(userInput.permissions)) user.permissions = userInput.permissions;
    }
    if (userInput.password) {
      const { hash, salt } = runtime.store.hashPassword(String(userInput.password));
      user.passwordHash = hash;
      user.passwordSalt = salt;
    }
    runtime.store.write(config);
    return {
      success: true,
      user: { id: user.id, name: user.name, role: user.role, permissions: user.permissions },
    };
  });

  try {
    const config = runtime.store.read();
    if (config.enabled && config.passwordHash) {
      runtime.start().catch((err) => logger.warn('[HomeServer] autostart failed', err));
    }
  } catch {
    /* ignore */
  }

  return runtime;
};
