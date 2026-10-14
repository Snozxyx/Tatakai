import { providerCapabilityIssues } from './capabilities';
/** Serialized into the existing desktop/mobile extension execution hosts. */
export function seanimeAdapterFactory(code: string, htmlParser: any, hostFetch: any, hostChromeDP?: any) {
  const selection = (node: any): any => ({
    find: (s: string) => selection(node.find(s)), first: () => selection(node.first()),
    eq: (i: number) => selection(node.eq(i)), last: () => selection(node.last()), parent: () => selection(node.parent()),
    children: (s?: string) => selection(node.children(s)), next: () => selection(node.next()), prev: () => selection(node.prev()),
    size: () => node.length, map: (fn: any) => { const out: any[] = []; node.each((i: number, el: any) => out.push(fn(i, selection(el)))); return out; },
    attr: (s: string) => node.attr(s) || '', text: () => node.text(), html: () => node.html() || '',
    each: (fn: any) => { node.each((i: number, el: any) => fn(i, selection(el))); return selection(node); },
    length: () => typeof node.length === 'number' ? node.length : (node.text() ? 1 : 0),
  });
  const LoadDoc = (html: string) => {
    const root = htmlParser(html);
    const doc = (selector: string) => selection(root.find(selector));
    for (const [key, value] of Object.entries(selection(root))) Object.defineProperty(doc, key, { value, configurable: true, enumerable: true });
    return doc;
  };
  const Doc = function(this: any, html: string) { return LoadDoc(html); };
  let preferences: Record<string, unknown> = {};
  const fetchCompat = async (url: string, opts?: any) => {
    const res = await hostFetch(url, opts);
    // Seanime's native response exposes synchronous body readers. Buffer once;
    // `await response.text()` remains compatible with the returned string.
    const bytes = typeof res.arrayBuffer === 'function' ? new Uint8Array(await res.arrayBuffer()) : new TextEncoder().encode(await res.text());
    const body = new TextDecoder().decode(bytes);
    let hostname = 'upstream'; try { hostname = new URL(url).hostname; } catch {}
    const json = () => {
      if (!res.ok) throw new Error(`Upstream HTTP ${res.status} from ${hostname}`);
      if (/^\s*</.test(body)) throw new Error(`Expected JSON from ${hostname}, received HTML (HTTP ${res.status}); the provider endpoint may be outdated or blocked`);
      try { return JSON.parse(body); } catch { throw new Error(`Invalid JSON response from ${hostname} (HTTP ${res.status})`); }
    };
    const headers = Object.fromEntries(res.headers.entries ? Array.from(res.headers.entries()).map((entry: any) => [entry[0], entry[1]]) : Object.entries(res.rawHeaders || {}).map(([key, values]: any) => [key, Array.isArray(values) ? values.join(', ') : values]));
    Object.defineProperty(headers, 'get', { value: (name: string) => res.headers.get(name), enumerable: false });
    return { ok: res.ok, status: res.status, statusText: res.ok ? res.statusText : `Upstream HTTP ${res.status} from ${hostname}`, url: res.url, headers,
      rawHeaders: res.rawHeaders || Object.fromEntries(Array.from(res.headers.entries?.() || []).map((entry: any) => [entry[0], [entry[1]]])), cookies: res.cookies || {},
      text: () => body, json, arrayBuffer: () => bytes.buffer,
    };
  };
  const unsupported = new Proxy({}, { get: (_target, key) => () => { throw new Error(`Seanime host API unavailable: ChromeDP.${String(key)}`); } });
  // Provider-local cache; never replaces application globals or shares data across extensions.
  const store = new Map<string, unknown>();
  const $store = { get: (key: string) => store.get(key), set: (key: string, value: unknown) => { store.set(key, value); }, remove: (key: string) => { store.delete(key); }, clear: () => store.clear() };
  const createProvider = () => new Function('$store', 'fetch', 'LoadDoc', 'Doc', '$getUserPreference', 'ChromeDP', '$sleep', '$toString', '$toBytes', code + '\nreturn new Provider();')(
    $store, fetchCompat, LoadDoc, Doc, (key: string) => preferences[key], hostChromeDP || unsupported,
    (ms: number) => new Promise(resolve => setTimeout(resolve, ms)), (value: any) => typeof value === 'string' ? value : new TextDecoder().decode(new Uint8Array(value)),
    (value: string) => Array.from(new TextEncoder().encode(value)),
  );
  let provider: any;
  let preferenceKey = '';
  const prepare = (opts: any) => {
    preferences = opts.preferences || {};
    const key = JSON.stringify(preferences);
    if (!provider || key !== preferenceKey) { provider = createProvider(); preferenceKey = key; }
  };
  const call = (method: string, ...args: any[]) => {
    if (typeof provider[method] !== 'function') throw new Error(`Seanime provider does not implement ${method}`);
    return Promise.resolve().then(() => provider[method](...args)).catch((error: any) => {
      if (error instanceof ReferenceError) throw new Error('Seanime host binding unavailable: ' + error.message);
      throw error;
    });
  };
  return {
    remoteCustom: async (opts: any) => { prepare(opts); if (!['getSettings', 'listAnime', 'listManga', 'getAnime', 'getManga', 'getAnimeDetails', 'getMangaDetails', 'getAnimeMetadata'].includes(opts.method)) throw new Error('Unsupported custom-source operation'); return call(opts.method, ...(opts.args || [])); },
    remoteEpisodes: async (opts: any) => { prepare(opts); return call('findEpisodes', opts.titleId); },
    remoteSearch: async (opts: any) => { prepare(opts); return call('search', opts); },
    remoteResolve: async (opts: any) => {
      prepare(opts);
      if (opts.providerType === 'anime-torrent-provider') {
        const torrents = await call(typeof provider.smartSearch === 'function' ? 'smartSearch' : 'search', opts);
        return Promise.all(torrents.map(async (t: any) => ({ ...t, url: t.magnetLink || (typeof provider.getTorrentMagnetLink === 'function' ? await call('getTorrentMagnetLink', t) : 'magnet:?xt=urn:btih:' + await call('getTorrentInfoHash', t)), sourceType: 'torrent', isTorrent: true, torrentTitle: t.name || t.title, quality: t.resolution || 'auto', fileSize: t.formattedSize || t.size })));
      }
      const episodes = await call('findEpisodes', opts.titleId);
      const episode = episodes.find((e: any) => Number(e.number) === opts.episode);
      if (!episode) return [];
      const settings = await call('getSettings');
      const settled = await Promise.allSettled((settings.episodeServers || []).map(async (server: string) => {
        const result = await call('findEpisodeServer', episode, server);
        return (result.videoSources || []).map((v: any) => ({ url: v.url, quality: v.quality, server,
          sourceType: v.type === 'm3u8' ? 'hls' : 'mp4', headers: result.headers || {},
          subtitles: (v.subtitles || []).map((s: any) => ({ url: s.url, language: s.language, lang: s.language, label: s.language, default: s.isDefault })) }));
      }));
      const sources = settled.flatMap((r: any) => r.status === 'fulfilled' ? r.value : []);
      if (!sources.length && settled.some((r: any) => r.status === 'rejected')) throw (settled.find((r: any) => r.status === 'rejected') as any).reason;
      return sources;
    },
    remoteChapters: async (opts: any) => { prepare(opts); return call('findChapters', opts.titleId); },
    remotePages: async (opts: any) => { prepare(opts); return call('findChapterPages', opts.chapterId); },
  };
}

export async function buildSeanimeBundle(payload: string, language: string): Promise<string> {
  if (!['javascript', 'typescript'].includes(language)) throw new Error('Only JavaScript/TypeScript Seanime providers can run in Tatakai');
  const ts = await import('typescript');
  let code = payload;
  if (language === 'typescript') {
    const output = ts.transpileModule(payload, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None }, reportDiagnostics: true });
    const errors = output.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error);
    if (errors?.length) throw new Error('Seanime TypeScript payload could not be compiled');
    code = output.outputText;
  }
  // Seanime $sleep is blocking. Await bare calls inside async browser-provider
  // functions so their lease/retry loops yield to the host instead of spinning.
  if (/ChromeDP\s*\.\s*newBrowser/.test(code)) {
    const awaitSleep = (context: any) => {
      const visit = (node: any, asyncScope = false): any => {
        if (ts.isFunctionLike(node)) asyncScope = Boolean((node as any).modifiers?.some((m: any) => m.kind === ts.SyntaxKind.AsyncKeyword));
        if (asyncScope && ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === '$sleep' && !ts.isAwaitExpression(node.parent))
          return context.factory.createAwaitExpression(node);
        return ts.visitEachChild(node, (child: any) => visit(child, asyncScope), context);
      };
      return (source: any) => visit(source);
    };
    code = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None }, transformers: { before: [awaitSleep] } }).outputText;
  }
  const issues = providerCapabilityIssues(ts, code);
  if (issues.length) throw new Error(issues.join('; '));
  new Function(code + '\nreturn new Provider();');
  return wrapSeanimeCode(code);
}

export function wrapSeanimeCode(code: string): string {
  return `module.exports = (${seanimeAdapterFactory.toString()})(${JSON.stringify(code)}, typeof __tatakai_parse_html__ === 'function' ? __tatakai_parse_html__ : parseHtml, typeof __tatakai_fetch__ === 'function' ? __tatakai_fetch__ : fetch, typeof __tatakai_chromedp__ === 'object' ? __tatakai_chromedp__ : undefined);`;
}
