/** System narration with sentence pauses and cancellable playback. */
import { planProsody, type ProsodyUtterance } from './prosody';
import { KittenAudioBuffer } from './kittenBuffer';
import type { TtsIntegrationConfig } from './ttsIntegrations';
export type NarratorStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';
export type NarratorBackend = 'speech' | 'kitten-local' | 'elevenlabs' | 'local-server' | 'openai' | 'none';
export type NarratorEngine = 'system' | 'kitten-local' | 'elevenlabs' | 'local-server' | 'openai';
export const narratorEngineLabel = (engine: NarratorEngine | NarratorBackend) => ({ system: 'System voice', speech: 'System voice', 'kitten-local': 'KittenTTS · Experimental', elevenlabs: 'ElevenLabs', 'local-server': 'Local model server', openai: 'OpenAI', none: '' })[engine];
export interface NarratorCallbacks {
  onStatus?: (status: NarratorStatus) => void;
  onUtterance?: (utteranceIndex: number, paragraph: number) => void;
  onBuffering?: (buffering: boolean) => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
}
export interface NarratorSpeakOptions { voice?: string; engine?: NarratorEngine; rate?: number; fromParagraph?: number; localModel?: string; kittenVoice?: string; kittenBufferUnits?: number; integration?: TtsIntegrationConfig; }
function pickSpeechVoice(voices: SpeechSynthesisVoice[], hint: string): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;
  const exact = voices.find(v => v.voiceURI === hint || v.name === hint);
  if (exact) return exact;
  const h = hint.toLowerCase();
  // Score voices like a casting director: English first, then neural/natural
  // studio voices (Google/Microsoft/Samsung), then anything else. A flat
  // "first English voice" pick is what makes most web TTS sound robotic.
  const score = (v: SpeechSynthesisVoice): number => {
    const name = (v.name || '').toLowerCase();
    const lang = (v.lang || '').toLowerCase();
    let s = 0;
    if (lang.startsWith('en-us') || lang.startsWith('en-gb')) s += 10;
    else if (lang.startsWith('en')) s += 6;
    else return -100;
    if (/neural|natural|wavenet|neural2|studio|premium|hd/i.test(name)) s += 8;
    if (/google (us|uk) english|microsoft .*natural|samantha|zira|aria|jenny|guy|david|daniel|moira|tessa/i.test(name)) s += 5;
    if (/espeak|festival|mary|pico|robot|compact/i.test(name)) s -= 6;
    if (v.localService) s += 1;
    else s += 2; // network voices are usually the newer neural ones
    if (v.default) s += 1;
    return s;
  };
  const sorted = [...voices].sort((a, b) => score(b) - score(a));
  const feminine = /female|samantha|zira|aria|sara|jenny|tessa|moira|google uk english female/i;
  const masculine = /male(?!.*female)|david|guy|daniel|george|google uk english male/i;
  if (h.includes('fem') || h.includes('aria') || h.includes('sara')) {
    const f = sorted.find((v) => feminine.test(v.name));
    if (f && score(f) > -50) return f;
  }
  if (h.includes('masc') || h.includes('male') || h.includes('guy')) {
    const m = sorted.find((v) => masculine.test(v.name));
    if (m && score(m) > -50) return m;
  }
  return sorted[0] ?? null;
}
/** Deterministic 0..1 pseudo-random from an integer (stable across sessions). */
function hash01(n: number): number {

  let x = (n + 0x9e3779b9) | 0;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
  return ((x ^ (x >>> 15)) >>> 0) / 4294967295;
}

/**
 * Human shaping for one utterance: micro-varied rate/pitch so no two lines
 * sound stamped from the same mold, plus expressive offsets by line type —
 * dialogue runs warmer and a touch slower, exclamations lift with energy,
 * questions tilt upward, headings slow down and deepen.
 */
function shapeUtterance(
  u: ProsodyUtterance,
  index: number,
  baseRate: number,
): { rate: number; pitch: number } {
  const text = u.text.trim();
  const jitterRate = (hash01(index * 2 + 1) - 0.5) * 0.06;
  const jitterPitch = (hash01(index * 2 + 7) - 0.5) * 0.08;
  let rate = baseRate * (1 + jitterRate);
  let pitch = 1 + jitterPitch;

  const isQuestion = /\?\s*["”'’)\]]?$/.test(text);
  const isExclaim = /!\s*["”'’)\]]?$/.test(text);
  const isAside = /^\(.*\)$/.test(text) || /^—.*—$/.test(text);

  if (u.isHeading) {
    rate *= 0.92;
    pitch *= 0.92;
  } else if (u.isDialogue) {
    rate *= 0.96;
    pitch *= 1.08;
  }
  if (isExclaim) {
    rate *= 1.06;
    pitch *= 1.12;
  } else if (isQuestion) {
    pitch *= 1.1;
  }
  if (isAside) {
    rate *= 0.94;
    pitch *= 0.95;
  }

  return {
    rate: Math.min(2, Math.max(0.5, Math.round(rate * 100) / 100)),
    pitch: Math.min(2, Math.max(0.3, Math.round(pitch * 100) / 100)),
  };
}

/** Wait for the OS voice list (Chrome loads it async — speaking before it
 *  arrives locks in a fallback voice for the whole session). */
function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    try {
      const synth = window.speechSynthesis;
      const have = synth.getVoices();
      if (have.length > 0) {
        resolve(have);
        return;
      }
      const timer = window.setTimeout(() => resolve(synth.getVoices()), 1500);
      const onChange = () => {
        window.clearTimeout(timer);
        synth.removeEventListener?.('voiceschanged', onChange);
        resolve(synth.getVoices());
      };
      synth.addEventListener?.('voiceschanged', onChange, { once: true });
    } catch {
      resolve([]);
    }
  });
}


export class NovelNarrator {
  private status: NarratorStatus = 'idle';
  private cb: NarratorCallbacks;
  private run = 0;
  private controller: AbortController | null = null;
  private paused = false;
  private backend: NarratorBackend = 'none';
  private audioContext: AudioContext | null = null;
  constructor(cb: NarratorCallbacks = {}) { this.cb = cb; }
  getBackend(): NarratorBackend { return this.backend; }
  getStatus() { return this.status; }
  private setStatus(status: NarratorStatus) { this.status = status; this.cb.onStatus?.(status); }
  private delay(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const done = () => { clearTimeout(timer); signal.removeEventListener('abort', cancel); resolve(); };
      const cancel = () => { clearTimeout(timer); signal.removeEventListener('abort', cancel); reject(new DOMException('Stopped','AbortError')); };
      const timer = window.setTimeout(done, Math.max(0, ms));
      signal.addEventListener('abort', cancel, { once: true }); if (signal.aborted) cancel();
    });
  }
  private async waitForResume(signal: AbortSignal) { while (this.paused) await this.delay(80, signal); if (signal.aborted) throw new DOMException('Stopped','AbortError'); }
  async speak(paragraphs: string[], opts: NarratorSpeakOptions = {}) {
    this.stop(false); const run = this.run;
    const controller = new AbortController(); this.controller = controller; const signal = controller.signal;
    this.setStatus('loading');
    let buffer: KittenAudioBuffer | null = null;
    try {
      this.backend = opts.engine && opts.engine !== 'system' ? opts.engine : 'speech';
      if (this.backend !== 'speech') {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) throw new Error('Audio playback is unavailable on this device. Select System voice.');
        this.audioContext = new AudioContextClass();
        // Resume during the user's tap, before downloading or generating audio.
        // Mobile browsers otherwise block playback after the asynchronous work.
        await this.audioContext!.resume();
      }
      if (this.backend === 'speech') {
        if (!window.speechSynthesis) throw new Error('System narration is unavailable on this device.');
        await loadVoices();
      }
      await this.waitForResume(signal);
      const utterances = planProsody(paragraphs).filter(u => u.paragraph >= (opts.fromParagraph ?? 0));
      const rate = Math.min(2, Math.max(.5, opts.rate ?? 1));
      const bufferUnits = this.backend === 'kitten-local' ? Math.max(0, Math.min(5, Math.round(Number.isFinite(opts.kittenBufferUnits) ? opts.kittenBufferUnits! : 3))) : 0;
      if (this.backend !== 'speech') {
        const generate = this.backend === 'kitten-local'
          ? (text: string) => import('./kittenLocal').then(({ synthesizeKittenLocal }) => synthesizeKittenLocal(text, {
          modelId: opts.localModel || 'nano-int8', voice: opts.kittenVoice || 'Luna', speed: rate,
        }, signal))
          : (text: string) => import('./ttsIntegrations').then(({ synthesizeExternalTts, DEFAULT_TTS_INTEGRATIONS }) => synthesizeExternalTts(text, opts.engine as 'elevenlabs' | 'local-server' | 'openai', opts.integration || DEFAULT_TTS_INTEGRATIONS, rate, signal));
        buffer = new KittenAudioBuffer(utterances.map(u => u.text), generate);
        this.cb.onBuffering?.(true);
        await buffer.prime(Math.max(1, bufferUnits));
        await this.waitForResume(signal); this.cb.onBuffering?.(false);
      }
      this.setStatus('playing');
      for (let index = 0; index < utterances.length; index++) {
        await this.waitForResume(signal); const u = utterances[index]; this.cb.onUtterance?.(index, u.paragraph);
        if (this.backend !== 'speech') {
          buffer!.fill(index, Math.max(1, bufferUnits));
          if (!buffer!.ready(index)) this.cb.onBuffering?.(true);
          const result = await buffer!.take(index);
          try {
            await this.waitForResume(signal); this.cb.onBuffering?.(false);
            // Refill while this clip plays, keeping at most five upcoming units.
            if (bufferUnits > 0) buffer!.fill(index + 1, bufferUnits);
            await this.playKittenAudio(result.url, result.playbackRate || 1, signal);
          } finally { result.release(); }
        } else await this.playSpeech(u, index, opts.voice || 'system-default', rate, signal);
        await this.waitForResume(signal); await this.delay(u.pauseAfterMs / rate, signal);
      }
      if (run === this.run) { this.setStatus('ended'); this.cb.onEnd?.(); }
    } catch (error) {
      // Cancel background synthesis when playback or decoding fails.
      const stopped = signal.aborted || run !== this.run;
      if (!stopped) controller.abort();
      if (stopped) return;
      this.cb.onBuffering?.(false);
      this.setStatus('error'); this.cb.onError?.((error as Error).message || 'System narration failed. Try another installed voice.');
    } finally {
      buffer?.dispose();
      if (run === this.run) { void this.audioContext?.close().catch(() => {}); this.audioContext = null; }
    }
  }
  private playKittenAudio(url: string, rate: number, signal: AbortSignal): Promise<void> {
    return this.playKittenBuffer(url, rate, signal);
  }
  private async playKittenBuffer(url: string, rate: number, signal: AbortSignal): Promise<void> {
    const context = this.audioContext;
    if (!context) throw new Error('Audio session ended. Press Play to retry.');
    const response = await fetch(url, { signal });
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    signal.throwIfAborted();
    await this.waitForResume(signal);
    const source = context.createBufferSource(); source.buffer = buffer; source.playbackRate.value = rate; source.connect(context.destination);
    return new Promise((resolve, reject) => {
      let previousTime = -1, stalled = 0;
      const cleanup = () => { clearInterval(timer); source.onended = null; try { source.stop(); } catch {} source.disconnect(); signal.removeEventListener('abort', cancel); };
      const finish = () => { cleanup(); resolve(); };
      const fail = () => { cleanup(); reject(new Error('Narration audio stopped responding. Retry playback or select another engine.')); };
      const cancel = () => { cleanup(); reject(new DOMException('Stopped', 'AbortError')); };
      const timer = window.setInterval(() => { if (this.paused) return; stalled = context.currentTime === previousTime ? stalled + 1 : 0; previousTime = context.currentTime; if (stalled > 20) fail(); }, 1000);
      source.onended = finish; signal.addEventListener('abort', cancel, { once: true });
      if (signal.aborted) return cancel(); try { source.start(); } catch { fail(); }
    });
  }
  private async playSpeech(u: ProsodyUtterance, index: number, hint: string, rate: number, signal: AbortSignal) {
    await new Promise<void>((resolve, reject) => {
      const synth = window.speechSynthesis;
      const utter = new SpeechSynthesisUtterance(u.text); utter.voice = pickSpeechVoice(synth.getVoices(), hint); Object.assign(utter, shapeUtterance(u, index, rate));
      let ticks = 0, retries = 0;
      const cleanup = () => { clearInterval(timer); utter.onend = null; utter.onerror = null; signal.removeEventListener('abort', cancel); };
      const done = () => { cleanup(); resolve(); };
      const cancel = () => { cleanup(); synth.cancel(); reject(new DOMException('Stopped','AbortError')); };
      // Chrome occasionally drops its queue. Retry this sentence once when
      // it becomes idle; never advance past text that was not spoken.
      const timer = window.setInterval(() => {
        if (this.paused) return;
        ticks++;
        if (!synth.speaking && !synth.pending && ticks > 3 && retries++ === 0) synth.speak(utter);
        if (ticks > Math.max(60, u.text.length / 5)) { cleanup(); synth.cancel(); reject(new Error('System voice stopped responding. Select another voice and retry.')); }
      }, 1000);
      utter.onend = done; utter.onerror = e => { cleanup(); reject(new Error('System voice: '+e.error)); };
      signal.addEventListener('abort', cancel, { once: true }); if (signal.aborted) return cancel(); synth.speak(utter);
    });
  }
  pause() { if (this.status !== 'playing' && this.status !== 'loading') return; this.paused = true; void this.audioContext?.suspend().catch(() => {}); if (this.backend === 'speech') window.speechSynthesis?.pause(); this.setStatus('paused'); }
  resume() { if (!this.paused) return; this.paused = false; void this.audioContext?.resume().catch(() => {}); if (this.backend === 'speech') window.speechSynthesis?.resume(); this.setStatus('playing'); }
  stop(notify = true) { this.run++; this.controller?.abort(); this.controller = null; this.paused = false; void this.audioContext?.close().catch(() => {}); this.audioContext = null; window.speechSynthesis?.cancel(); this.cb.onBuffering?.(false); if (notify) this.setStatus('idle'); else this.status = 'idle'; }
}
export function createNarrator(cb?: NarratorCallbacks) { return new NovelNarrator(cb); }
