import { describe, expect, test } from 'bun:test';
import { checkRtxCapability, type RtxCapability } from '../src/lib/video/rtx-video';

describe('RTX compatibility feedback', () => {
  test('explains desktop requirements when no bridge exists', async () => {
    expect(await checkRtxCapability()).toMatchObject({ available: false, reason: expect.stringContaining('Windows desktop app') });
  });

  test('preserves hardware and restart diagnostics from the desktop app', async () => {
    const result: RtxCapability = { available: false, reason: 'Use the NVIDIA GPU.', maxOutputHeight: 1080, restartRequired: true, dedicatedGpuRequested: false };
    expect(await checkRtxCapability({ capability: async () => result })).toEqual(result);
  });

  test('a stalled bridge finishes with a retryable timeout instead of waiting forever', async () => {
    let finish!: (result: RtxCapability) => void;
    const pending = new Promise<RtxCapability>(resolve => { finish = resolve; });
    const result = await checkRtxCapability({ capability: () => pending }, 5);
    expect(result).toMatchObject({ available: false, reason: expect.stringContaining('timed out') });
    finish({ available: true, reason: '', maxOutputHeight: 1080 });
    expect(result.available).toBe(false);
    expect(await checkRtxCapability({ capability: async () => ({ available: true, reason: '', maxOutputHeight: 1080 }) })).toMatchObject({ available: true });
  });

  test('rejected and outdated bridges provide a finished error result', async () => {
    for (const capability of [
      () => Promise.reject(new Error('No handler registered')),
      () => { throw new Error('Older bridge'); },
      async () => undefined as unknown as RtxCapability,
    ]) expect(await checkRtxCapability({ capability })).toMatchObject({ available: false, reason: expect.stringContaining('Could not check') });
  });
});
