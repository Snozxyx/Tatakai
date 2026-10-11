import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.PROFILE_TEST_URL || 'http://127.0.0.1:8090';
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const mockModule = (path, body) => page.route(`**/${path}*`, route => route.fulfill({ contentType: 'text/javascript', body }));
await page.addInitScript(() => {
  window.downloadCalls = [];
  window.electron = {
    getDownloadsDir: async () => '/fixture', getOfflineLibrary: async () => [],
    getDownloadRecovery: async () => ({autoResume:window.resumePreference!==false,jobs:window.recoveryResumed?[]:[{id:'anime-job',type:'anime',title:'Fixture Anime'},{id:'manga-job',type:'manga',title:'Fixture Manga'}]}),
    setDownloadAutoResume: async enabled => {window.resumePreference=enabled;return window.electron.getDownloadRecovery();},
    resumeInterruptedDownloads: async () => {window.recoveryResumed=true;return {success:true,results:[]};},
    manga: { getOfflineLibrary: async () => [] },
    autoDownload: { list: async () => [], subscribe: async (...args) => { window.downloadCalls.push(args); }, unsubscribe: async () => {} },
  };
});
await mockModule('src/hooks/ui/useIsNativeApp.ts', 'export const useIsNativeApp=()=>true,useIsDesktopApp=()=>true,useIsMobileApp=()=>false;');
await mockModule('src/hooks/media/useDownload.ts', 'export const useDownload=()=>({downloadStates:{},startDownload:async()=>{},cancelDownload:async()=>{}});');
await mockModule('src/hooks/media/useMangaDownload.ts', `export const useMangaDownload=()=>({
 downloadStates:{chapter:{jobId:'manga:123:c4',anilistId:123,chapterKey:'c4',title:'Fixture Manga',chapterLabel:'Vol 2 · Ch. 4',status:'downloading',progress:50,page:5,totalPages:10}},
 cancelChapter:async()=>{},enqueueChapter:async()=>({ok:true})});`);
await mockModule('src/hooks/media/useExtensionSourceStream.ts', `export const resolveExtensionApiBase=async()=>({namespaces:[]}),streamExtensionSources=async(ns,params,timeout,onSources)=>{
window.streamCalls=(window.streamCalls||0)+1;
const sources=[{url:'https://fixture.invalid/ep'+params.episode+'.m3u8',sourceType:'hls',audioLanguage:'ja',providerName:'Fixture'}];
onSources?.(sources);
await new Promise(resolve=>(window.finishStreams ||= []).push(resolve));
return sources;};`);
await mockModule('src/lib/api.ts', 'export const fetchEpisodeServers=async()=>[],fetchCombinedSources=async()=>({sources:[]});');
await mockModule('src/components/mobile/MobileOfflineLibrary.tsx', 'export const MobileOfflineLibrary=()=>null;');
await mockModule('src/components/layout/Sidebar.tsx', 'export const Sidebar=()=>null;');
await mockModule('src/components/layout/MobileNav.tsx', 'export const MobileNav=()=>null;');
await mockModule('src/components/modals/ImportAnimeModal.tsx', 'export const ImportAnimeModal=()=>null;');
await mockModule('src/components/modals/TorrentDownloadModal.tsx', 'export const TorrentDownloadModal=()=>null;');
await mockModule('src/components/ui/confirm-dialog.tsx', 'export const useConfirm=()=>async()=>true;');
await mockModule('src/core/download/download-history-service.ts', `export const getHistory=async()=>[{id:'manga-fixture',mediaType:'manga',animeId:123,animeTitle:'Fixture Manga',episodeNumber:4,episodeId:'chapter',chapterKey:'c4',chapterLabel:'Vol 2 · Ch. 4',status:'completed',sourceType:'images',resolvedLanguage:'unknown',startedAt:'2026-10-11T00:00:00Z',completedAt:'2026-10-11T00:01:00Z',retryCount:0}];
export const getDownloadStats=async()=>({total:1,completed:1,failed:0,cancelled:0,totalSizeBytes:0}),clearAllHistory=async()=>{},recordDownload=async()=>{};`);
await page.route('**/__download-followup', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>(type)=>type;window.__vite_plugin_react_preamble_installed__=true;import '/src/index.css';</script></head><body><div id="fixture"></div></body></html>` }));
try {
  await page.goto(`${base}/__download-followup`);
  await page.evaluate(async () => {
    const source = await (await fetch('/src/components/anime/SeasonDownloadModal.tsx')).text();
    const version = source.match(/react\.js\?v=([^"']+)/)[1];
    const { default: React } = await import(`/node_modules/.vite/deps/react.js?v=${version}`);
    const { default: { createRoot } } = await import(`/node_modules/.vite/deps/react-dom_client.js?v=${version}`);
    const { SeasonDownloadModal } = await import('/src/components/anime/SeasonDownloadModal.tsx');
    const { default: OfflineLibraryPage } = await import('/src/pages/profile/OfflineLibraryPage.tsx');
    const { DownloadResumeSetting } = await import('/src/components/settings/DownloadResumeSetting.tsx');
    const { MemoryRouter } = await import(`/node_modules/.vite/deps/react-router-dom.js?v=${version}`);
    const h = React.createElement;
    window.root = createRoot(document.getElementById('fixture'));
    window.mountDownload = () => window.root.render(h(SeasonDownloadModal, {
      isOpen: true, onClose() {}, animeId: 'internal-id', anilistId: 123, animeName: 'Fixture Anime', posterUrl: '',
      episodes: [
        { episodeId: 'one', number: 1, title: 'Released One', hasAired: true },
        { episodeId: 'two', number: 2, title: 'Released Two', hasAired: true },
        { episodeId: 'three', number: 3, title: 'Upcoming Three', airDateUtc: '2099-10-17T00:00:00Z' },
        { episodeId: 'four', number: 4, title: 'Undated Four', hasAired: true },
      ],
    }));
    window.mountLibrary = () => window.root.render(h(MemoryRouter, null, h(OfflineLibraryPage)));
    window.mountResumeSetting = () => window.root.render(h(DownloadResumeSetting));
    window.mountDownload();
  });
  await page.getByRole('button', { name: /Choose episodes/ }).click();
  await page.getByText('Released Two', { exact: true }).waitFor();
  assert.equal(await page.getByText('Upcoming Three', { exact: true }).count(), 0);
  assert.equal(await page.getByText('Undated Four', { exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Select all', exact: true }).click();
  await page.getByRole('button', { name: 'Continue with 2 episodes' }).waitFor();
  await page.getByRole('button', { name: 'Continue with 2 episodes' }).click();
  await page.getByRole('button', { name: 'Japanese', exact: true }).waitFor();
  assert.equal(await page.getByText('Detecting available sources…', { exact: true }).count(), 0);
  assert.equal(await page.evaluate(() => window.streamCalls), 1);
  await page.evaluate(() => window.finishStreams.shift()());
  await page.waitForFunction(() => window.streamCalls === 2);
  await page.evaluate(() => window.finishStreams.shift()());
  await page.getByRole('button', { name: 'Episodes', exact: true }).click();
  await page.getByRole('tab', { name: 'Auto-Download' }).click();
  await page.getByRole('button', { name: 'Enable', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.downloadCalls), [['internal-id', 'Fixture Anime', 3, 123]]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('tab', { name: 'Episodes', exact: true }).click();
  await page.screenshot({ path: '.artifacts/download-picker-narrow.png' });
  await page.evaluate(() => window.root.render(null));
  await page.getByRole('tab', { name: 'Episodes', exact: true }).waitFor({ state: 'hidden' });
  await page.evaluate(() => window.mountDownload());
  await page.getByRole('button', { name: /Choose episodes/ }).click();
  await page.getByRole('button', { name: 'Select all', exact: true }).click();
  await page.getByRole('button', { name: 'Continue with 2 episodes' }).click();
  await page.getByRole('button', { name: 'Japanese', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.streamCalls), 2);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => window.mountLibrary());
  await page.getByText('Active Downloads (1)').waitFor();
  await page.getByText('50% · 5/10 pages').waitFor();
  await page.evaluate(() => window.mountResumeSetting());
  await page.getByRole('switch', {name:'Resume interrupted downloads'}).waitFor();
  assert.equal(await page.getByRole('switch', {name:'Resume interrupted downloads'}).getAttribute('aria-checked'), 'true');
  await page.getByRole('switch', {name:'Resume interrupted downloads'}).click();
  await page.waitForFunction(() => window.resumePreference === false);
  await page.getByRole('switch', {name:'Resume interrupted downloads'}).click();
  await page.waitForFunction(() => window.resumePreference === true);
  assert.equal(await page.evaluate(()=>window.resumePreference), true);
  await page.screenshot({path:'.artifacts/download-resume-setting.png'});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.screenshot({path:'.artifacts/download-resume-setting-mobile.png'});
  await page.setViewportSize({width:1280,height:900});
  await page.evaluate(() => window.mountLibrary());
  await page.getByRole('button', {name:'Resume interrupted (2)'}).click();
  await page.getByRole('button', {name:'Resume interrupted (0)'}).waitFor();
  await page.screenshot({ path: '.artifacts/manga-active-download.png' });
  await page.getByRole('tab', { name: /History/ }).click();
  await page.getByText('Vol 2 · Ch. 4', { exact: true }).last().waitFor();
  await page.screenshot({ path: '.artifacts/manga-download-history.png' });
  assert.deepEqual(errors, []);
  console.log('PASS: released-only picker, auto-download episode cursor, narrow layout, desktop manga progress and history');
} finally { await browser.close(); }
