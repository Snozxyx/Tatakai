import { afterEach, beforeEach, expect, test } from 'bun:test';
import { NovelNarrator } from '../src/lib/novel/narrator';
const previousWindow = globalThis.window, previousUtter = globalThis.SpeechSynthesisUtterance;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
let spoken: string[] = [], fail = false, finish: (() => void) | null = null;
beforeEach(() => {
  spoken = []; fail = false;
  (globalThis as any).SpeechSynthesisUtterance = class { text: string; constructor(text: string) { this.text = text; } };
  const synth = { speaking: false, pending: false, getVoices: () => [{name:'Natural English',voiceURI:'natural-en',lang:'en-US'}],
    speak: (utter: any) => { spoken.push(utter.text); synth.speaking = true; finish = () => { synth.speaking = false; if(fail) utter.onerror?.({error:'audio-busy'}); else utter.onend?.(); }; setTimeout(() => finish?.(), 8); },
    cancel: () => { synth.speaking = false; finish = null; }, pause() {}, resume() {} };
  (globalThis as any).window = { setTimeout,clearTimeout,setInterval,clearInterval,speechSynthesis:synth };
});
afterEach(() => { (globalThis as any).window = previousWindow; (globalThis as any).SpeechSynthesisUtterance = previousUtter; });
test('system narration speaks every paragraph and finishes', async () => {
  let ended=0;const narrator=new NovelNarrator({onEnd:()=>ended++});await narrator.speak(['First paragraph.','Second paragraph.'],{rate:2});
  expect(spoken).toEqual(['First paragraph.','Second paragraph.']);expect(ended).toBe(1);expect(narrator.getBackend()).toBe('speech');
});
test('stop during a sentence cannot resurrect playback', async () => {
  const narrator=new NovelNarrator();const pending=narrator.speak(['First sentence. Second sentence.']);await sleep(3);narrator.stop();await pending;await sleep(30);
  expect(spoken.length).toBe(1);expect(narrator.getStatus()).toBe('idle');
});
test('resume after a sentence ends while paused advances once', async () => {
  const narrator=new NovelNarrator();const pending=narrator.speak(['First sentence. Second sentence.'],{rate:2});await sleep(3);narrator.pause();await sleep(100);expect(spoken.length).toBe(1);narrator.resume();await pending;
  expect(spoken).toEqual(['First sentence.','Second sentence.']);
});
test('voice errors do not silently skip a passage', async () => {
  fail=true;let message='';const narrator=new NovelNarrator({onError:error=>message=error});await narrator.speak(['A passage.']);expect(message).toContain('audio-busy');expect(narrator.getStatus()).toBe('error');
});

// The mobile audio session must be unlocked on the Play tap, before model work.
import { mock } from 'bun:test';
let generated = 0, released = 0, resumed = 0, audioStarted = 0;
let audioPlaying = false, audioDuration = 5, generatedDuringPlayback = 0;
mock.module('../src/lib/novel/kittenLocal', () => ({ synthesizeKittenLocal: async () => { generated++; await sleep(30); if (audioPlaying) generatedDuringPlayback++; return {url:'data:audio/wav;base64,AA==',release:()=>released++}; } }));
function installAudioContext() {
 (globalThis as any).window.AudioContext = class {
  currentTime=1; destination={}; async resume(){resumed++} async suspend(){} async close(){}
  async decodeAudioData(){return {duration:1}}
  createBufferSource(){return {buffer:null,playbackRate:{value:1},connect(){},disconnect(){},stop(){audioPlaying=false},onended:null,start(){audioStarted++;audioPlaying=true;setTimeout(()=>{audioPlaying=false;this.onended?.()},audioDuration)}}}
 };
}
test('KittenTTS unlocks mobile audio before generation and releases each clip', async()=>{
 generated=0;released=0;resumed=0;audioStarted=0;installAudioContext();
 const narrator=new NovelNarrator();const playback=narrator.speak(['A short sentence.'],{engine:'kitten-local',rate:2});
 expect(resumed).toBe(1);expect(generated).toBe(0);await playback;
 expect(generated).toBe(1);expect(audioStarted).toBe(1);expect(released).toBe(1);expect(narrator.getStatus()).toBe('ended');narrator.stop();
});
test('stopping during KittenTTS generation never starts the returned clip',async()=>{
 generated=0;released=0;audioStarted=0;installAudioContext();const narrator=new NovelNarrator();
 const playback=narrator.speak(['A sentence.'],{engine:'kitten-local'});await sleep(5);narrator.stop();await playback;
 expect(audioStarted).toBe(0);expect(released).toBe(1);expect(narrator.getStatus()).toBe('idle');
});

test('KittenTTS prepares three units before speaking and synthesizes during playback', async () => {
 generated=0;released=0;audioStarted=0;generatedDuringPlayback=0;audioDuration=80;installAudioContext();
 let initialGenerated=0;
 const narrator=new NovelNarrator({onStatus:status=>{if(status==='playing')initialGenerated=generated}});
 await narrator.speak(['One sentence. Two sentence. Three sentence. Four sentence. Five sentence. Six sentence.'],{engine:'kitten-local',kittenBufferUnits:3,rate:2});
 expect(initialGenerated).toBe(3);expect(generatedDuringPlayback).toBeGreaterThan(0);
 expect(generated).toBe(6);expect(audioStarted).toBe(6);expect(released).toBe(6);
 audioDuration=5;
});

test('disabling the KittenTTS buffer generates each unit only when needed', async () => {
 generated=0;released=0;audioStarted=0;generatedDuringPlayback=0;audioDuration=30;installAudioContext();
 const narrator=new NovelNarrator();
 await narrator.speak(['First sentence. Second sentence.'],{engine:'kitten-local',kittenBufferUnits:0,rate:2});
 expect(generatedDuringPlayback).toBe(0);expect(audioStarted).toBe(2);expect(released).toBe(2);
 audioDuration=5;
});

test('stop during buffered playback releases prepared and in-flight clips', async () => {
 generated=0;released=0;audioStarted=0;audioDuration=200;installAudioContext();
 const narrator=new NovelNarrator();
 const pending=narrator.speak(['One sentence. Two sentence. Three sentence. Four sentence. Five sentence.'],{engine:'kitten-local',kittenBufferUnits:3,rate:2});
 for(let tries=0;audioStarted===0&&tries<100;tries++)await sleep(5);
 expect(audioStarted).toBe(1);
 narrator.stop();await pending;await sleep(60);
 expect(audioStarted).toBe(1);expect(released).toBe(generated);expect(narrator.getStatus()).toBe('idle');
 audioDuration=5;
});
