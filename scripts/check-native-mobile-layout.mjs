import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.MOBILE_TEST_URL || 'http://127.0.0.1:8091';
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
const context = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/*', route => {
  const url = new URL(route.request().url());
  if (url.origin !== base || url.pathname.startsWith('/api/')) return route.fulfill({ contentType: 'application/json', body: '[]' });
  return route.continue();
});
await page.route('**/src/contexts/AuthContext.tsx*', route => route.fulfill({contentType:'application/javascript',body:'export function useAuth(){return {user:null,profile:null,isLoading:false,isAdmin:false,isModerator:false,isBanned:false}}'}));
await page.route('**/src/hooks/ui/useTheme.ts*', route => route.fulfill({contentType:'application/javascript',body:'export function useTheme(){return {isUltraLite:true,reduceMotion:false,theme:"midnight"}}'}));
await page.route('**/src/hooks/user/useMangaReadlist.ts*', route => route.fulfill({contentType:'application/javascript',body:`
export const useMangaContinueReading=()=>({data:[1,2,3].map(i=>({id:String(i),manga_id:String(i),manga_title:'The Moonlit Journey '+i,manga_poster:'/assets/image/content/tech-savvy-anime-programmer-s-haven-backiee-HD.jpg',last_chapter_number:12,last_page_index:9,total_pages:40,last_chapter_key:'chapter12',last_provider:'fixture'})),isLoading:false});
export const useMangaReadlistItem=()=>({data:null});export const useUpsertMangaReadlist=()=>({mutate:()=>{}});export const useRemoveFromMangaReadlist=()=>({mutate:()=>{}});`}));
await page.route('**/fixture-logo.svg', route => route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="140"><text x="300" y="90" fill="white" text-anchor="middle" font-family="serif" font-size="72" font-weight="bold">STARFALL</text></svg>'}));
await page.route('**/broken-art*', route => route.fulfill({status:404,body:''}));
await page.route('**/__native-layout-check', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>(type)=>type; window.__vite_plugin_react_preamble_installed__=true; import '/src/index.css';</script></head><body><div id="root"></div></body></html>` }));
async function mount() {
  await page.goto(`${base}/__native-layout-check`);
  await page.evaluate(async () => {
    const source = await (await fetch('/src/components/anime/AnimeGrid.tsx')).text();
    const version = source.match(/react\.js\?v=([^"']+)/)[1];
    const {default: React} = await import(`/node_modules/.vite/deps/react.js?v=${version}`);
    const {default: {createRoot}} = await import(`/node_modules/.vite/deps/react-dom_client.js?v=${version}`);
    const {BrowserRouter} = await import(`/node_modules/.vite/deps/react-router-dom.js?v=${version}`);
    const {QueryClient, QueryClientProvider} = await import(`/node_modules/.vite/deps/@tanstack_react-query.js?v=${version}`);
    const {HeroSection} = await import('/src/components/anime/HeroSection.tsx');
    const {CinematicHero, CinematicHeroSkeleton, MobileHomeBackdrop} = await import('/src/components/anime/CinematicHero.tsx');
    const {MangaHeroSection} = await import('/src/components/manga/MangaHeroSection.tsx');
    const {MangaTrendingGrid} = await import('/src/components/manga/MangaTrendingGrid.tsx');
    const {LocalContinueWatching} = await import('/src/components/anime/LocalContinueWatching.tsx');
    const {LastReadMangaSection} = await import('/src/components/manga/LastReadMangaSection.tsx');
    const {Header} = await import('/src/components/layout/Header.tsx');
    const {AnimeGrid} = await import('/src/components/anime/AnimeGrid.tsx');
    const {TrendingGrid} = await import('/src/components/anime/TrendingGrid.tsx');
    const {LatestEpisodes} = await import('/src/components/anime/LatestEpisodes.tsx');
    const {MobileAppearanceSelector} = await import('/src/components/settings/MobileAppearanceSelector.tsx');
    const {useMobileAppearance} = await import('/src/hooks/ui/useMobileAppearance.ts');
    const {installMobileLayout} = await import('/src/lib/mobile/layout.ts');
    const {patchMobileConfig} = await import('/src/hooks/ui/useMobileConfig.ts');
    installMobileLayout();
    window.patchLayout = value => patchMobileConfig({mobileLayout:value});
    const art='/assets/image/content/tech-savvy-anime-programmer-s-haven-backiee-HD.jpg';
    const titles=['Starfall','An exceptionally long anime title that should fit within the reserved title space','Moonlit Journey','The Last Guardian','Beyond the Horizon'];
    window.fixtureItems=titles.map((name,i)=>({id:String(101+i),name,jname:name,poster:art,banner:art,titleLogo:i===0?'/fixture-logo.svg':undefined,rank:i+1,description:'An unforgettable journey through a world of wonder. Discover your next story.',otherInfo:['TV','2026','HD'],episodes:{sub:24,dub:12}}));
    localStorage.setItem('anime-continue-watching',JSON.stringify(window.fixtureItems.slice(0,3).map((item,i)=>({animeId:item.id,animeName:item.name,animePoster:art,episodeId:'episode'+i,episodeNumber:i+1,progressSeconds:200,durationSeconds:1400}))));
    const h=React.createElement;
    function Harness(){
      const refreshed=useMobileAppearance();
      const [items,setItems]=React.useState(window.fixtureItems);
      const [active,setActive]=React.useState(window.fixtureItems[0]);
      const [skeleton,setSkeleton]=React.useState(false);
      const [manga,setManga]=React.useState(false); window.setManga=setManga;
      window.setFixtureItems=setItems; window.setSkeleton=setSkeleton;
      return h('div',{className:'relative min-h-screen bg-background text-foreground'},
        refreshed&&h(MobileHomeBackdrop,{anime:active}),
        h('main',{'data-mobile-home':true,className:'relative z-10 p-6'},h(Header),
          skeleton?h(CinematicHeroSkeleton):items.length?h(manga?MangaHeroSection:HeroSection,{spotlight:items[0],spotlights:items,onActiveSpotlightChange:setActive}):h(CinematicHero,{spotlights:[]}),
          h('div',{'data-home-sections':true,className:'mt-8 space-y-10'},
            h(LocalContinueWatching),h(LastReadMangaSection),h(LatestEpisodes,{animes:window.fixtureItems}),manga?h(MangaTrendingGrid,{items:window.fixtureItems}):h(TrendingGrid,{animes:window.fixtureItems}),
            h(AnimeGrid,{title:'Most Popular',gridSize:'compact',animes:window.fixtureItems}))),
        h('aside',{className:'p-4'},h(MobileAppearanceSelector)));
    }
    createRoot(document.getElementById('root')).render(h(BrowserRouter,null,h(QueryClientProvider,{client:new QueryClient({defaultOptions:{queries:{retry:false}}})},h(Harness))));
  });
  await page.locator('fieldset').waitFor();
}
const metrics = () => page.evaluate(() => {
  const grid=document.querySelector('[data-mobile-poster-grid]');
  const posters=[...document.querySelectorAll('[data-mobile-poster-grid] [data-mobile-poster-image]')].map(e=>{
    const r=e.getBoundingClientRect();return {aspect:getComputedStyle(e).aspectRatio,width:r.width,height:r.height,top:r.top};
  });
  return {posters, flow:getComputedStyle(grid).gridAutoFlow,overflow:document.documentElement.scrollWidth>innerWidth,layout:document.documentElement.dataset.mobileLayout};
});
try {
  await mount(); console.log('Mounted real header, hero, and poster sections');
  for(const native of [false,true]){
    await page.evaluate(native=>document.documentElement.classList.toggle('capacitor-native',native),native);
    for(const width of [320,360,393,430]){
      await page.setViewportSize({width,height:852});
      await page.evaluate(()=>window.patchLayout('refreshed'));
      await page.locator('.cinematic-hero').waitFor();
      const m=await metrics();assert.equal(m.layout,'refreshed');assert.equal(m.overflow,false);assert.equal(m.flow,'column');
      const resume=await page.locator('[data-mobile-home-rail=resume]').evaluateAll(rails=>rails.map(rail=>({flow:getComputedStyle(rail).gridAutoFlow,columns:getComputedStyle(rail).gridAutoColumns})));
      assert.equal(resume.length,2);assert.ok(resume.every(rail=>rail.flow==='column'&&parseFloat(rail.columns)>=280));
      assert.ok(m.posters.every(p=>p.aspect==='2 / 3'));assert.equal(new Set(m.posters.map(p=>p.top)).size,1);
      const trending=await page.locator('[data-mobile-trending-card]').evaluateAll(elements=>elements.map(e=>({top:e.offsetTop,ratio:e.offsetWidth/e.offsetHeight})));
      assert.equal(new Set(trending.map(p=>p.top)).size,1);assert.ok(trending.every(p=>Math.abs(p.ratio-2/3)<.01));
      await page.getByRole('radio',{name:/Classic/}).check({force:true});
      await page.waitForFunction(()=>!document.querySelector('.cinematic-hero'));
      assert.equal((await metrics()).layout,'classic');
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('tatakai_mobile_config')).mobileLayout),'classic');
    }
  }
  console.log('Phone layout and Classic checks passed');
  await mount();assert.equal((await metrics()).layout,'classic');
  await page.getByRole('radio',{name:/Refreshed/}).check({force:true});
  await page.setViewportSize({width:393,height:852});await page.evaluate(()=>window.scrollTo(0,0));
  await page.locator('.cinematic-title img').waitFor();
  assert.equal(await page.locator('.cinematic-title img').getAttribute('src'),'/fixture-logo.svg');
  const backgroundTop=await page.locator('[data-mobile-home-backdrop]').evaluate(e=>e.getBoundingClientRect().top);
  const headerTop=await page.locator('[data-mobile-header]').evaluate(e=>e.getBoundingClientRect().top);
  assert.ok(backgroundTop<=headerTop);
  const touch=await context.newCDPSession(page);
  const bounds=await page.locator('.cinematic-poster[data-active="true"]').boundingBox();
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:bounds.x+bounds.width*.8,y:bounds.y+100}]});
  for(let step=1;step<=6;step++) await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:bounds.x+bounds.width*.8-step*28,y:bounds.y+100}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForFunction(()=>document.querySelector('.cinematic-poster[data-active="true"]')?.getAttribute('aria-label')!=='Show Starfall');
  await page.getByRole('button',{name:'Go to spotlight 2'}).click();
  await page.waitForFunction(()=>document.querySelector('.cinematic-title')?.textContent.includes('exceptionally'));
  await page.getByRole('button',{name:'Watch Now',exact:true}).click();assert.equal(new URL(page.url()).pathname,'/anime/102');
  await page.getByRole('button',{name:'Add to playlist',exact:true}).click();assert.equal(new URL(page.url()).pathname,'/auth');
  await page.getByRole('button',{name:'Go to spotlight 1'}).click();
  await page.getByRole('button',{name:'Show Starfall',exact:true}).focus();await page.keyboard.press('ArrowRight');
  await page.waitForFunction(()=>document.querySelector('.cinematic-title')?.textContent.includes('exceptionally'));
  await page.getByRole('button',{name:'Pause spotlight rotation'}).click();
  await page.locator('body').click({position:{x:2,y:2}});
  const before=await page.locator('.cinematic-title').textContent();await page.waitForTimeout(6200);assert.equal(await page.locator('.cinematic-title').textContent(),before);
  await page.getByRole('button',{name:'Resume spotlight rotation'}).click();await page.locator('body').click({position:{x:2,y:2}});
  await page.waitForFunction(text=>document.querySelector('.cinematic-title')?.textContent!==text,before,{timeout:8500});
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  const hiddenTitle=await page.locator('.cinematic-title').textContent();await page.waitForTimeout(6200);assert.equal(await page.locator('.cinematic-title').textContent(),hiddenTitle);
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>!document.querySelector('button[aria-label="Pause spotlight rotation"]'));
  await page.evaluate(()=>window.setFixtureItems([{...window.fixtureItems[0],titleLogo:'/broken-art',logo:'/fixture-logo.svg'}]));
  await page.waitForFunction(()=>document.querySelector('.cinematic-title img')?.getAttribute('src')==='/fixture-logo.svg');
  await page.evaluate(()=>window.setFixtureItems([{...window.fixtureItems[0],titleLogo:'/broken-art',logo:'/broken-art-2',poster:'/broken-art-poster'}]));
  await page.waitForFunction(()=>document.querySelector('.cinematic-title')?.textContent==='Starfall');
  await page.waitForFunction(()=>document.querySelector('.cinematic-poster img')?.getAttribute('src')==='/placeholder.svg');
  assert.equal(await page.getByRole('button',{name:/Go to spotlight/}).count(),0);
  await page.evaluate(()=>window.setFixtureItems([]));await page.waitForFunction(()=>!document.querySelector('.cinematic-hero'));
  await page.evaluate(()=>window.setFixtureItems(window.fixtureItems));await page.locator('.cinematic-hero').waitFor();
  for(const viewport of [{width:768,height:1024},{width:834,height:1112},{width:852,height:393}]){
    await page.setViewportSize(viewport);await page.evaluate(()=>window.patchLayout('refreshed'));await page.locator('.cinematic-hero').waitFor();
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:'.artifacts/mobile-refresh/tablet-'+viewport.width+'.png'});
    const refreshed=await metrics();assert.equal(refreshed.layout,'refreshed');assert.equal(refreshed.overflow,false);
    await page.evaluate(()=>window.patchLayout('classic'));await page.waitForFunction(()=>!document.querySelector('.cinematic-hero'));
  }
  for(const viewport of [{width:1024,height:768},{width:1280,height:800}]){
    await page.setViewportSize(viewport);await page.waitForFunction(()=>!document.querySelector('.cinematic-hero'));
    await page.evaluate(()=>window.patchLayout('refreshed'));const first=await metrics();
    await page.evaluate(()=>window.patchLayout('classic'));const second=await metrics();
    assert.equal(await page.locator('[data-desktop-header]').evaluate(el=>getComputedStyle(el).position),'relative');assert.equal(first.layout,undefined);assert.deepEqual({...first,posters:first.posters.map(({top,...p})=>p)},{...second,posters:second.posters.map(({top,...p})=>p)});
  }
  await page.setViewportSize({width:393,height:852});await page.evaluate(()=>window.patchLayout('refreshed'));await page.locator('.cinematic-hero').waitFor();
  await page.evaluate(()=>window.scrollTo(0,0));
  await mkdir('.artifacts/mobile-refresh',{recursive:true});
  for (const section of await page.locator('[data-home-sections] > section').all()) { await section.scrollIntoViewIfNeeded(); await page.waitForTimeout(150); }
  await page.evaluate(()=>window.scrollTo(0,0)); await page.waitForTimeout(200);
  await page.screenshot({path:'.artifacts/mobile-refresh/refreshed.png',fullPage:false});
  const heroHeight=await page.locator('.cinematic-hero').evaluate(e=>e.getBoundingClientRect().height);
  await page.evaluate(()=>window.setSkeleton(true));await page.locator('[aria-label="Loading spotlight"]').waitFor();
  const skeletonHeight=await page.locator('.cinematic-hero').evaluate(e=>e.getBoundingClientRect().height);assert.ok(Math.abs(heroHeight-skeletonHeight)<20);
  await page.evaluate(()=>window.setSkeleton(false));await page.getByRole('button',{name:'Watch Now',exact:true}).waitFor();
  let screenshotIndex=0;
  for(const section of await page.locator('[data-home-sections] > section').all()){
    await section.scrollIntoViewIfNeeded();await page.waitForTimeout(200);
    await section.screenshot({path:'.artifacts/mobile-refresh/section-'+screenshotIndex+++'.png'});
  }
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.evaluate(()=>window.setManga(true)); await page.getByRole('button',{name:'Read Now'}).waitFor();
  await page.getByRole('button',{name:'Go to spotlight 3'}).click();
  await page.waitForFunction(()=>document.querySelector('.cinematic-title')?.textContent==='Moonlit Journey');
  await page.getByRole('button',{name:'Read Now'}).click(); assert.equal(new URL(page.url()).pathname,'/manga/103');
  for(const width of [320,360,393,430]){
    await page.setViewportSize({width,height:852});
    const mangaGrid=await page.locator('[data-mobile-trending-grid]').evaluate(e=>getComputedStyle(e).gridAutoFlow);
    assert.equal(mangaGrid,'column');assert.equal((await metrics()).overflow,false);
  }
  await page.setViewportSize({width:393,height:852});await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:'.artifacts/mobile-refresh/manga.png',fullPage:false});
  await page.evaluate(()=>window.patchLayout('classic')); await page.waitForFunction(()=>!document.querySelector('.cinematic-hero'));
  await page.getByRole('button',{name:'Read Now'}).first().waitFor();
  await page.evaluate(()=>window.setManga(false));
  await page.evaluate(()=>window.patchLayout('classic'));await page.waitForFunction(()=>!document.querySelector('.cinematic-hero'));
  for (const section of await page.locator('[data-home-sections] > section').all()) { await section.scrollIntoViewIfNeeded(); await page.waitForTimeout(150); }
  await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(200);
  await page.screenshot({path:'.artifacts/mobile-refresh/classic.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS anime/manga native/web 320/360/393/430: single-row posters, no overflow, Classic restoration/persistence, title fallback, active routes, touch swipe, keyboard, rotation/pause/hidden/reduced-motion, empty/single/changing data, continuous header backdrop, tablet cinematic/Classic switch, desktop unchanged and header not sticky.');
}finally{await browser.close();}
