import { expect, test } from 'bun:test';
import { KittenAudioBuffer, type KittenClip } from '../src/lib/novel/kittenBuffer';

test('primes multiple units, refills ahead, and releases unplayed clips', async () => {
  const generated: string[] = [], released: string[] = [];
  const buffer = new KittenAudioBuffer(['one', 'two', 'three', 'four', 'five'], async text => {
    generated.push(text); return { url: text, release: () => released.push(text) };
  });
  await buffer.prime(3);
  expect(generated).toEqual(['one', 'two', 'three']);
  const first = await buffer.take(0);
  buffer.fill(1, 3);
  // Consuming already buffered audio must not wait for the new synthesis job.
  const second = await buffer.take(1);
  expect(second.url).toBe('two');
  await buffer.take(3).then(clip => clip.release());
  expect(generated).toEqual(['one', 'two', 'three', 'four']);
  first.release(); second.release(); buffer.dispose();
  expect(released.sort()).toEqual(['four', 'one', 'three', 'two']);
});

test('disposing during synthesis releases its late result and skips queued work', async () => {
  let finish!: (clip: KittenClip) => void;
  let released = 0, generated = 0;
  const buffer = new KittenAudioBuffer(['one', 'two'], () => {
    generated++; return new Promise(resolve => { finish = resolve; });
  });
  buffer.fill(0, 2);
  const pending = buffer.take(0);
  await Promise.resolve();
  buffer.dispose(); finish({ url: 'one', release: () => released++ });
  await expect(pending).rejects.toThrow('Stopped');
  expect(released).toBe(1); expect(generated).toBe(1);
});

test('background errors are handled and never skip the failed unit', async () => {
  let calls = 0, released = 0;
  const buffer = new KittenAudioBuffer(['one', 'two', 'three'], async text => {
    calls++; if (text === 'two') throw new Error('Inference failed');
    return { url: text, release: () => released++ };
  });
  await expect(buffer.prime(3)).rejects.toThrow('Inference failed');
  await expect(buffer.take(1)).rejects.toThrow('Inference failed');
  buffer.dispose(); expect(calls).toBe(2); expect(released).toBe(1);
});
