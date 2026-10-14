import { afterEach, expect, test } from 'bun:test';
import { DEFAULT_TTS_INTEGRATIONS, synthesizeExternalTts, loadTtsIntegrations, ttsIntegrationKey, openAiVoicesForModel } from '../src/lib/novel/ttsIntegrations';
const realFetch = globalThis.fetch, previousStorage = globalThis.localStorage;
afterEach(() => { globalThis.fetch = realFetch; (globalThis as any).localStorage = previousStorage; });
test('ElevenLabs sends the key only to its fixed host and returns releasable audio', async () => {
  let request: any;
  globalThis.fetch = (async (url, options) => { request = {url,options};return new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'audio/mpeg'}}); }) as any;
  const clip = await synthesizeExternalTts('Read this.', 'elevenlabs', {...DEFAULT_TTS_INTEGRATIONS,elevenLabsKey:'secret',elevenLabsVoice:'voice/id'},1.4,new AbortController().signal);
  expect(request.url).toStartWith('https://api.elevenlabs.io/v1/text-to-speech/voice%2Fid');
  expect(request.options.headers['xi-api-key']).toBe('secret');
  expect(JSON.parse(request.options.body).text).toBe('Read this.');
  expect(clip.playbackRate).toBe(1.4);clip.release();
});
test('local TTS uses the configured OpenAI speech endpoint, model and voice', async () => {
  let request:any;
  globalThis.fetch=(async(url,options)=>{request={url,options};return new Response(new Uint8Array([1]),{headers:{'content-type':'audio/wav'}});}) as any;
  const clip=await synthesizeExternalTts('Local text.', 'local-server', {...DEFAULT_TTS_INTEGRATIONS,localEndpoint:'http://localhost:9000/v1/audio/speech',localKey:'local-secret',localModel:'my-model',localVoice:'voice-one'},1.5,new AbortController().signal);
  expect(request.url).toBe('http://localhost:9000/v1/audio/speech');
  expect(JSON.parse(request.options.body)).toEqual({input:'Local text.',model:'my-model',voice:'voice-one',speed:1.5,response_format:'wav'});
  expect(request.options.headers.Authorization).toBe('Bearer local-secret');clip.release();
});
test('invalid setup makes no network request and server errors are actionable',async()=>{
  let calls=0;
  globalThis.fetch=(async()=>{calls++;return new Response('{}',{status:401});}) as any;
  await expect(synthesizeExternalTts('Text','elevenlabs',DEFAULT_TTS_INTEGRATIONS,1,new AbortController().signal)).rejects.toThrow('API key and voice ID');
  await expect(synthesizeExternalTts('Text','local-server',{...DEFAULT_TTS_INTEGRATIONS,localEndpoint:'file:///secret'},1,new AbortController().signal)).rejects.toThrow('HTTP or HTTPS');
  expect(calls).toBe(0);
  await expect(synthesizeExternalTts('Text','local-server',DEFAULT_TTS_INTEGRATIONS,1,new AbortController().signal)).rejects.toThrow('HTTP 401');
});
test('stopping aborts the external request',async()=>{
  globalThis.fetch=((_url,options)=>new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError'))))) as any;
  const controller=new AbortController();const pending=synthesizeExternalTts('Text','local-server',DEFAULT_TTS_INTEGRATIONS,1,controller.signal);
  controller.abort();await expect(pending).rejects.toThrow('Stopped');
});
test('keys and endpoints are isolated by signed-in account on this device',()=>{
  const store=new Map([[ttsIntegrationKey('first'),JSON.stringify({elevenLabsKey:'private-key'})]]);
  (globalThis as any).localStorage={getItem:(key:string)=>store.get(key)||null};
  expect(loadTtsIntegrations('first').elevenLabsKey).toBe('private-key');
  expect(loadTtsIntegrations('second').elevenLabsKey).toBe('');
  expect(loadTtsIntegrations().elevenLabsKey).toBe('');
});
test('OpenAI uses its speech endpoint with the selected model, voice and speed',async()=>{
 let request:any;
 globalThis.fetch=(async(url,options)=>{request={url,options};return new Response(new Uint8Array([1]),{headers:{'content-type':'audio/mpeg'}});}) as any;
 const clip=await synthesizeExternalTts('An OpenAI reading.','openai',{...DEFAULT_TTS_INTEGRATIONS,openAIKey:'openai-secret'},1.2,new AbortController().signal);
 expect(request.url).toBe('https://api.openai.com/v1/audio/speech');
 expect(request.options.headers.Authorization).toBe('Bearer openai-secret');
 expect(JSON.parse(request.options.body)).toEqual({input:'An OpenAI reading.',model:'gpt-4o-mini-tts',voice:'marin',speed:1.2,response_format:'mp3'});
 expect(clip.playbackRate).toBe(1);clip.release();
 expect(openAiVoicesForModel('tts-1')).not.toContain('marin');
});
