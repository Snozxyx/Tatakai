import { expect, test, mock } from 'bun:test';
let request: any;
let proxyUrl: string | null = null;
let registered: any;
let responseStatus = 200;
let prepareHeaders = false;
let requests: any[] = [];
let ios = false;
const iosCalls: any[] = [];
mock.module('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true, getPlatform: () => ios ? 'ios' : 'android', isPluginAvailable: (name: string) => ios && name === 'TatakaiExtensionHttp' }, registerPlugin: () => ({ request: async (options: any) => { iosCalls.push(options); return { status: 200, headers: {}, cookies: { session: 'native-fixture' }, body: 'native text', url: 'https://source.test/final' }; }, cancel: async () => {} }), CapacitorHttp: { request: async (options: any) => { request = options; requests.push(options); return { status: options.url.startsWith('http://127.0.0.1') ? 200 : responseStatus, headers: {}, data: options.responseType === 'arraybuffer' ? btoa(String.fromCharCode(0, 255, 128, 10)) : 'hello' }; } } }));
mock.module('@/core/mobile/localProxyNative', () => ({ registerNativeSource: async (url: string, headers: any) => { registered = {url,headers}; return proxyUrl; }, prepareNativeRequestHeaders: async (_url: string, headers: any) => prepareHeaders ? {...headers,Cookie:'cf_clearance=fixture','User-Agent':'Solved UA'} : headers }));
mock.module('@/hooks/ui/useMobileConfig', () => ({ loadMobileConfig: () => ({ cloudflareBypass: false }) }));
const { createNativeFetch } = await import('../src/core/extensions/mobile/nativeHttp');
test('mobile HTTP preserves binary protobuf bytes in both directions', async () => {
 const nativeFetch = createNativeFetch(['wuxiaworld.com']);
 const body = new Uint8Array([99, 0, 255, 128, 99]).subarray(1, 4);
 const result = await nativeFetch('https://api2.wuxiaworld.com/chapters', {method: 'POST', headers: {'Content-Type': 'application/grpc-web+proto'}, body});
 expect(request.dataType).toBe('file'); expect(request.data).toBe(btoa(String.fromCharCode(0, 255, 128)));
 expect(request.responseType).toBe('arraybuffer'); expect([...new Uint8Array(await result.arrayBuffer())]).toEqual([0,255,128,10]);
});

test('blocked mobile GET retries through Android/iOS loopback and retains provider headers', async () => {
 responseStatus = 403;
 requests = [];
 proxyUrl = 'http://127.0.0.1:45259/stream/' + 'a'.repeat(32);
 const original = globalThis.fetch;
 globalThis.fetch = (async () => { throw new Error('WebView network must not be used'); }) as typeof fetch;
 try {
  const headers = new Headers({Referer:'https://novelbuddy.me/', 'User-Agent':'Provider UA', 'X-Requested-With':'XMLHttpRequest'});
  const result = await createNativeFetch(['novelbuddy.me'])('https://api.novelbuddy.me/titles/example/chapters',{headers:headers as any});
  expect(request.url).toBe(proxyUrl); expect(request.responseType).toBe('text');
  expect(requests).toHaveLength(2);
  expect(requests[0].headers.referer).toBe('https://novelbuddy.me/');
  expect(registered.headers.referer).toBe('https://novelbuddy.me/'); expect(registered.headers['x-requested-with']).toBe('XMLHttpRequest');
  expect(result.url).toBe('https://api.novelbuddy.me/titles/example/chapters'); expect(await result.text()).toBe('hello');
  responseStatus=404;
  expect((await createNativeFetch(['novelbuddy.me'])('https://novelbuddy.me/missing')).status).toBe(404);
 } finally {proxyUrl=null;responseStatus=200;globalThis.fetch=original;}
});

test('successful mobile API requests avoid proxy registration and extra round trips', async () => {
 requests = []; registered = null;
 const result = await createNativeFetch(['mangadex.org'])('https://api.mangadex.org/manga/example/feed');
 expect(result.ok).toBe(true); expect(requests).toHaveLength(1);
 expect(request.url).toBe('https://api.mangadex.org/manga/example/feed'); expect(registered).toBeNull();
});

test('pre-aborted mobile provider requests never start native HTTP', async () => {
 const controller = new AbortController(); controller.abort(); requests = [];
 await expect(createNativeFetch(['mangadex.org'])('https://api.mangadex.org/manga', {signal:controller.signal})).rejects.toMatchObject({name:'AbortError'});
 expect(requests).toHaveLength(0);
});

test('mobile POST catalogs replay cached native clearance with the matching UA', async () => {
 prepareHeaders=true;
 try {
  await createNativeFetch(['onisaga.com'])('https://onisaga.com/novel/example/ajax/chapters/',{method:'POST',headers:{Referer:'https://onisaga.com/'},body:'action=chapters'});
  expect(request.method).toBe('POST');expect(request.data).toBe('action=chapters');expect(request.headers.Cookie).toBe('cf_clearance=fixture');expect(request.headers['User-Agent']).toBe('Solved UA');
 } finally {prepareHeaders=false;}
});
test('mobile HTTP keeps text responses and domain gates', async () => {
 const nativeFetch = createNativeFetch(['wuxiaworld.com']);
 expect(await (await nativeFetch('https://www.wuxiaworld.com')).text()).toBe('hello');
 expect(request.responseType).toBe('text');
 await expect(nativeFetch('https://unrelated.example')).rejects.toThrow('allowed domain');
});

test('iOS source text requests use the cancellable native bridge and retain final URLs and cookies', async () => {
 ios=true;requests=[];iosCalls.length=0;
 try {
  const result=await createNativeFetch(['source.test'])('https://source.test/search',{method:'POST',headers:{Referer:'https://source.test/'},body:'query=rain'});
  expect(await result.text()).toBe('native text');expect(result.url).toBe('https://source.test/final');expect(result.cookies?.session).toBe('native-fixture');
  expect(requests).toHaveLength(0);expect(iosCalls).toHaveLength(1);expect(iosCalls[0].body).toBe('query=rain');
  await createNativeFetch(['source.test'])('https://source.test/binary',{method:'POST',headers:{'Content-Type':'application/grpc-web+proto'},body:new Uint8Array([0,255])});
  expect(requests).toHaveLength(1);expect(requests[0].dataType).toBe('file');
 } finally {ios=false;}
});
