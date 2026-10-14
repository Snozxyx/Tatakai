import { afterEach, beforeEach, expect, test } from 'bun:test';
import { browserKittenModel, isKittenLocalAvailable, synthesizeKittenLocal } from '../src/lib/novel/kittenLocal';

const previousWindow = globalThis.window, previousWorker = globalThis.Worker;
let runtime: any;
beforeEach(() => {
  (globalThis as any).window = { setTimeout };
  (globalThis as any).Worker = class {
    onmessage: any; onerror: any; payload: any; terminated = false;
    constructor() { runtime = this; }
    postMessage(payload: any) { this.payload = payload; }
    terminate() { this.terminated = true; }
  };
});
afterEach(() => { (globalThis as any).window = previousWindow; (globalThis as any).Worker = previousWorker; });
test('web narration needs no Electron bridge and generates a releasable audio URL', async () => {
  expect(isKittenLocalAvailable()).toBe(true);
  const controller = new AbortController();
  const result = synthesizeKittenLocal('Hello.', { modelId: 'kitten-2', voice: 'missing' }, controller.signal);
  expect(runtime.payload.modelId).toBe('nano-int8');
  expect(runtime.payload.voice).toBe('Luna');
  runtime.onmessage({ data: { id: runtime.payload.id, type: 'audio', modelId: 'nano-int8', wav: new Uint8Array([1, 2, 3]) } });
  const audio = await result;
  expect((await fetch(audio.url)).status).toBe(200);
  audio.release();
  await expect(fetch(audio.url)).rejects.toThrow();
  // Cancel a second request to free the shared worker between tests.
  const pending = synthesizeKittenLocal('Next.', {}, controller.signal);
  controller.abort(); await expect(pending).rejects.toThrow('Stopped');
}, 20000);
test('stop terminates inference and rejects the pending passage', async () => {
  const controller = new AbortController();
  const pending = synthesizeKittenLocal('Do not play after stopping.', {}, controller.signal);
  controller.abort();
  await expect(pending).rejects.toThrow('Stopped');
  expect(runtime.terminated).toBe(true);
  expect(browserKittenModel('mini')).toBe('mini');
});
