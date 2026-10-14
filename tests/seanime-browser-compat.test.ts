import { it, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { buildSeanimeBundle } from '../src/core/extensions/remote/seanime';
const require = createRequire(import.meta.url);
const { SeanimeBrowserHost } = require('../desktop/runtime/extension/seanime-browser-host.cjs');
const { __tatakai_parse_html__ } = require('../desktop/runtime/extension/extension-worker-pool.cjs');

it('runs the pinned Comix search, chapters and pages after browser clearance capture', async () => {
 const code = readFileSync(new URL('./fixtures/seanime/comix.js', import.meta.url), 'utf8');
 const bundle = await buildSeanimeBundle(code, 'javascript');
 expect(bundle).toContain('await $sleep(');
 const calls: string[] = []; let closed = false;
 const browser = { navigate: async (url: string) => { calls.push(url); }, evaluate: async () => JSON.stringify({title:'Comix',userAgent:'FixtureBrowser/1'}), executeCDP: async (method: string) => { calls.push(method); return {cookies:[{name:'cf_clearance',value:'fixture-clearance',expires:Date.now()/1000+600}]}; }, sleep: async () => {}, close: async () => {closed=true;} };
 const chrome = { newBrowser: async (opts: any) => { expect(opts.headless).toBe(false); return browser; } };
 const fetcher = async (input: string, opts: any) => {
  const url = new URL(input);
  if (!opts.headers.Cookie) return new Response('Forbidden', {status:403,headers:{'cf-mitigated':'challenge'}});
  expect(opts.headers['User-Agent']).toBe('FixtureBrowser/1');
  if (url.pathname === '/') return new Response('<script src="/assets/main-fixture.js"></script>');
  if (url.pathname.endsWith('main-fixture.js')) return new Response('const file="secure-fixture.js";');
  if (url.pathname.endsWith('secure-fixture.js')) return new Response('window.vmFixture={install:function(c){c.interceptors.request.use(x=>x);c.interceptors.response.use(x=>x);}}; export {};');
  if (url.pathname.endsWith('/chapters/1234')) return Response.json({result:{pages:{baseUrl:'https://images.fixture',items:[{url:'one.webp'},{url:'two.webp'}]}}});
  if (url.pathname.includes('/chapters')) return Response.json({result:{items:[{id:1234,number:1,language:'en'}],meta:{lastPage:1}}});
  return Response.json({result:{items:[{hid:'abcd',slug:'naruto',title:'Naruto'}]}});
 };
 const mod: any = {exports:{}};
 new Function('module','__tatakai_fetch__','__tatakai_parse_html__','__tatakai_chromedp__',bundle)(mod,fetcher,__tatakai_parse_html__,chrome);
 const adapter=mod.exports;
 expect(await adapter.remoteSearch({query:'Naruto'})).toMatchObject([{id:'abcd|naruto',title:'Naruto'}]);
 expect(await adapter.remoteChapters({titleId:'abcd|naruto'})).toMatchObject([{id:'abcd|naruto|1234|1',chapter:'1',language:'en'}]);
 expect(await adapter.remotePages({chapterId:'abcd|naruto|1234|1'})).toMatchObject([{url:'https://images.fixture/one.webp',index:0},{url:'https://images.fixture/two.webp',index:1}]);
 expect(calls).toEqual(['https://comix.to','Network.getCookies']); expect(closed).toBe(true);
});

it('scopes browser sessions, cookies, evaluation and cleanup to the provider website', async () => {
 const windows: any[] = [];
 class Window {
  destroyed=false;url='';handlers:any={};options:any;
  webContents:any={getURL:()=>this.url,executeJavaScript:async()=> 'FixtureBrowser/1',setWindowOpenHandler:(fn:any)=>this.handlers.open=fn,on:(event:string,fn:any)=>this.handlers[event]=fn,session:{webRequest:{onBeforeRequest:(fn:any)=>this.handlers.request=fn},setPermissionRequestHandler:()=>{},cookies:{get:async()=>[{name:'cf_clearance',value:'fixture',expirationDate:1234}]}}};
  constructor(options:any){this.options=options;windows.push(this);}
  on(event:string,fn:any){this.handlers[event]=fn;}
  async loadURL(url:string){this.url=url;}
  isDestroyed(){return this.destroyed;}
  destroy(){this.destroyed=true;this.handlers.closed?.();}
 }
 const host=new SeanimeBrowserHost(['comix.to'],Window);
 const id=await host.call('newBrowser',null,[{headless:false}]);
 expect(windows[0].options.webPreferences).toMatchObject({nodeIntegration:false,sandbox:true,contextIsolation:true});
 await host.call('navigate',id,['https://comix.to']);
 expect(await host.call('evaluate',id,['navigator.userAgent'])).toBe('FixtureBrowser/1');
 expect(await host.call('executeCDP',id,['Network.getCookies',{urls:['https://comix.to']}])).toMatchObject({cookies:[{expires:1234}]});
 await expect(host.call('navigate',id,['http://localhost:4001'])).rejects.toThrow('outside');
 await expect(host.call('executeCDP',id,['Network.getCookies',{urls:['https://elsewhere.test']}])).rejects.toThrow('outside');
 await expect(host.call('executeCDP',id,['Browser.close',{}])).rejects.toThrow('Unsupported');
 let blocked=false;windows[0].handlers.request({url:'http://127.0.0.1:4001'},(r:any)=>blocked=r.cancel);expect(blocked).toBe(true);
 host.closeAll();expect(windows[0].destroyed).toBe(true);
 await expect(host.call('evaluate',id,['document.title'])).rejects.toThrow('closed');
});

it('bridges browser calls through a real desktop worker and cleans sessions on unload', async () => {
 const bundle=await buildSeanimeBundle(`class Provider { async search(){const b=await ChromeDP.newBrowser({headless:false});try{await b.navigate('https://comix.to');return [await b.evaluate('navigator.userAgent')];}finally{await b.close();}} }`,'javascript');
 const script=`const {ExtensionWorkerPool}=require('./desktop/runtime/extension/extension-worker-pool.cjs');(async()=>{const p=new ExtensionWorkerPool();try{await p.getOrSpawn('browser-fixture',process.env.TATAKAI_TEST_BUNDLE,{permissions:['network:domain:comix.to'],browserDomains:['comix.to']});const e=p._workers.get('browser-fixture');const calls=[];e.browserHost={call:async(method)=>{calls.push(method);return method==='newBrowser'?'session':method==='evaluate'?'FixtureBrowser/1':undefined;},closeAll:()=>calls.push('cleanup')};const result=await p.invoke('browser-fixture','remoteSearch',[{}]);p.terminateAll();console.log(JSON.stringify({result,calls,timeout:e.callTimeoutMs}));}finally{p.terminateAll();}})().catch(e=>{console.error(e);process.exitCode=1;});`;
 const output=execFileSync('node',['-e',script],{cwd:process.cwd(),env:{...process.env,TATAKAI_TEST_BUNDLE:bundle},encoding:'utf8'});
 expect(JSON.parse(output.trim().split(/\r?\n/).findLast(line => line.startsWith('{'))!)).toMatchObject({result:['FixtureBrowser/1'],calls:['newBrowser','navigate','evaluate','close','cleanup'],timeout:180000});
});

it('does not grant browser access when the provider lacks network permission', async () => {
 const bundle=await buildSeanimeBundle(`class Provider { async search(){return ChromeDP.newBrowser({headless:true});} }`,'javascript');
 const script=`const {ExtensionWorkerPool}=require('./desktop/runtime/extension/extension-worker-pool.cjs');(async()=>{const p=new ExtensionWorkerPool();try{await p.getOrSpawn('blocked-browser',process.env.TATAKAI_TEST_BUNDLE,{permissions:[],browserDomains:['comix.to']});try{await p.invoke('blocked-browser','remoteSearch',[{}]);throw Error('unexpected browser access');}catch(e){console.log(JSON.stringify({error:e.message,timeout:p.getCallTimeoutMs('blocked-browser')}));}}finally{p.terminateAll();}})();`;
 const output=execFileSync('node',['-e',script],{cwd:process.cwd(),env:{...process.env,TATAKAI_TEST_BUNDLE:bundle},encoding:'utf8'});
 expect(JSON.parse(output.trim().split(/\r?\n/).findLast(line => line.startsWith('{'))!)).toMatchObject({error:'ChromeDP requires a permitted public provider website',timeout:30000});
});
