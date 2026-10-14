import { it, expect, afterEach } from 'bun:test';
import { syncCatalogs, fetchPublicJson } from '../tatakaiextension/supabase/functions/api/catalog-sync';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; delete (globalThis as any).Deno; });

function database(entries: any[]) {
  const state: Record<string, any[]> = {
    extension_catalog_feeds: [{ id: 'feed', name: 'Sources', ecosystem: 'seanime', url: 'https://public.test/feed', enabled: true, entries: null, cursor: 0, seen_endpoints: [], imported_count: 0 }],
    extensions: [], extension_versions: [], extension_catalog_memberships: [],
  };
  const db: any = {
    from(table: string) {
      const conditions: Array<[string, any]> = []; let operation = 'select'; let values: any;
      const execute = () => {
        let rows = state[table].filter(r => conditions.every(([key, value]) => r[key] === value));
        if (operation === 'insert') { const row = { id: `${table}-${state[table].length}`, ...values }; state[table].push(row); rows = [row]; }
        if (operation === 'update') rows.forEach(r => Object.assign(r, values));
        if (operation === 'upsert') { const row = state[table].find(r => r.feed_id === values.feed_id && r.extension_id === values.extension_id); if (row) Object.assign(row, values); else state[table].push(values); rows = [values]; }
        return { data: rows, error: null };
      };
      const q: any = { select: () => q, eq: (k: string,v: any) => { conditions.push([k,v]); return q; }, order: () => q,
        insert: (v: any) => { operation = 'insert'; values = v; return q; }, update: (v: any) => { operation = 'update'; values = v; return q; }, upsert: (v: any) => { operation = 'upsert'; values = v; return q; },
        maybeSingle: async () => { const r = execute(); return { ...r, data: r.data[0] || null }; }, single: async () => { const r = execute(); return { ...r, data: r.data[0] }; },
        then: (resolve: any) => Promise.resolve(execute()).then(resolve),
      }; return q;
    },
    async rpc(name: string, args: any) {
      const feed = state.extension_catalog_feeds[0];
      if (name === 'claim_extension_catalog_feed') { feed.lease_until = new Date(Date.now() + 180000).toISOString(); return { data: true, error: null }; }
      if (name === 'finish_extension_catalog_feed') {
        for (const membership of state.extension_catalog_memberships) membership.missed_runs = args._seen.includes(membership.endpoint) ? 0 : (membership.missed_runs || 0) + 1;
        state.extensions.forEach(e => e.catalog_available = state.extension_catalog_memberships.some(m => m.extension_id === e.id && m.missed_runs < 2));
        Object.assign(feed, { entries: null, cursor: 0, seen_endpoints: [], next_page_url: null, page_count: 0, last_completed_at: new Date().toISOString() });
      }
      return { data: null, error: null };
    },
  };
  let failFeed = false; let version = '1.0.0';
  (globalThis as any).Deno = { resolveDns: async () => ['93.184.216.34'] };
  globalThis.fetch = (async (input: any) => {
    const url = String(input);
    if (url.endsWith('/feed')) return failFeed ? new Response('', { status: 503 }) : Response.json(entries);
    const id = url.split('/').pop();
    return Response.json({ id, name: id, version, type: id === 'plugin' ? 'plugin' : 'manga-provider', language: 'javascript' });
  }) as any;
  return { db, state, fail: () => { failFeed = true; }, version: (v: string) => { version = v; } };
}

it('resumes bounded batches, deduplicates repeated feed endpoints, and preserves moderation on updates', async () => {
  const entries = [...Array.from({ length: 10 }, (_, n) => ({ manifestURI: `https://public.test/source-${n}` })), { manifestURI: 'https://public.test/source-0' }, { manifestURI: 'https://public.test/plugin' }];
  const { db, state, version } = database(entries);
  expect((await syncCatalogs(db, true))[0].complete).toBe(false);
  expect(state.extension_catalog_feeds[0].cursor).toBe(8);
  expect((await syncCatalogs(db))[0].complete).toBe(true);
  expect(state.extensions).toHaveLength(10); expect(state.extensions.every(e => e.status === 'pending')).toBe(true); expect(state.extension_catalog_memberships).toHaveLength(10);
  Object.assign(state.extensions[0], { name: 'Admin title', status: 'rejected', is_killed: true }); version('2.0.0');
  await syncCatalogs(db, true); await syncCatalogs(db);
  expect(state.extensions).toHaveLength(10); expect(state.extension_versions).toHaveLength(20);
  expect(state.extensions[0].name).toBe('Admin title'); expect(state.extensions[0].status).toBe('rejected'); expect(state.extensions[0].is_killed).toBe(true);
});

it('retains listings during feed failure and marks absent entries only after two complete runs', async () => {
  const entries = [{ manifestURI: 'https://public.test/source' }];
  const { db, state, fail } = database(entries);
  await syncCatalogs(db, true); entries.length = 0;
  await syncCatalogs(db, true); expect(state.extensions[0].catalog_available).toBe(true);
  await syncCatalogs(db, true); expect(state.extensions[0].catalog_available).toBe(false);
  fail(); const result = await syncCatalogs(db, true);
  expect(result[0].error).toContain('503'); expect(state.extensions).toHaveLength(1);
});

it('rejects private fetch destinations before issuing a request', async () => {
  let requested = false; globalThis.fetch = (async () => { requested = true; return Response.json({}); }) as any;
  await expect(fetchPublicJson('http://127.0.0.1/private')).rejects.toThrow('Private');
  expect(requested).toBe(false);
});

it('imports every paginated anime source and hosted instance, retains unreachable listings and artwork', async () => {
  const { db, state } = database([]);
  Object.assign(state.extension_catalog_feeds[0], { ecosystem: 'stremio', url: 'https://public.test/addons?category=anime&page=1' });
  const manifest = (id: string, resources = ['stream']) => ({ id, name: id, version: '1.0.0', resources, types: ['series'], background: `https://public.test/${id}.jpg` });
  const entry = (id: string, resources = ['stream']) => ({ manifestUrl: `https://public.test/${id}`, manifest: manifest(id, resources), categories: [{ slug: 'anime' }], url: `https://public.test/addons/${id}` });
  const requested: string[] = [];
  globalThis.fetch = (async (input: any) => {
    const url = String(input); requested.push(url);
    if (url.includes('category=anime')) return Response.json(url.includes('page=1')
      ? { addons: [{ ...entry('first'), instances: [entry('hosted')] }, entry('catalog', ['catalog'])], pagination: { page: 1, hasNextPage: true } }
      : { addons: [entry('last'), entry('offline')], pagination: { page: 2, hasNextPage: false } });
    if (url.endsWith('/offline')) return new Response('', { status: 503 });
    return Response.json(manifest(url.split('/').pop()!, url.endsWith('/catalog') ? ['catalog'] : ['stream']));
  }) as any;
  expect((await syncCatalogs(db, true))[0].complete).toBe(false);
  expect((await syncCatalogs(db))[0].complete).toBe(true);
  expect(requested.some(url => url.includes('category=anime&page=2'))).toBe(true);
  expect(state.extensions).toHaveLength(4);
  expect(state.extensions.find(e => e.upstream_id === 'first').banner_url).toBe('https://public.test/first.jpg');
  expect(state.extensions.find(e => e.upstream_id === 'hosted').categories).toEqual(['anime']);
  expect(state.extensions.find(e => e.upstream_id === 'offline').compatibility).toBe('unavailable');
  expect(state.extensions.every(e => e.status === 'approved')).toBe(true);
});
