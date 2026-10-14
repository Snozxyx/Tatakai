// Download the complete approved public catalog; never execute upstream payloads.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { resolve4, resolve6 } from 'node:dns/promises';
import { canonicalEndpoint } from '../tatakaiextension/supabase/functions/api/catalog.ts';
const env = await fs.readFile('.env', 'utf8');
const base = env.split(/\r?\n/).find(l => l.startsWith('VITE_EXTENSION_API_URL='))?.split('=').slice(1).join('=').trim();
if (!base) throw Error('Extension API URL is not configured');
const cache = path.join(os.tmpdir(), 'tatakai-extension-audit');
const previousAudit = JSON.parse(await fs.readFile('tatakaiextension/docs/extension-audit.json', 'utf8').catch(() => '{"results":[]}')); 
await fs.mkdir(cache, { recursive: true });
async function download(url, filename, json = false) {
  if (process.argv.includes('--cached')) { let data; try { data = await fs.readFile(filename); } catch { throw Error(previousAudit.results.find(r => r.id === path.basename(path.dirname(filename)))?.reasons?.[0] || 'Artifact was unreachable during download'); } return json ? JSON.parse(data.toString('utf8')) : data.toString('utf8'); }
  let response;
  for (let redirects = 0; redirects <= 5; redirects++) {
    const target = new URL(canonicalEndpoint(url));
    const host = target.hostname.replace(/^\[|\]$/g, '');
    if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw Error('Private host rejected');
    const addresses = /^[\d.]+$/.test(host) || host.includes(':') ? [host] : (await Promise.allSettled([resolve4(host), resolve6(host)])).flatMap(r => r.status === 'fulfilled' ? r.value : []);
    if (!addresses.length || addresses.some(ip => /^(0\.|10\.|127\.|169\.254\.|192\.168\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|198\.(1[89]|51)\.|203\.0\.113\.|192\.0\.|172\.(1[6-9]|2\d|3[01])\.|22[4-9]\.|23\d\.|24\d\.|25[0-5]\.)/.test(ip) || ip.includes(':') && (!/^2[0-9a-f]{3}:/i.test(ip) || /^2001:(db8|0):/i.test(ip)))) throw Error('Private or reserved address rejected');
    response = await fetch(target, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
    if (![301,302,303,307,308].includes(response.status)) break;
    if (redirects === 5 || !response.headers.get('location')) throw Error('Invalid artifact redirect');
    url = new URL(response.headers.get('location'), target).href;
  }
  if (!response.ok) throw Error(`HTTP ${response.status}`);
  const chunks = []; let bytes = 0; const reader = response.body.getReader();
  try { while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.length; if (bytes > 20 * 1024 * 1024) throw Error('Artifact exceeds audit size limit'); chunks.push(value); } }
  finally { await reader.cancel().catch(() => {}); }
  const data = Buffer.concat(chunks, bytes);
  await fs.writeFile(filename, data);
  return json ? JSON.parse(data.toString('utf8')) : data.toString('utf8');
}
const listings = [];
for (let offset = 0; ; ) {
  const body = await download(`${base}/extension?limit=100&offset=${offset}`, path.join(cache, `page-${offset}.json`), true);
  if (!Array.isArray(body.data)) throw Error('Invalid catalog response');
  listings.push(...body.data); offset += body.data.length;
  if (!body.data.length || offset >= body.count) break;
  if (offset > 10000) throw Error('Catalog pagination limit exceeded');
}
const approvedServerCount = listings.length;
if (process.argv.includes('--include-local')) {
  const migration = await fs.readFile('tatakaiextension/supabase/migrations/20261011000005_source_catalog_expansion.sql', 'utf8');
  const match = migration.match(/jsonb_array_elements\('([\s\S]*?)'::jsonb\)/);
  if (!match) throw Error('Local catalog snapshot not found');
  const local = JSON.parse(match[1].replaceAll("''", "'"));
  const endpoints = new Set(listings.map(l => l.manifest_url));
  for (const row of local) if (!endpoints.has(row.manifest_url)) { listings.push({ id: 'local-' + createHash('sha256').update(row.manifest_url).digest('hex').slice(0,24), name: row.metadata.name, ecosystem: row.ecosystem, manifest_url: row.manifest_url }); endpoints.add(row.manifest_url); }
}
const results = [];
for (let start = 0; start < listings.length; start += 6) {
  await Promise.all(listings.slice(start, start + 6).map(async listing => {
    const row = { id: listing.id, name: listing.name, ecosystem: listing.ecosystem || 'tatakai', manifestUrl: listing.manifest_url, status: 'unverified', reasons: [] };
    try {
      const dir = path.join(cache, listing.id); await fs.mkdir(dir, { recursive: true });
      if (!listing.manifest_url) {
        const detail = await download(`${base}/extension/${listing.id}`, path.join(dir, 'listing.json'), true);
        const extension = detail.data || detail;
        const build = extension.latest_version || extension.versions?.[0];
        if (build?.download_url) await download(build.download_url, path.join(dir, 'package.kai'));
        const require = createRequire(import.meta.url);
        const parser = require('../desktop/runtime/extension/kai-format.cjs');
        const filesystem = require('node:fs');
        const parsed = await parser.readKaiFile(path.join(dir, 'package.kai'), filesystem);
        row.type = parsed.manifest.type; row.version = parsed.manifest.version; row.capabilities = parsed.manifest.capabilities || [];
        row.status = 'protocol-compatible'; row.reasons.push('Native package validation passed; live provider functionality not verified');
      } else {
        const manifest = await download(listing.manifest_url, path.join(dir, 'manifest.json'), true);
        row.type = manifest.type; row.language = manifest.language; row.version = manifest.version;
        if (!manifest.id || !manifest.name || !manifest.version) throw Error('Incomplete manifest');
        if (row.ecosystem === 'stremio') {
          const resources = (manifest.resources || []).map(r => typeof r === 'string' ? r : r.name);
          if (!resources.some(r => ['stream', 'subtitles'].includes(r))) row.reasons.push('No playback or subtitle resource');
          const playableTypes = (manifest.types || []).some(t => ['movie', 'series'].includes(t));
          const prefixes = manifest.idPrefixes || [];
          const imdb = !prefixes.length || prefixes.some(p => 'tt123'.startsWith(p));
          const custom = resources.includes('meta') && (manifest.catalogs || []).length > 0;
          if ((!playableTypes || !imdb) && !custom) row.reasons.push('Custom IDs require a usable catalog and metadata resource');
          row.status = row.reasons.length ? 'unsupported' : 'protocol-compatible';
          if (manifest.behaviorHints?.configurationRequired) { row.status = 'configuration-required'; row.reasons.push('Personalized manifest URL required'); }
        } else if (row.ecosystem === 'seanime') {
          if (!['javascript', 'typescript'].includes(manifest.language)) row.reasons.push('Unsupported executable language');
          if (!['onlinestream-provider', 'anime-torrent-provider', 'manga-provider'].includes(manifest.type)) row.reasons.push('Unsupported Seanime provider type');
          let payload = manifest.payload;
          if (!payload && manifest.payloadURI) payload = await download(new URL(manifest.payloadURI, listing.manifest_url).href, path.join(dir, 'provider.' + (manifest.language === 'typescript' ? 'ts' : 'js')));
          if (!payload) row.reasons.push('Missing provider payload');
          else {
            await fs.writeFile(path.join(dir, 'payload.txt'), payload);
            const compiled = manifest.language === 'typescript' ? ts.transpileModule(payload, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None } }).outputText : payload;
            const parsed = ts.createSourceFile('provider.js', compiled, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
            const host = { getSourceFile: file => file === 'provider.js' ? parsed : undefined, getDefaultLibFileName: () => '', writeFile: () => {}, getCurrentDirectory: () => '', getDirectories: () => [], fileExists: file => file === 'provider.js', readFile: () => compiled, getCanonicalFileName: file => file, useCaseSensitiveFileNames: () => true, getNewLine: () => '\n' };
            const checker = ts.createProgram(['provider.js'], { allowJs: true, noLib: true }, host).getTypeChecker();
            try { new Function(compiled + '\nreturn Provider;'); } catch { row.reasons.push('Executable payload syntax errors'); }
            if (parsed.parseDiagnostics.length) row.reasons.push('Payload syntax errors');
            const methods = new Set(); const bindings = new Set();
            function visit(node) {
              if (ts.isMethodDeclaration(node)) methods.add(node.name.getText(parsed));
              if (ts.isIdentifier(node) && (/^\$/.test(node.text) || node.text === 'CryptoJS') && !checker.getSymbolAtLocation(node) && !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) && !(ts.isPropertyAssignment(node.parent) && node.parent.name === node)) bindings.add(node.text);
              ts.forEachChild(node, visit);
            } visit(parsed);
            const required = manifest.type === 'manga-provider' ? ['search', 'findChapters', 'findChapterPages'] : manifest.type === 'onlinestream-provider' ? ['search', 'getSettings', 'findEpisodes', 'findEpisodeServer'] : ['search'];
            for (const name of required) if (!methods.has(name)) row.reasons.push(`Missing provider method ${name}`);
            if (/\bChromeDP\s*[.(]/.test(payload)) {
              if (manifest.id === 'comix' && /ChromeDP\s*\.\s*newBrowser/.test(payload)) row.requirements = ['Tatakai desktop browser; interactive site clearance may be required'];
              else row.reasons.push('ChromeDP APIs are outside the tested desktop subset');
            }
            const unsupported = [...bindings].filter(b => !['$getUserPreference', '$sleep', '$toString', '$toBytes', '$store'].includes(b));
            if (unsupported.length) row.reasons.push('Unsupported host bindings: ' + unsupported.join(', '));
            row.methods = [...methods]; row.bindings = [...bindings];
          }
          row.status = row.reasons.length ? 'unsupported' : 'protocol-compatible';
          if (manifest.userConfig?.requiresConfig && row.status === 'protocol-compatible') row.status = 'configuration-required';
        }
      }
    } catch (error) { row.status = 'unavailable'; row.reasons.push(String(error.message).replace(/https?:\/\/\S+/g, '[URL]')); }
    results.push(row);
  }));
  console.log(`Audited ${Math.min(start + 6, listings.length)}/${listings.length}`);
}
results.sort((a, b) => a.name.localeCompare(b.name));
const counts = results.reduce((out, r) => (out[r.status] = (out[r.status] || 0) + 1, out), {});
await fs.writeFile('tatakaiextension/docs/extension-audit.json', JSON.stringify({ generatedAt: new Date().toISOString(), source: base, total: results.length, approvedServerCount, preparedLocalCount: results.length - approvedServerCount, counts, artifactDirectory: cache, livePlaybackVerified: false, results }, null, 2));
const rejected = results.filter(r => r.status === 'unsupported');
const unavailable = results.filter(r => r.status === 'unavailable');
const quote = s => "'" + s.replaceAll("'", "''") + "'";
const sql = '-- Public catalog audit: remove confirmed incompatible entries from approved listings.\n-- Preserve existing rejection and kill switches. Unreachable hosts may recover.\n' + rejected.map(r => `update public.extensions set status='rejected', compatibility='external', compatibility_reason=${quote(r.reasons.join('; '))} where ecosystem=${quote(r.ecosystem)} and manifest_url=${quote(r.manifestUrl)} and status='approved';`).join('\n') + '\n' + unavailable.map(r => `update public.extensions set compatibility='unavailable', catalog_available=false, compatibility_reason=${quote('Manifest/payload audit failed: ' + r.reasons.join('; '))}, imported_metadata=coalesce(imported_metadata,'{}'::jsonb) || jsonb_build_object('compatibility','unavailable','compatibility_reason',${quote('Manifest/payload audit failed: ' + r.reasons.join('; '))}) where ecosystem=${quote(r.ecosystem)} and manifest_url=${quote(r.manifestUrl)} and status='approved';`).join('\n');
await fs.writeFile('tatakaiextension/supabase/migrations/20261012000001_extension_compatibility_audit.sql', sql);
console.log(JSON.stringify({ total: results.length, counts, artifactDirectory: cache }));

const approved = results.filter(r => !r.id.startsWith('local-'));
const labels = { 'protocol-compatible': 'Protocol checks passed', 'configuration-required': 'Configuration required', unsupported: 'Incompatible', unavailable: 'Unreachable', unverified: 'Needs review' };
const escape = value => String(value || '').replaceAll('|', '\\|').replaceAll('\n', ' ');
let markdown = `# Extension compatibility audit\n\nAll **${approvedServerCount} approved server entries** and **${results.length - approvedServerCount} additional prepared listings** were audited. Downloads were attempted for every manifest, provider payload and native package; unreachable artifacts are listed individually. Artifacts: \`${cache}\`.\n\n**Protocol checks passed does not certify live playback.** The audit checks manifests, contracts, syntax, provider methods, host bindings and native archives without executing upstream code. Configuration, upstream availability, mappings, torrents and CORS still affect execution.\n\n| Assessment | All entries | Approved server entries |\n| --- | ---: | ---: |\n`;
for (const [status, count] of Object.entries(counts)) markdown += `| ${labels[status]} | ${count} | ${approved.filter(r => r.status === status).length} |\n`;
markdown += `\nThe local migration removes ${rejected.length} incompatible endpoints from approval and marks ${unavailable.length} unreachable entries unavailable. **The live database has not been changed.** New Seanime imports remain pending until audited.\n`;
for (const [title, rows] of [['Approved server catalog', approved], ['Additional prepared entries', results.filter(r => r.id.startsWith('local-'))]]) {
  markdown += `\n## ${title}\n\n| Extension | Ecosystem | Assessment | Reason |\n| --- | --- | --- | --- |\n`;
  for (const row of rows) markdown += `| ${escape(row.name)} | ${row.ecosystem} | ${labels[row.status]} | ${escape([...row.reasons, ...(row.requirements || [])].join('; '))} |\n`;
}
await fs.writeFile('tatakaiextension/docs/extension-audit.md', markdown);
