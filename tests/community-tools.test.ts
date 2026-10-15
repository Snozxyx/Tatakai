import { expect, test } from 'bun:test';
import { consoleValue } from '../src/lib/consoleValue';
import { supportsContent } from '../src/lib/extensionCapability';
import { getVisitSessionId, getVisitorId } from '../src/lib/analyticsIdentity';
import { requestWithDeadline } from '../src/lib/requestDeadline';

test('analytics requests fail with a retryable timeout instead of loading forever',async()=>{
  let aborted=false;
  await expect(requestWithDeadline(signal=>{signal.addEventListener('abort',()=>{aborted=true;});return new Promise(()=>{});},undefined,10)).rejects.toThrow('analytics-timeout');
  expect(aborted).toBe(true);
  expect(await requestWithDeadline(async()=>42,undefined,50)).toBe(42);
});

test('console output safely inspects cycles, bigint and Error details', () => {
  const cyclic: any = { n: 42n };
  cyclic.self = cyclic;
  expect(consoleValue(cyclic)).toContain('[Circular]');
  expect(consoleValue(cyclic)).toContain('42n');
  expect(consoleValue(new Error('failed source'))).toContain('failed source');
});
test('extension prompts distinguish novels from manga and recognize anime source routes', () => {
  expect(supportsContent({ capabilities: ['manga'] }, 'novel')).toBe(false);
  expect(supportsContent({ routes: ['novel/chapters'] }, 'novel')).toBe(true);
  expect(supportsContent({ routes: ['sources'] }, 'anime')).toBe(true);
});
test('visitor identity persists while idle visit sessions rotate', () => {
  const start = Date.now();
  const visitor = getVisitorId();
  const first = getVisitSessionId(start);
  expect(getVisitSessionId(start + 20 * 60_000)).toBe(first);
  expect(getVisitSessionId(start + 51 * 60_000)).not.toBe(first);
  expect(getVisitorId()).toBe(visitor);
});
