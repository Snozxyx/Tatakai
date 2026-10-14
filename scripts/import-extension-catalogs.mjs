// Fetch metadata only. This creates a reviewable initial database migration;
// it never installs extensions, executes payloads, or writes a remote database.
import fs from 'node:fs/promises';
import { resolve4, resolve6 } from 'node:dns/promises';
import { canonicalEndpoint, catalogCompatibility, isSourceManifest, feedEntries, nextFeedPage, catalogPresentation } from '../tatakaiextension/supabase/functions/api/catalog.ts';

const feeds = [
  ['Seanime Providers Website', 'seanime', 'https://seanime-contributions.github.io/Seanime-Providers/marketplace/main.json'],
  ['Stremio Anime Sources', 'stremio', 'https://stremio-addons.net/api/v0/addons?category=anime&limit=100&page=1'],
  ["Seanime Bas Community","seanime","https://raw.githubusercontent.com/Bas1874/Seanime-Marketplace/main/Marketplace/Main.json"],
  ["Seanime SleepyDrink","seanime","https://raw.githubusercontent.com/ASleepyDrink/Seanime-Stuff/refs/heads/main/marketplace.json"],
  ["Seanime Portuguese","seanime","https://raw.githubusercontent.com/Jhoorodre/seanime-provider/master/marketplace.json"],
  ['Stremio Official', 'stremio', 'https://v3-cinemeta.strem.io/addon_catalog/all/official.json'],
  ['Stremio Community', 'stremio', 'https://v3-cinemeta.strem.io/addon_catalog/all/community.json'],
  ['Seanime Default', 'seanime', 'https://raw.githubusercontent.com/5rahim/seanime-extensions/main/marketplace.json'],
  ['Seanime Providers', 'seanime', 'https://raw.githubusercontent.com/Seanime-contributions/Seanime-Providers/main/marketplace/main.json'],
  ['Seanime Community', 'seanime', 'https://raw.githubusercontent.com/Carloss616/seanime-extensions/main/marketplace.json'],
];
async function publicJson(input) {
  let target = input;
  for (let redirects = 0; redirects < 6; redirects++) {
    const url = new URL(canonicalEndpoint(target));
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = /^[\d.]+$/.test(host) || host.includes(':') ? [host] : (await Promise.allSettled([resolve4(host), resolve6(host)])).flatMap(r => r.status === 'fulfilled' ? r.value : []);
    if (!addresses.length || addresses.some(ip => /^(0\.|10\.|127\.|169\.254\.|192\.168\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|198\.(1[89]|51)\.|203\.0\.113\.|192\.0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip) || ip.includes(':') && !/^2[0-9a-f]{3}:/i.test(ip))) throw new Error('Private address rejected');
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(12000) });
    if ([301,302,303,307,308].includes(res.status)) { target = new URL(res.headers.get('location'), url).href; continue; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text(); if (text.length > 5 * 1024 * 1024) throw new Error('Oversized response');
    return JSON.parse(text);
  }
  throw new Error('Too many redirects');
}
const manifestCache = new Map();
const fetchManifest = endpoint => { if (!manifestCache.has(endpoint)) manifestCache.set(endpoint, publicJson(endpoint)); return manifestCache.get(endpoint); };
const records = new Map(); const memberships = []; const report = [];
for (const [name, ecosystem, url] of feeds) {
  let items = []; let page = url; const visited = new Set();
  while (page) {
    if (visited.has(page)) throw new Error('Pagination loop'); visited.add(page);
    const body = await publicJson(page); items.push(...feedEntries(body)); page = nextFeedPage(body, page) || '';
    if (visited.size > 1000) throw new Error('Too many catalog pages');
  }
  let processed = 0, unavailable = 0;
  for (let offset = 0; offset < items.length; offset += 6) {
    await Promise.all(items.slice(offset, offset + 6).map(async item => {
      let endpoint; try { endpoint = canonicalEndpoint(item.transportUrl || item.manifestURI || item.manifestUrl); } catch { return; }
      let manifest, failed = false;
      try { manifest = await fetchManifest(endpoint); }
      catch { failed = true; unavailable++; manifest = item.manifest || item; }
      if (!manifest.id || !manifest.name || !manifest.version || !isSourceManifest(ecosystem, manifest)) return;
      const metadata = { name: String(manifest.name).slice(0,120), description: String(manifest.description || '').slice(0,2000), author: String(manifest.author || 'Community'),
        ...catalogPresentation(manifest, item, endpoint), upstream_id: String(manifest.id), upstream_type: manifest.type || null, upstream_language: manifest.language || null,
        type: manifest.type === 'anime-torrent-provider' ? 'torrent' : ecosystem === 'stremio' || manifest.type === 'onlinestream-provider' ? 'onlinestream' : 'custom',
        ...catalogCompatibility(ecosystem, manifest), ...(failed ? { compatibility: 'unavailable', compatibility_reason: 'Manifest was unreachable during initial import; synchronization will retry.' } : {}) };
      const key = ecosystem + ':' + endpoint;
      if (!records.has(key)) records.set(key, { ecosystem, manifest_url: endpoint, version: manifest.version || null, source_url: item.url ? canonicalEndpoint(item.url) : url, metadata });
      memberships.push({ feed_url: url, ecosystem, endpoint }); processed++;
    }));
    if (offset % 24 === 0) console.log(`${name}: processed ${Math.min(offset + 6, items.length)}/${items.length}`);
  }
  report.push({ name, pages: visited.size, total: items.length, imported: processed, unreachable: unavailable });
}
const sqlString = value => "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";
const sql = `-- Feed additions are idempotent; publishers and moderation remain unchanged.
insert into public.extension_catalog_feeds(name,ecosystem,url) values
  ('Seanime Providers Website','seanime','https://seanime-contributions.github.io/Seanime-Providers/marketplace/main.json'),
  ('Stremio Anime Sources','stremio','https://stremio-addons.net/api/v0/addons?category=anime&limit=100&page=1')
on conflict(url) do nothing;
-- Initial public catalog snapshot. Generated by scripts/import-extension-catalogs.mjs.
-- Metadata only; upstream code/artifacts remain at their original URLs.
do $$
declare item jsonb; ext_id uuid; membership jsonb;
begin
  for item in select value from jsonb_array_elements(${sqlString([...records.values()])}) loop
    insert into public.extensions(extension_id, ecosystem, manifest_url, name, description, author, icon_url, banner_url, categories, upstream_id, upstream_type, upstream_language, type, compatibility, compatibility_reason, imported_metadata, source_url, submitted_by, status)
    values ((item->>'ecosystem') || '-' || gen_random_uuid(), item->>'ecosystem', item->>'manifest_url', item->'metadata'->>'name', item->'metadata'->>'description', item->'metadata'->>'author', item->'metadata'->>'icon_url', item->'metadata'->>'banner_url', array(select jsonb_array_elements_text(item->'metadata'->'categories')), item->'metadata'->>'upstream_id', item->'metadata'->>'upstream_type', item->'metadata'->>'upstream_language', (item->'metadata'->>'type')::public.extension_type, item->'metadata'->>'compatibility', item->'metadata'->>'compatibility_reason', item->'metadata', item->>'source_url', null, 'approved')
    on conflict(ecosystem,manifest_url) where manifest_url is not null do nothing;
    select id into ext_id from public.extensions where ecosystem = item->>'ecosystem' and manifest_url = item->>'manifest_url';
    -- Enrich already imported rows, preserving administrator artwork/category edits.
    update public.extensions set
      banner_url = case when coalesce(to_jsonb(banner_url),'null'::jsonb) is not distinct from coalesce(imported_metadata->'banner_url','null'::jsonb) then item->'metadata'->>'banner_url' else banner_url end,
      categories = case when to_jsonb(categories) is not distinct from imported_metadata->'categories' or (not (coalesce(imported_metadata,'{}'::jsonb) ? 'categories') and coalesce(categories,'{}') = '{}') then array(select jsonb_array_elements_text(item->'metadata'->'categories')) else categories end,
      imported_metadata = coalesce(imported_metadata,'{}'::jsonb) || jsonb_build_object('banner_url',item->'metadata'->'banner_url','categories',item->'metadata'->'categories')
    where id = ext_id and submitted_by is null;
    if item->>'version' is not null then
      insert into public.extension_versions(extension_id, version, manifest_url, download_url, release_url, is_stable, approved_at)
      select ext_id, item->>'version', item->>'manifest_url', item->>'manifest_url', item->>'manifest_url', true, now()
      where not exists(select 1 from public.extension_versions where extension_id = ext_id and version = item->>'version');
    end if;
  end loop;
  for membership in select value from jsonb_array_elements(${sqlString(memberships)}) loop
    insert into public.extension_catalog_memberships(feed_id,extension_id,endpoint)
    select f.id,e.id,membership->>'endpoint' from public.extension_catalog_feeds f cross join public.extensions e
     where f.url=membership->>'feed_url' and e.ecosystem=membership->>'ecosystem' and e.manifest_url=membership->>'endpoint'
    on conflict do nothing;
  end loop;
end; $$;
`;
const migration = process.argv.find(arg => arg.startsWith('--migration='))?.slice('--migration='.length) || '20261011000005_source_catalog_expansion.sql';
if (!/^\d+_[a-z_]+\.sql$/.test(migration)) throw new Error('Invalid migration filename');
await fs.writeFile('tatakaiextension/supabase/migrations/' + migration, sql);
await fs.writeFile('tatakaiextension/docs/catalog-import-report.json', JSON.stringify({ generatedAt: new Date().toISOString(), uniqueListings: records.size, feeds: report }, null, 2));
console.log(JSON.stringify({ uniqueListings: records.size, feeds: report }));
