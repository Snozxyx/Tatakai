import { expect, test } from 'bun:test';
import { runCustomShelfRequest } from '../src/lib/customShelfQueue';

test('rapid viewport activation runs at most two saved shelf requests and cancels queued work', async () => {
  let active = 0, maxActive = 0, starts = 0;
  const releases: (() => void)[] = [];
  const work = () => { starts++; active++; maxActive = Math.max(maxActive, active); return new Promise<number>(resolve => releases.push(() => { active--; resolve(starts); })); };
  const first = runCustomShelfRequest(work), second = runCustomShelfRequest(work);
  const cancelled = new AbortController();
  const third = runCustomShelfRequest(work, cancelled.signal).catch(() => 'cancelled');
  const fourth = runCustomShelfRequest(work);
  await Promise.resolve();
  expect(starts).toBe(2);
  cancelled.abort();
  expect(await third).toBe('cancelled');
  releases.shift()!();
  await first;
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(starts).toBe(3);
  expect(maxActive).toBe(2);
  releases.splice(0).forEach(release => release());
  await Promise.all([second, fourth]);
});
