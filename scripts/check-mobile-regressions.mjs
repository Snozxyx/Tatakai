import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.env.MOBILE_TEST_URL || 'http://127.0.0.1:8090';
// Start Vite first: npm run dev:web -- --host 127.0.0.1
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
const errors = [];
page.on('pageerror', error => {errors.push(error.message);console.error('PAGE',error.message)});
await page.route('**/*', route => {
  const url = new URL(route.request().url());
  if (url.origin !== base || url.pathname.startsWith('/api/')) return route.fulfill({ status: 200, contentType: 'application/json', body: url.pathname.includes('/rest/v1/') ? '[]' : '{}' });
  return route.continue();
});
await page.route('**/src/contexts/AuthContext.tsx', route => route.fulfill({contentType:'application/javascript',body:`export function useAuth(){ return {user:window.testUser, profile:null, isLoading:false, refreshProfile:async()=>{}} }; export const AuthProvider=({children})=>children;`}));
await page.route('**/__mobile-regression', route => route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>(type)=>type; window.__vite_plugin_react_preamble_installed__=true; import '/src/index.css';</script></head><body><div id="test-root"></div></body></html>`}));
try {
 await page.goto(`${base}/__mobile-regression`);
 await page.evaluate(async () => {
  window.testUser = { id:'test-user', email:'test@example.test' };
  const source=await (await fetch('/src/pages/auth/OnboardingPage.tsx')).text();
  const version=source.match(/react\.js\?v=([^"']+)/)[1];
  const {default:React} = await import(`/node_modules/.vite/deps/react.js?v=${version}`);
  const {default:{createRoot}} = await import(`/node_modules/.vite/deps/react-dom_client.js?v=${version}`);
  const {BrowserRouter} = await import(`/node_modules/.vite/deps/react-router-dom.js?v=${version}`);
  const {QueryClient, QueryClientProvider} = await import(`/node_modules/.vite/deps/@tanstack_react-query.js?v=${version}`);
  const client = new QueryClient({defaultOptions:{queries:{retry:false}}});
  const root=createRoot(document.getElementById('test-root'));
  const h=React.createElement;
  window.mount = async (name,props={}) => {
   let C;
   if(name==='hero') {
    const {BoardHero}=await import('/src/components/anime/discover/BoardHero.tsx');
    const {PillGroup}=await import('/src/components/anime/discover/PillGroup.tsx');
    C=()=>h('div',{style:{padding:16}},h(BoardHero,{eyebrow:'Your collection',heading:'Everything you saved',description:'Your watchlist, the titles the recommenders think you should try next, and what the wider fandom keeps coming back to.',leader:{id:'1',title:'My Hero Academia Season 3',href:'/anime/1',poster:''},leaderPrefix:'Resume',ctaLabel:'Resume watching',items:[],stats:['1 saved','1 watching']},h(PillGroup,{label:'Collection filter',value:'favorites',onChange:()=>{},options:['For you','AI picks','All saved','Watching','Completed','Favorites'].map(label=>({id:label.toLowerCase(),label}))})));
   } else if(name==='onboarding') C=(await import('/src/pages/auth/OnboardingPage.tsx')).default;
   else if(name==='setup') C=(await import('/src/pages/auth/SetupPage.tsx')).default;
   else if(name==='debrid') C=(await import('/src/components/settings/DebridSettingsPanel.tsx')).DebridSettingsPanel;
   else if(name==='composer') C=(await import('/src/components/comments/RichCommentComposer.tsx')).RichCommentComposer;
   else C=()=>null;
   root.render(h(BrowserRouter,null,h(QueryClientProvider,{client},h(C,props))));
  };
 });
 await page.evaluate(()=>window.mount('hero'));
 await page.getByRole('heading',{name:'Everything you saved'}).waitFor();
 for(const width of [320,360,393,430]) {
  await page.setViewportSize({width,height:852}); await page.waitForTimeout(80);
  const metrics=await page.evaluate(()=>{const tab=document.querySelector('[role=tablist]');const heading=document.querySelector('h1');return {body:document.documentElement.scrollWidth,viewport:innerWidth,headingRight:heading.getBoundingClientRect().right,tabRight:tab.getBoundingClientRect().right,scroll:tab.scrollWidth>tab.clientWidth}});
  assert.ok(metrics.body<=width,JSON.stringify(metrics)); assert.ok(metrics.headingRight<=width); assert.ok(metrics.tabRight<=width); assert.equal(metrics.scroll,true);
 }
 console.log('PASS favorites hero fits 320–430px; filters scroll inside the card');
 await page.evaluate(()=>{localStorage.setItem('tatakai_onboarding_step:test-user',JSON.stringify('theme'));return window.mount('onboarding')});
 await page.getByRole('button',{name:'Start Exploring'}).waitFor();
 for(const width of [320,393,430]) {await page.setViewportSize({width,height:852});const r=await page.getByRole('button',{name:'Start Exploring'}).boundingBox();assert.ok(r.x>=0&&r.x+r.width<=width,JSON.stringify(r));}
 await page.evaluate(()=>window.mount('empty')); await page.waitForTimeout(30); await page.evaluate(()=>window.mount('onboarding')); await page.getByRole('button',{name:'Start Exploring'}).waitFor();
 await page.evaluate(()=>{window.testUser={...window.testUser};return window.mount('onboarding')});
 await page.getByRole('button',{name:'Start Exploring'}).waitFor();
 await page.waitForTimeout(600);
 await page.screenshot({path:'.mobile-onboarding-check.png',fullPage:false});
 console.log('PASS onboarding final action fits mobile; step survives remount and auth refresh');
 await page.evaluate(()=>{localStorage.setItem('tatakai_setup_step','6');return window.mount('setup')});
 const token='abcd0123-'.repeat(32)+'abcd0123';
 // Password inputs have no implicit textbox role.
 const keyInput=page.getByLabel('TorBox API Token');
 await keyInput.fill(token);await keyInput.press('Enter');
 await page.getByText('Step 6 of 7',{exact:true}).waitFor();assert.equal(await keyInput.inputValue(),token);
 await page.route('https://api.torbox.app/**',route=>{
   assert.equal(route.request().headers().authorization,`Bearer ${token}`);
   return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data:{id:17}})});
 });
 await page.getByRole('button',{name:'Verify & Use'}).nth(1).click();
 await page.getByRole('status').filter({hasText:'TorBox verified and selected.'}).waitFor();
 await page.evaluate(()=>window.mount('empty'));await page.waitForTimeout(30);await page.evaluate(()=>window.mount('setup'));
 await page.getByText('Step 6 of 7',{exact:true}).waitFor();assert.equal(await keyInput.inputValue(),token);
 console.log('PASS setup preserves step and verifies a long dashed token; Enter does not skip the step');
 await page.evaluate(()=>window.mount('composer',{draftKey:'anime:1',onSubmit:async()=>false}));
 const textarea=page.locator('textarea').first();await textarea.fill('Draft survives back navigation');
 await page.evaluate(()=>window.mount('empty'));await page.waitForTimeout(30);await page.evaluate(()=>window.mount('composer',{draftKey:'anime:1',onSubmit:async()=>false}));
 assert.equal(await textarea.inputValue(),'Draft survives back navigation');
 await page.evaluate(()=>window.mount('composer',{draftKey:'anime:2',onSubmit:async()=>false}));await page.waitForTimeout(50); assert.equal(await textarea.inputValue(),'');
 await page.evaluate(()=>window.mount('composer',{draftKey:'anime:1',onSubmit:async()=>false}));await page.waitForTimeout(50); assert.equal(await textarea.inputValue(),'Draft survives back navigation');
 await page.getByRole('button',{name:'Post Comment',exact:true}).click();assert.equal(await textarea.inputValue(),'Draft survives back navigation');
 await page.evaluate(()=>window.mount('composer',{draftKey:'anime:1',onSubmit:async()=>true}));await page.getByRole('button',{name:'Post Comment',exact:true}).click();assert.equal(await textarea.inputValue(),'');
 console.log('PASS comment drafts restore per thread, survive failure, and clear on success');
 await page.evaluate(()=>window.mount('empty'));
 await page.evaluate(()=>{
   const shell=document.createElement('div');shell.id='fullscreen-test';shell.style.cssText='transform:translateX(60px);filter:blur(0);contain:paint;position:relative;margin:40px;width:300px';
   shell.innerHTML='<div class="video-player-container is-player-fullscreen"></div>';document.body.append(shell);document.body.classList.add('mobile-player-fullscreen');
 });
 for(const viewport of [{width:852,height:393},{width:393,height:852}]){
  await page.setViewportSize(viewport);
  const rect=await page.locator('#fullscreen-test .video-player-container').boundingBox();
  assert.equal(rect.x,0);assert.equal(rect.y,0);assert.equal(rect.width,viewport.width);assert.equal(rect.height,viewport.height);
 }
 await page.evaluate(()=>{document.getElementById('fullscreen-test').remove();document.body.classList.remove('mobile-player-fullscreen')});
 console.log('PASS CSS fullscreen fills portrait and landscape viewports inside a transformed/clipping ancestor');
 await page.evaluate(async()=>{const source=await (await fetch('/src/lib/security/turnstile.ts')).text();const version=source.match(/@capacitor_core\.js\?v=([^"']+)/)[1];const {Capacitor}=await import(`/node_modules/.vite/deps/@capacitor_core.js?v=${version}`);Capacitor.isNativePlatform=()=>true;Capacitor.getPlatform=()=> 'ios';const {isTurnstileEnabled}=await import('/src/lib/security/turnstile.ts');if(isTurnstileEnabled())throw new Error('iOS captcha enabled');const oauth=await import('/src/lib/desktopOAuth.ts');if(oauth.getWebMalRedirectUri()!=='https://tatakai.me/api/mal/redirect')throw new Error('Native MAL callback does not match registration');const {getMalAuthUrl}=await import('/src/lib/mal.ts');const state=oauth.buildDesktopOAuthState();const url=new URL(getMalAuthUrl(oauth.getWebMalRedirectUri(),state));if(url.searchParams.get('state')!==state||url.searchParams.get('redirect_uri')!=='https://tatakai.me/api/mal/redirect'||url.searchParams.get('code_challenge')!==localStorage.getItem('mal_code_verifier'))throw new Error('OAuth state/PKCE/callback mismatch');const {toRoute}=await import('/src/components/mobile/MobileDeepLinkBridge.tsx');if(toRoute('tatakai://integration/mal/redirect?code=test&state='+state)!=='/integration/mal/redirect?code=test&state='+state)throw new Error('Native callback lost parameters');if(toRoute('https://eviltatakai.me/integration/mal/redirect?code=test')!==null)throw new Error('Untrusted callback accepted');});
 console.log('PASS native iOS disables Turnstile and uses HTTPS MAL callback');
 assert.deepEqual(errors,[]);
} finally {await browser.close();}
