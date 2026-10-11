'use strict';

module.exports = async function resolveAutoDownloadSource(host, anilistId, title, episode, language) {
    const baseUrl = host?.getBaseUrl();
    if (!baseUrl || !anilistId) return null;
    const namespaces = (host.listNamespaces() || []).filter(ns => (ns.routes || []).some(route => route === 'sources' || route === 'stream'));
    const results = await Promise.allSettled(namespaces.map(async ns => {
        const route = ns.routes.includes('sources') ? 'sources' : 'stream';
        const url = new URL(`/api/v3/${encodeURIComponent(ns.namespace)}/${route}`, baseUrl);
        for (const [key, value] of Object.entries({ anilistId, episode, resolution: '1080p', preferredLanguage: 'sub', stream: '0' })) url.searchParams.set(key, String(value));
        url.searchParams.append('titles[]', title);
        const response = await fetch(url, { signal: AbortSignal.timeout(25000) });
        if (!response.ok) return [];
        const body = await response.json();
        return Array.isArray(body.sources) ? body.sources : [];
    }));
    const sources = results.flatMap(result => result.status === 'fulfilled' ? result.value : [])
        .filter(source => !language || language === 'unknown' || !source.audioLanguage || source.audioLanguage === language)
        .sort((a, b) => (a.providerPriority ?? Number.MAX_SAFE_INTEGER) - (b.providerPriority ?? Number.MAX_SAFE_INTEGER));
    const hls = sources.find(source => source.url && source.isEmbed !== true && source.sourceType !== 'embed' &&
        (source.isM3U8 || source.sourceType === 'hls' || /\.m3u8(?:$|[?#/])/i.test(source.url)));
    if (hls) return { sourceType: 'hls', url: hls.url, headers: hls.headers || {}, subtitles: hls.subtitles || hls.tracks || [] };
    const torrent = sources.find(source => /^magnet:/i.test(source.url || source.magnet || ''));
    return torrent ? { sourceType: 'torrent', magnet: torrent.magnet || torrent.url } : null;
};
