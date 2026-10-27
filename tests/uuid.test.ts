import { expect, test } from 'bun:test';
import { randomUUID } from '../src/lib/uuid';
import { getVisitorId, getVisitSessionId } from '../src/lib/analyticsIdentity';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('uses native randomUUID with its Crypto receiver', () => {
  const source = { randomUUID() { expect(this).toBe(source); return 'native-id'; } } as unknown as Crypto;
  expect(randomUUID(source)).toBe('native-id');
});

test('fallback sets UUID version and variant bits using secure bytes', () => {
  const source = {
    randomUUID: undefined,
    getRandomValues(bytes: Uint8Array) { expect(this).toBe(source); return bytes.fill(255); },
  } as unknown as Crypto;
  expect(randomUUID(source)).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  expect(randomUUID(source)).toMatch(UUID_V4);
});

test('missing or non-callable randomUUID produces distinct UUIDs with getRandomValues', () => {
  for (const value of [undefined, null, 'unsupported']) {
    const source = { randomUUID: value, getRandomValues: (bytes: Uint8Array) => crypto.getRandomValues(bytes) } as unknown as Crypto;
    const ids = Array.from({ length: 100 }, () => randomUUID(source));
    expect(new Set(ids).size).toBe(100);
    for (const id of ids) expect(id).toMatch(UUID_V4);
  }
});

test('does not substitute weak or constant IDs when secure randomness is unavailable', () => {
  expect(() => randomUUID({} as Crypto)).toThrow('Secure random number generation is unavailable');
});

test('analytics identity works without randomUUID even if localStorage is blocked', () => {
  const uuidDescriptor = Object.getOwnPropertyDescriptor(crypto, 'randomUUID');
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    Object.defineProperty(globalThis, 'localStorage', { get() { throw new Error('Storage unavailable'); }, configurable: true });
    const visitor = getVisitorId();
    expect(visitor).toMatch(UUID_V4);
    expect(getVisitorId()).toBe(visitor);
    const session = getVisitSessionId(1000);
    expect(session).toMatch(UUID_V4);
    expect(getVisitSessionId(2000)).toBe(session);
    expect(getVisitSessionId(2000 + 31 * 60_000)).not.toBe(session);
  } finally {
    if (uuidDescriptor) Object.defineProperty(crypto, 'randomUUID', uuidDescriptor);
    else delete (crypto as any).randomUUID;
    if (storageDescriptor) Object.defineProperty(globalThis, 'localStorage', storageDescriptor);
    else delete (globalThis as any).localStorage;
  }
});
