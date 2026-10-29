// Shared UI integration. Native transport is mocked; Sora executes in the real WASM worker.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { chromium } from 'playwright';
import path from 'node:path';
import { mkdir, writeFile, rm } from 'node:fs/promises';

const fixture = path.resolve('.cache/compatibility-ui-fixture');
const entry = `import React from 'react';import{createRoot}from 'react-dom/client';import{MemoryRouter}from 'react-router-dom';import{QueryClient,QueryClientProvider}from '@tanstack/react-query';
import{CompatibilityExtensionsPanel}from '/src/components/extensions/CompatibilityExtensionsPanel.tsx';import{SideloadExtensionModal}from '/src/components/extensions/SideloadExtensionModal.tsx';import{InstalledCompatibilityExtensions}from '/src/components/extensions/InstalledCompatibilityExtensions.tsx';
import{compatibilityMappedChapters,compatibilityMappedStreams,compatibilityMappedPages}from '/src/core/extensions/compatibility/content.ts';import{compatibilityRequest}from '/src/core/extensions/compatibility/client.ts';import{executeSora}from '/src/core/extensions/sora/execute.ts';import{useRemoteExtensionSources}from '/src/hooks/media/useRemoteExtensionSources.ts';import{useQueryClient}from '@tanstack/react-query';import '/src/index.css';
window.nativeMapping={chapters:compatibilityMappedChapters,streams:compatibilityMappedStreams,readPages:compatibilityMappedPages,request:compatibilityRequest,executeSora};
import{compatibilityProviderKey}from '/src/core/extensions/compatibility/providers.ts';
function Resume(){const query=useRemoteExtensionSources(undefined,'Example',1,false),client=useQueryClient();return React.createElement('div',null,
React.createElement('button',{disabled:query.isFetching,onClick:async()=>{await window.electron.compatibilityRequest({op:'install',ecosystem:'aniyomi'});await window.electron.compatibilityRequest({op:'setEnabled',ecosystem:'aniyomi',enabled:true});const sources=await compatibilityRequest({op:'sources',ecosystem:'aniyomi'});client.setQueryData(['remote-extension-sources','continuous-v2',undefined,'Example',1,false,0],{sources:[{providerKey:'already',url:'https://media.test/old.mp4'}],subtitles:[],statuses:[{provider:compatibilityProviderKey(sources[0]),kind:'anime',ecosystem:'aniyomi',name:'Pending',count:0,status:'skipped',durationMs:0,skippedSourceIds:['compat-aniyomi-ui']}]});}},'Seed remaining'),
React.createElement('button',{disabled:query.isFetching||query.continuing,onClick:query.searchRemaining},'Search remaining'),React.createElement('button',{onClick:query.cancelRemaining},'Cancel remaining'),
React.createElement('button',{onClick:query.cancelLookup},'Stop lookup'),
React.createElement('p',{role:'status'},JSON.stringify({sources:query.data?.sources.length||0,remaining:query.remainingSourceCount,busy:query.continuing,fetching:query.isFetching,error:query.continuationError})));}
function App(){const[open,setOpen]=React.useState(false);const[search,setSearch]=React.useState('');if(location.search.includes('resume')||location.search.includes('continuous'))return React.createElement(Resume);return React.createElement(React.Fragment,null,React.createElement('button',{onClick:()=>setOpen(true)},'Open sideload'),React.createElement('input',{'aria-label':'Hub search',value:search,onChange:e=>setSearch(e.target.value)}),React.createElement(InstalledCompatibilityExtensions,{search,ecosystem:'all',type:'all',compatibility:'all'}),React.createElement(CompatibilityExtensionsPanel),React.createElement(SideloadExtensionModal,{isOpen:open,onClose:()=>setOpen(false)}));}
createRoot(document.getElementById('root')).render(React.createElement(QueryClientProvider,{client:new QueryClient({defaultOptions:{queries:{retry:false}}})},React.createElement(MemoryRouter,null,React.createElement(App))));`;
function nativeFixture() {
  if (location.search.includes('web')) return;
  const dense = location.search.includes('dense');
  let installed = dense, enabled = false, preference = false, repositories = dense ? [{ url: 'https://repo.test/repo.json', name: 'Fixture repository', ecosystem: 'mihon' }] : [];
  const denseFlags = {}, denseLanguages = ['en', 'fr', 'ja', 'de', 'es', 'hi', 'it', 'pt'];
  const nativePackages = () => dense ? Array.from({ length: 120 }, (_, index) => ({ id: index ? 'fixture.' + index : 'fixture.pkg', name: index ? 'Installed provider ' + index : 'Fixture extension', version: '1.6', installed: true, repository: 'https://repo.test/repo.json', ecosystem: 'mihon', icon: '/missing-native-logo.png' })) : [{ id: 'fixture.pkg', name: 'Fixture extension', version: '1.6', installed, repository: 'https://repo.test/repo.json', ecosystem: 'mihon' }];
  const continuous = location.search.includes('continuous');
  let animeInstalled = continuous, animeEnabled = continuous, animeRepositories = [];
  let ready = !location.search.includes('prepare'), preparing = false, progress, finishPreparation;
  window.electron = { compatibilityRequest: async p => {
    let result;
    if (p.op === 'cancel' && location.search.includes('resume')) return { ok: true };
    if (p.ecosystem === 'aniyomi' || String(p.sourceId || '').startsWith('compat-aniyomi-')) {
      const pkg = { id: 'c'.repeat(64), name: 'Fixture Aniyomi', version: '16.32', installed: animeInstalled, repository: 'https://aniyomi.test/index.min.json', ecosystem: 'aniyomi', kind: 'watch' };
      switch (p.op) {
        case 'repositories': result = animeRepositories; break;
        case 'addRepository': animeRepositories = [{ url: p.url, name: 'Aniyomi fixture repository', ecosystem: 'aniyomi' }]; break;
        case 'packages': result = animeRepositories.length ? [pkg] : []; break;
        case 'installedPackages': result = animeInstalled ? [pkg] : []; break;
        case 'install': animeInstalled = true; break;
        case 'remove': animeInstalled = false; animeEnabled = false; break;
        case 'setEnabled': animeEnabled = p.enabled; break;
        case 'sources': result = animeInstalled ? Array.from({ length: continuous ? 20 : 1 }, (_, index) => ({ id: 'compat-aniyomi-ui' + (continuous ? '-' + index : ''), upstreamId: String(index), packageId: pkg.id, name: 'Aniyomi fixture source' + (continuous ? ' ' + index : ''), extensionName: pkg.name, lang: 'en', kind: 'watch', enabled: animeEnabled, ecosystem: 'aniyomi' })) : []; break;
        case 'search': window.resumeSearches = (window.resumeSearches || 0) + 1; if (window.holdSearch || continuous && location.search.includes('hold') && window.resumeSearches > 1) await new Promise(resolve => window.releaseSearch = resolve); result = { results: [{ id: 'original-title', title: 'Example' }] }; break;
        case 'info': result = { entries: [{ id: 'original-episode', number: 1 }] }; break;
        case 'resolve': result = { sources: [{ url: 'https://media.test/resumed.mp4', sourceType: 'mp4' }] }; break;
        default: throw Error('Unexpected Aniyomi fixture operation ' + p.op);
      }
      return { ok: true, result };
    }
    switch (p.op) {
      case 'status': result = { platform: 'win32', runtimes: [{ ecosystem: 'mihon', available: true, ready, preparing, preparation: progress, downloadBytes: location.search.includes('bundled') ? 0 : 343828201 }, { ecosystem: 'cloudstream', available: false, ready: false, message: 'Android host required' }, { ecosystem: 'aniyomi', available: true, ready: true }] }; break;
      case 'prepare': preparing = true; progress = { stage: 'extracting', receivedBytes: 50, totalBytes: 100 }; await new Promise(resolve => finishPreparation = resolve); break;
      case 'cancel': preparing = false; progress = { stage: 'cancelled' }; finishPreparation?.(); break;
      case 'repositories': result = repositories; break;
      case 'addRepository': repositories = [{ url: p.url, name: 'Fixture repository', ecosystem: 'mihon' }]; break;
      case 'packages': result = repositories.length ? nativePackages() : []; break;
      case 'installedPackages': result = installed && p.ecosystem === 'mihon' ? nativePackages() : []; break;
      case 'install': installed = true; break;
      case 'remove': installed = false; enabled = false; break;
      case 'sources': result = installed ? dense ? denseLanguages.map(lang => ({ id: 'compat-mihon-dense-' + lang, upstreamId: lang, packageId: 'fixture.pkg', name: 'Fixture source', extensionName: 'Fixture extension', lang, kind: 'read', enabled: denseFlags[lang] === true, ecosystem: 'mihon' })) : [{ id: 'compat-mihon-test', upstreamId: '9223372036854775807', packageId: 'fixture.pkg', name: 'Fixture source', extensionName: 'Fixture extension', lang: 'en', kind: 'read', enabled, ecosystem: 'mihon' }] : []; break;
      case 'setEnabled': if (dense) denseFlags[p.sourceId.replace('compat-mihon-dense-', '')] = p.enabled; else enabled = p.enabled; break;
      case 'preferences': result = [{ position: 0, title: 'Fixture preference', summary: 'Keep the original extension preference on this device.', kind: 'boolean', value: preference, enabled: true, visible: true, options: [] }, { position: 1, title: 'Fixture languages', kind: 'multiselect', value: [], enabled: true, visible: true, options: [{ value: 'en', label: 'English option' }] }]; break;
      case 'setPreference': preference = p.value; break;
      default: throw Error('Unexpected operation ' + p.op);
    }
    return { ok: true, result };
  } };
  window.soraVersion = '1'; window.soraBroken = false; window.soraKind = 'mangas'; window.soraHttp = []; window.soraProxies = [];
  window.mangayomiVersion = '1'; window.mangayomiBroken = false; window.mangayomiKind = 0;
  const mangayomiOriginal = `class DefaultExtension extends MProvider {
    getSourcePreferences(){return[{key:'cookie',editTextPreference:{title:'Source cookie',value:'default-cookie'}}];}
    getHeaders(){return{Cookie:new SharedPreferences().get('cookie')};}
    async getPopular(){return this.search('Fixture title 雨');}
    async search(query){const response=await new Client().get('https://mangayomi-source.test/search?q='+encodeURIComponent(query),this.getHeaders());return{list:new Document(response.body).select('a').map(el=>({name:el.text,link:el.attr('href')})),hasNextPage:false};}
    getDetail(id){if(id!=='/original-title-雨')throw Error('Original title changed');return{description:'Details',chapters:[{name:'Vol. 2 Ch. 17',url:'opaque-chapter'}]};}
    getPageList(id){if(id!=='opaque-chapter')throw Error('Original chapter changed');return[{url:'https://mangayomi-source.test/page.jpg',headers:this.getHeaders()}];}
    getVideoList(id){if(id!=='opaque-chapter')throw Error('Original episode changed');return[{url:'https://mangayomi-source.test/video.m3u8',quality:'720p',headers:this.getHeaders(),subtitles:[{file:'https://mangayomi-source.test/en.vtt',label:'English'}]}];}
  }`;
  const original = `async function searchResults(query){if(typeof window!=='undefined'||typeof indexedDB!=='undefined')throw Error('Application realm leaked');const r=await fetchv2('https://source.test/search',{Cookie:'fixture-cookie'},'POST',JSON.stringify({query}));return await r.json();}
function extractChapters(id){if(id!=='opaque-title')throw Error('Original title ID changed');return[{id:'opaque-chapter',number:1,title:'Chapter 1'}];}
function extractDetails(){return{description:'Original details'};}
function extractImages(id){if(id!=='opaque-chapter')throw Error('Original chapter ID changed');return['https://source.test/page.jpg'];}
function extractEpisodes(id){if(id!=='opaque-title')throw Error('Original title ID changed');return[{id:'opaque-episode',number:1,title:'Episode 1'}];}
function extractStreamUrl(id){if(id!=='opaque-episode')throw Error('Original episode ID changed');return{streams:[{streamUrl:'https://stream.test/video.m3u8',headers:{Cookie:'video-cookie',referer:'https://required.test/'},language:'jpn'},{streamUrl:'https://stream.test/headerless.m3u8'}],subtitles:[{file:'https://subtitle.test/en.vtt',label:'English',headers:{Cookie:'subtitle-cookie'}}]};}`;
  window.electron.proxyExtensionSource = async p => { window.soraProxies.push(p); return 'http://127.0.0.1/fixture-proxy/' + window.soraProxies.length; };
  window.electron.fetchExtensionResource = async p => {
    window.soraHttp.push(p);
    if (p.url === 'https://repo.test/repo.json') return { status: 200, headers: {}, body: JSON.stringify({ meta: { signingKeyFingerprint: 'fixture' }, index_v2: 'https://repo.test/index.pb' }) };
    if (p.url === 'https://aniyomi.test/index.min.json') return { status: 200, headers: {}, body: JSON.stringify([{ name: 'Aniyomi: Fixture Aniyomi', pkg: 'eu.kanade.tachiyomi.animeextension.fixture', apk: 'fixture.apk', code: 1, version: '16.32' }]) };
    if (p.url === 'https://sora.test/repo.json') return { status: 200, headers: {}, body: JSON.stringify({ sourceName: window.soraKind === 'anime' ? 'Fixture Sora Anime' : 'Fixture Sora', version: window.soraVersion, type: window.soraKind, language: 'en', ...(window.soraKind === 'anime' ? { baseUrl: 'https://unrelated.test/' } : {}), scriptURL: 'https://sora.test/source.js' }) };
    if (p.url === 'https://sora.test/source.js') return { status: 200, headers: {}, body: window.soraBroken ? 'syntax error!' : original };
    if (p.url === 'https://mangayomi.test/index.json') return { status: 200, headers: {}, body: JSON.stringify([{ id: 123, name: 'Fixture Mangayomi', version: window.mangayomiVersion, itemType: window.mangayomiKind, sourceCodeLanguage: 1, sourceCodeUrl: 'https://mangayomi.test/original.js', baseUrl: 'https://mangayomi-source.test', lang: 'en' }, { id: 124, name: 'Dart source', version: '1', itemType: 0, sourceCodeLanguage: 0, sourceCodeUrl: 'https://mangayomi.test/original.dart', baseUrl: 'https://mangayomi-source.test', lang: 'en' }]) };
    if (p.url === 'https://mangayomi.test/original.js') return { status: 200, headers: {}, body: window.mangayomiBroken ? 'syntax error!' : mangayomiOriginal };
    if (p.url.startsWith('https://mangayomi-source.test/search?')) return { status: 200, headers: {}, body: '<a href="/original-title-雨">' + new URL(p.url).searchParams.get('q') + '</a>' };
    if (p.url === 'https://source.test/search') return { status: 200, headers: {}, body: JSON.stringify([{ id: 'opaque-title', title: JSON.parse(p.body).query }]) };
    throw Error('Unexpected native HTTP ' + p.url);
  };
}
await mkdir(fixture, { recursive: true });
await writeFile(path.join(fixture, 'entry.mjs'), entry);
await writeFile(path.join(fixture, 'index.html'), `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script>(${nativeFixture.toString()})()</script><script type="module" src="/.cache/compatibility-ui-fixture/entry.mjs"></script></body></html>`);
const server = await createServer({ configFile: false, root: process.cwd(), cacheDir: '.cache/compatibility-ui-vite', plugins: [react()], resolve: { alias: { '@': path.resolve('src'), '@tatakai/release-parser': path.resolve('desktop/runtime/torrent/naming/release-parser.cjs'), '@tatakai/candidate-scorer': path.resolve('src/core/download/candidate-scorer.cjs'), '@tatakai/candidate-evaluator': path.resolve('src/core/download/candidate-evaluator.cjs') }, dedupe: ['react', 'react-dom', '@tanstack/react-query'] }, optimizeDeps: { include: ['quickjs-emscripten', 'linkedom/worker'], entries: ['.cache/compatibility-ui-fixture/index.html'] }, server: { host: '127.0.0.1', port: 19426, hmr: false } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}/.cache/compatibility-ui-fixture/index.html`;
let browser, page;
try {
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 390, height: 844 } }); page.setDefaultTimeout(60000);
  const errors = []; page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
  await page.goto(base, { waitUntil: 'commit' });
  await page.getByLabel('Repository URL').fill('http://repo.test/repo.json');
  await page.getByRole('button', { name: 'Add repository' }).click();
  await page.getByText('Use an HTTPS URL without login credentials', { exact: true }).waitFor();
  await page.getByLabel('Repository URL').fill('https://repo.test/repo.json');
  await page.getByRole('button', { name: 'Add repository' }).click();
  await page.getByRole('button', { name: 'Install', exact: true }).click();
  const inventory = page.getByRole('region', { name: 'Installed repository extensions' });
  await inventory.getByText('Fixture extension', { exact: true }).waitFor();
  await page.getByLabel('Hub search').fill('no match'); await inventory.waitFor({ state: 'hidden' });
  await page.getByLabel('Hub search').fill('fixture.pkg');
  await inventory.getByRole('button', { name: 'Manage Fixture extension' }).click();
  let modal = page.getByRole('dialog');
  if (await modal.getByRole('tab', { name: 'Mihon', exact: true }).getAttribute('data-state') !== 'active' || await modal.getByLabel('Filter extension packages').inputValue() !== 'fixture.pkg') throw Error('Wrong package management target');
  await page.keyboard.press('Escape');
  await page.getByRole('switch', { name: 'Fixture source', exact: true }).click();
  const browse = page.getByRole('link', { name: 'Browse', exact: true }); await browse.waitFor();
  if (await browse.getAttribute('href') !== '/x/compat-mihon/compat-mihon-test') throw Error('Wrong source route');
  await page.getByRole('button', { name: /^Settings for Fixture source/ }).click();
  const preferenceSwitch = page.getByRole('switch', { name: 'Fixture preference', exact: true });
  const checkSettingsSize = async () => {
    const box = await preferenceSwitch.boundingBox(), checkbox = await page.getByRole('checkbox', { name: 'English option' }).boundingBox();
    if (!box || box.width > 48 || box.height > 28 || !checkbox || checkbox.width > 24) throw Error('Settings controls stretched across the modal');
    const dialog = page.getByRole('dialog');
    if (await dialog.evaluate(el => el.scrollWidth > el.clientWidth + 1)) throw Error('Settings modal overflows horizontally');
  };
  await checkSettingsSize();
  await page.getByText('Fixture preference', { exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#source-setting-0')?.getAttribute('aria-checked') === 'true');
  await preferenceSwitch.focus(); await page.keyboard.press('Space');
  await page.waitForFunction(() => document.querySelector('#source-setting-0')?.getAttribute('aria-checked') === 'false');
  await page.screenshot({ path: '.cache/extension-feasibility/extensions-settings-mobile.png' });
  await page.setViewportSize({ width: 1280, height: 900 }); await checkSettingsSize();
  await page.screenshot({ path: '.cache/extension-feasibility/extensions-settings-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.keyboard.press('Escape'); console.log('Native Mihon controls passed');
  await page.getByRole('button', { name: 'Open sideload' }).click(); modal = page.getByRole('dialog');
  await modal.getByLabel('Manifest or package URL').fill('https://repo.test/repo.json');
  await modal.getByRole('button', { name: 'Read extension', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[role="dialog"] [role="tab"][data-state="active"]')?.textContent === 'Local repositories');
  if (await modal.getByLabel('Repository URL').inputValue() !== 'https://repo.test/repo.json' || await modal.getByRole('tab', { name: 'Mihon', exact: true }).getAttribute('data-state') !== 'active') throw Error('Sideload discarded repository information');
  await modal.getByRole('button', { name: 'Add repository', exact: true }).click();
  await modal.getByRole('switch', { name: 'Fixture source', exact: true }).waitFor();
  const duplicates = await page.evaluate(() => { const ids = [...document.querySelectorAll('[id]')].map(e => e.id); return ids.filter((id, i) => ids.indexOf(id) !== i); });
  if (duplicates.length) throw Error('Duplicate source control identifiers');
  await page.keyboard.press('Escape');
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Mobile overflow');
  await page.getByRole('button', { name: 'Remove', exact: true }).click(); await inventory.waitFor({ state: 'hidden' });
  await page.getByLabel('Hub search').fill(''); await page.getByRole('tab', { name: 'Sora', exact: true }).click();
  await page.getByLabel('Repository URL').fill('https://sora.test/repo.json'); await page.getByRole('button', { name: 'Add repository', exact: true }).click();
  await page.getByRole('button', { name: 'Install', exact: true }).click(); await inventory.getByText('Fixture Sora', { exact: true }).waitFor();
  await page.getByRole('switch', { name: 'Fixture Sora', exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('[role="switch"]')].some(e => e.id.includes('compat-sora-') && e.getAttribute('aria-checked') === 'true'));
  const mapping = await page.evaluate(async () => {
    const mapped = await window.nativeMapping.chapters({ title: 'Fixture title 雨' }); const source = mapped.chapters[0]?.sources[0];
    if (!source) throw Error('Sora did not join main reader mapping: ' + JSON.stringify(mapped));
    const read = await window.nativeMapping.readPages({ extensionId: source.provider, chapterKey: source.chapterKey, providerChapterId: source.providerChapterId });
    if (!read.success) throw Error('Main read-page adapter rejected Sora pages');
    return { mapped, pages: read.data, http: window.soraHttp };
  });
  if (mapping.pages.pages[0]?.imageUrl !== 'https://source.test/page.jpg' || !mapping.http.some(r => r.headers.cookie === 'fixture-cookie')) throw Error('Sora original identifiers or headers changed');
  if (!mapping.mapped.chapters[0].sources[0].providerName.includes(' · ')) throw Error('Source label encoding changed');
  console.log('Interpreted Sora search/chapter/page mapping and headers passed');
  await page.reload({ waitUntil: 'domcontentloaded' }); await inventory.getByText('Fixture Sora', { exact: true }).waitFor();
  await page.getByRole('tab', { name: 'Sora', exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('[role="switch"]')].some(e => e.id.includes('compat-sora-') && e.getAttribute('aria-checked') === 'true'));
  await page.evaluate(() => { window.soraVersion = '2'; window.soraBroken = true; });
  await page.getByRole('button', { name: 'Refresh', exact: true }).click(); await page.getByRole('button', { name: 'Update', exact: true }).click(); await page.getByRole('alert').first().waitFor();
  const recovered = await page.evaluate(() => window.nativeMapping.chapters({ title: 'Fixture title 雨' })); if (!recovered.chapters.length) throw Error('Failed update replaced the installed module');
  const cancelled = await page.evaluate(async () => { const controller = new AbortController(); const began = performance.now(); setTimeout(() => controller.abort(new Error('cancel fixture')), 100); try { await window.nativeMapping.executeSora('while(true){}', 'probe', [], controller.signal); return null; } catch (error) { return { message: error.message, elapsed: performance.now() - began }; } });
  if (!cancelled?.message.includes('cancel fixture') || cancelled.elapsed > 3000) throw Error('Guest cancellation failed');
  await page.getByRole('button', { name: 'Remove', exact: true }).click(); await inventory.waitFor({ state: 'hidden' });
  await page.evaluate(() => { window.soraVersion = '1'; window.soraBroken = false; window.soraKind = 'anime'; });
  await page.getByRole('button', { name: 'Refresh', exact: true }).click(); await page.getByText('Fixture Sora Anime', { exact: true }).waitFor(); await page.getByRole('button', { name: 'Install', exact: true }).click();
  await inventory.getByText('Fixture Sora Anime', { exact: true }).waitFor(); await page.getByRole('switch', { name: 'Fixture Sora Anime', exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('[role="switch"]')].some(e => e.id.includes('compat-sora-') && e.getAttribute('aria-checked') === 'true'));
  const video = await page.evaluate(async () => ({ sources: await window.nativeMapping.streams({ title: 'Fixture title 雨', episode: 1 }), proxies: window.soraProxies }));
  if (video.sources.length !== 2 || video.sources[0].audioLanguage !== 'jpn') throw Error('Sora streams did not reach watch mapping');
  const videoHeaders = video.proxies.find(p => p.url === 'https://stream.test/video.m3u8')?.headers;
  if (videoHeaders?.cookie !== 'video-cookie' || videoHeaders.referer !== 'https://required.test/') throw Error('Sora changed declared video headers');
  const noHeaders = video.proxies.find(p => p.url === 'https://stream.test/headerless.m3u8');
  if (!noHeaders || Object.keys(noHeaders.headers).length) throw Error('Headerless HLS bypassed the native proxy or gained a guessed header');
  if (!video.proxies.some(p => p.url === 'https://subtitle.test/en.vtt' && (p.headers.Cookie || p.headers.cookie) === 'subtitle-cookie')) throw Error('Sora lost subtitle headers');
  await page.getByRole('button', { name: 'Remove', exact: true }).click(); await inventory.waitFor({ state: 'hidden' });
  console.log('Interpreted Sora watch mapping, headerless HLS proxy and subtitle headers passed');
  await page.getByRole('button', { name: 'Open sideload' }).click(); modal = page.getByRole('dialog');
  await modal.getByLabel('Manifest or package URL').fill('https://mangayomi.test/index.json'); await modal.getByRole('button', { name: 'Read extension', exact: true }).click();
  await modal.getByRole('tab', { name: 'Mangayomi', exact: true }).waitFor();
  if (await modal.getByRole('tab', { name: 'Mangayomi', exact: true }).getAttribute('data-state') !== 'active') throw Error('Mangayomi repository was not detected');
  await modal.getByRole('button', { name: 'Add repository', exact: true }).click();
  await modal.getByRole('button', { name: 'Install', exact: true }).click(); await modal.getByRole('button', { name: 'Remove', exact: true }).waitFor();
  if (await modal.getByText('Dart source', { exact: true }).count()) throw Error('Unsupported Dart source offered as JavaScript');
  await modal.getByRole('switch', { name: 'Fixture Mangayomi', exact: true }).click();
  await modal.getByRole('link', { name: 'Browse', exact: true }).waitFor(); await page.keyboard.press('Escape'); await inventory.getByText('Fixture Mangayomi', { exact: true }).waitFor();
  await page.getByRole('tab', { name: 'Mangayomi', exact: true }).click();
  await page.getByRole('button', { name: /^Settings for Fixture Mangayomi/ }).click(); modal = page.getByRole('dialog');
  await modal.getByLabel('Source cookie').fill('saved-cookie'); await modal.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(async () => { const sources = await window.nativeMapping.request({ op: 'sources', ecosystem: 'mangayomi' }); const rows = await window.nativeMapping.request({ op: 'preferences', sourceId: sources[0].id }); return rows[0]?.value === 'saved-cookie'; }); await page.keyboard.press('Escape');
  const manga = await page.evaluate(async () => {
    const mapped = await window.nativeMapping.chapters({ title: 'Fixture title 雨' }), source = mapped.chapters[0]?.sources[0];
    if (!source) throw Error('Mangayomi did not join reader mapping');
    return { mapped, pages: await window.nativeMapping.readPages({ extensionId: source.provider, chapterKey: source.chapterKey }), requests: window.soraHttp, proxies: window.soraProxies };
  });
  if (manga.mapped.chapters[0].number !== 17 || !manga.pages.success || !manga.requests.some(r => r.url.startsWith('https://mangayomi-source.test/search?') && r.headers.cookie === 'saved-cookie') || !manga.proxies.some(p => p.url.endsWith('/page.jpg') && p.headers.cookie === 'saved-cookie')) throw Error('Mangayomi reader numbers, HTTP or page headers changed');
  await page.reload({ waitUntil: 'domcontentloaded' }); await inventory.getByText('Fixture Mangayomi', { exact: true }).waitFor(); await page.getByRole('tab', { name: 'Mangayomi', exact: true }).click();
  await page.evaluate(() => { window.mangayomiVersion = '2'; window.mangayomiBroken = true; });
  await page.getByRole('button', { name: 'Refresh', exact: true }).click(); await page.getByRole('button', { name: 'Update', exact: true }).click(); await page.getByRole('alert').first().waitFor();
  if (!(await page.evaluate(() => window.nativeMapping.chapters({ title: 'Fixture title 雨' }))).chapters.length) throw Error('Mangayomi failed update replaced working source');
  await page.getByRole('button', { name: 'Remove', exact: true }).click(); await inventory.waitFor({ state: 'hidden' });
  await page.evaluate(() => { window.mangayomiVersion = '1'; window.mangayomiBroken = false; window.mangayomiKind = 1; });
  await page.getByRole('button', { name: 'Refresh', exact: true }).click(); await page.getByRole('button', { name: 'Install', exact: true }).click();
  await inventory.getByText('Fixture Mangayomi', { exact: true }).waitFor(); await page.getByRole('switch', { name: 'Fixture Mangayomi', exact: true }).click();
  await page.getByRole('link', { name: 'Browse', exact: true }).waitFor();
  const anime = await page.evaluate(() => window.nativeMapping.streams({ title: 'Fixture title 雨', episode: 17 }));
  if (anime.length !== 1 || !anime[0].providerName.includes('Mangayomi')) throw Error('Mangayomi video did not reach main watch mapping');
  await page.getByRole('button', { name: 'Remove', exact: true }).click(); await inventory.waitFor({ state: 'hidden' });
  console.log('Mangayomi original provider API, detached CSS, preferences/headers, main read/watch mapping, sideload, installed inventory, persistence, failed update and removal passed');
  await page.getByRole('button', { name: 'Open sideload' }).click(); modal = page.getByRole('dialog');
  await modal.getByLabel('Manifest or package URL').fill('https://aniyomi.test/index.min.json'); await modal.getByRole('button', { name: 'Read extension', exact: true }).click();
  await modal.getByRole('tab', { name: 'Aniyomi', exact: true }).waitFor();
  if (await modal.getByRole('tab', { name: 'Aniyomi', exact: true }).getAttribute('data-state') !== 'active') throw Error('Aniyomi repository was not detected');
  await modal.getByRole('button', { name: 'Add repository', exact: true }).click(); await modal.getByRole('button', { name: 'Install all (1)', exact: true }).click();
  await modal.getByText(/1 installed, 0 failed; 1 of 1 processed/).waitFor();
  await modal.getByRole('switch', { name: 'Aniyomi fixture source', exact: true }).click();
  if (await modal.getByRole('link', { name: 'Browse', exact: true }).getAttribute('href') !== '/x/compat-aniyomi/compat-aniyomi-ui') throw Error('Aniyomi source route changed');
  await page.keyboard.press('Escape'); await inventory.getByText('Fixture Aniyomi', { exact: true }).waitFor();
  await inventory.getByRole('button', { name: 'Manage Fixture Aniyomi' }).click(); modal = page.getByRole('dialog');
  if (await modal.getByRole('tab', { name: 'Aniyomi', exact: true }).getAttribute('data-state') !== 'active') throw Error('Aniyomi installed package opened the wrong runtime');
  await modal.getByRole('button', { name: 'Remove', exact: true }).click(); await inventory.waitFor({ state: 'hidden' }); await page.keyboard.press('Escape');
  console.log('Aniyomi sideload detection, installation, source enable/browse, installed inventory/manage and removal passed');
  await page.goto(base + '?web=1', { waitUntil: 'domcontentloaded' }); await page.getByLabel('Hub search').waitFor();
  if (await inventory.count() || await page.getByRole('button', { name: 'Add repository' }).count()) throw Error('Web exposes native extension controls');
  await page.getByRole('button', { name: 'Open sideload' }).click(); if (await page.getByRole('tab', { name: 'Local repositories', exact: true }).count()) throw Error('Web exposes native repository tab');
  await page.goto(base + '?prepare=1', { waitUntil: 'domcontentloaded' }); await page.getByRole('button', { name: 'Download local runtime', exact: true }).click();
  await page.getByText(/Extracting runtime files.*50%/).waitFor(); if (await page.getByRole('progressbar').getAttribute('aria-valuenow') !== '50') throw Error('Missing accessible extraction progress');
  await page.getByRole('button', { name: 'Cancel preparation', exact: true }).click(); await page.getByRole('button', { name: 'Download local runtime', exact: true }).waitFor();
  await page.goto(base + '?prepare=1&bundled=1', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Prepare local runtime', exact: true }).waitFor();
  if (await page.getByRole('button', { name: 'Download local runtime', exact: true }).count()) throw Error('Bundled runtime incorrectly promises a download');
  console.log('Bundled runtime preparation label passed');
  await page.goto(base + '?dense=1', { waitUntil: 'domcontentloaded' });
  await inventory.getByRole('button', { name: 'Manage Fixture extension' }).waitFor();
  if (await inventory.getByRole('button', { name: /^Manage / }).count() !== 36) throw Error('Large installed list was not paged');
  await inventory.getByRole('button', { name: /Show more/ }).click();
  if (await inventory.getByRole('button', { name: /^Manage / }).count() !== 72) throw Error('Installed pagination dropped packages');
  await page.setViewportSize({ width: 1280, height: 900 }); await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: '.cache/extension-feasibility/extensions-installed-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole('button', { name: 'Open sideload' }).click(); modal = page.getByRole('dialog');
  await modal.getByRole('tab', { name: 'Local repositories', exact: true }).click();
  await modal.getByRole('button', { name: 'Enable all (8)', exact: true }).click();
  await modal.getByText('8 of 8 languages enabled', { exact: true }).waitFor();
  if (await modal.getByRole('switch', { name: 'Fixture source', exact: true }).count() !== 1) throw Error('Provider languages rendered as duplicate providers');
  await modal.getByRole('button', { name: 'Disable all', exact: true }).click(); await modal.getByText('0 of 8 languages enabled', { exact: true }).waitFor();
  await modal.locator('summary').filter({ hasText: 'Languages' }).click();
  await modal.getByRole('switch', { name: 'English', exact: true }).click(); await modal.getByText('1 of 8 languages enabled', { exact: true }).waitFor();
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Grouped mobile modal overflows the viewport');
  await modal.getByText('1 of 8 languages enabled', { exact: true }).scrollIntoViewIfNeeded(); await page.screenshot({ path: '.cache/extension-feasibility/extensions-languages-mobile.png' });
  console.log('Large installed list pagination, logo fallbacks, grouped provider languages, bulk enable/disable and mobile dialog sizing passed');
  const resume = await browser.newPage(); resume.setDefaultTimeout(60000);
  resume.on('pageerror', error => errors.push(error.message));
  await resume.goto(base + '?resume=1', { waitUntil: 'domcontentloaded' });
  await resume.getByRole('button', { name: 'Seed remaining' }).click();
  await resume.getByRole('status').filter({ hasText: '"remaining":1' }).waitFor();
  await resume.evaluate(() => window.holdSearch = true);
  await resume.getByRole('button', { name: 'Search remaining' }).click();
  await resume.waitForFunction(() => !!window.releaseSearch);
  await resume.getByRole('button', { name: 'Cancel remaining' }).click();
  await resume.getByRole('status').filter({ hasText: '"busy":false' }).waitFor();
  if (!await resume.getByRole('status').filter({ hasText: '"sources":1,"remaining":1' }).count()) throw Error('Cancellation discarded existing streams or pending sources');
  await resume.evaluate(() => { window.holdSearch = false; window.releaseSearch(); });
  await resume.getByRole('button', { name: 'Search remaining' }).click();
  await resume.getByRole('status').filter({ hasText: '"sources":2,"remaining":0,"busy":false' }).waitFor();
  if (await resume.evaluate(() => window.resumeSearches) !== 2) throw Error('Continuation repeated completed sources');
  await resume.close(); console.log('Watch continuation, original pending source ID, preserved streams, cancellation and retry passed');
  const automatic = await browser.newPage(); automatic.setDefaultTimeout(60000);
  automatic.on('pageerror', error => errors.push(error.message));
  await automatic.addInitScript(() => { const original = window.setTimeout; window.setTimeout = (fn, ms, ...args) => original(fn, ms === 120000 ? 0 : ms, ...args); });
  await automatic.goto(base + '?continuous=1', { waitUntil: 'domcontentloaded' });
  await automatic.getByRole('status').filter({ hasText: '"sources":20,"remaining":0,"busy":false,"fetching":false' }).waitFor();
  if (await automatic.evaluate(() => window.resumeSearches) !== 20) throw Error('Automatic watch lookup skipped original providers');
  await automatic.goto(base + '?continuous=1&hold=1', { waitUntil: 'domcontentloaded' });
  await automatic.waitForFunction(() => !!window.releaseSearch);
  await automatic.getByRole('status').filter({ hasText: '"sources":1' }).waitFor();
  await automatic.getByRole('button', { name: 'Stop lookup' }).click();
  await automatic.getByRole('status').filter({ hasText: '"sources":1,"remaining":0,"busy":false,"fetching":false' }).waitFor();
  await automatic.evaluate(async () => { window.releaseSearch(); await new Promise(resolve => setTimeout(resolve, 20)); });
  if (await automatic.evaluate(() => window.resumeSearches) !== 2) throw Error('Stopped lookup continued queued work');
  await automatic.close(); console.log('All 20 queued original source identities searched automatically despite simulated legacy batch expiry');
  if (errors.length) throw Error(errors.join('\n'));
  console.log('Native repository/install/enable/browse/preferences, sideload, installed inventory/search/manage/removal, web exclusion, progress/cancel and interpreted Sora mapping/headers/restart/failed-update/cancellation passed.');
} catch (error) { console.error('Compatibility UI probe failed:', error.message); if (page) console.error((await page.locator('body').innerText()).slice(-6000)); throw error; }
finally { await browser?.close(); server.httpServer?.closeAllConnections(); await server.close(); await rm(fixture, { recursive: true, force: true }); }
