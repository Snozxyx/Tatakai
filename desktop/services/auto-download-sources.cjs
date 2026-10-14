'use strict';

async function listAutoDownloadSources(host, anilistId, title, episode, language, profile) {
    const baseUrl = host?.getBaseUrl();
    if (!baseUrl || !anilistId) return [];
    const namespaces = (host.listNamespaces() || []).filter(ns => (ns.routes || []).some(route => route === 'sources' || route === 'stream'));
    const results = await Promise.allSettled(namespaces.map(async ns => {
        const route = ns.routes.includes('sources') ? 'sources' : 'stream';
        const url = new URL(`/api/v3/${encodeURIComponent(ns.namespace)}/${route}`, baseUrl);
        for (const [key, value] of Object.entries({ anilistId, episode, resolution: profile === 'data-saver' ? '720p' : profile === 'best-quality' ? 'auto' : '1080p', preferredLanguage: !language || ['ja', 'sub', 'jpn'].includes(language) ? 'sub' : 'dub', stream: '0' })) url.searchParams.set(key, String(value));
        url.searchParams.append('titles[]', title);
        const response = await fetch(url, { signal: AbortSignal.timeout(25000) });
        if (!response.ok) return [];
        const body = await response.json();
        return Array.isArray(body.sources) ? body.sources : [];
    }));
    const sources = results.flatMap(result => result.status === 'fulfilled' ? result.value : [])
        .filter(source => !language || language === 'unknown' || !source.audioLanguage || source.audioLanguage === language)
        .sort((a, b) => (a.providerPriority ?? Number.MAX_SAFE_INTEGER) - (b.providerPriority ?? Number.MAX_SAFE_INTEGER));
    return sources.filter(source => source.isEmbed !== true && source.sourceType !== 'embed').map(source => ({
        ...source, sourceType: /^magnet:/i.test(source.url || source.magnet || '') ? 'torrent' : 'hls',
        magnet: source.magnet || (/^magnet:/i.test(source.url || '') ? source.url : undefined),
        headers: source.headers || {}, subtitles: source.subtitles || source.tracks || [],
        title: source.title || title, catalogTitle: title, episodeNumber: source.episodeNumber ?? episode,
    }));
}
module.exports = async function resolveAutoDownloadSource(...args) {
    const sources = await listAutoDownloadSources(...args);
    return sources.find(source => source.sourceType === 'hls') || sources.find(source => source.sourceType === 'torrent') || null;
};
module.exports.listCandidates = listAutoDownloadSources;
