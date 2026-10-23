import { expect, it } from 'bun:test';
import { gzipSync } from 'node:zlib';
import { addMihonRepository, validateIndex, canonicalRaw } from '../desktop/runtime/compatibility/mihon-repository.cjs';

const field = (tag: number[], text: string | Buffer) => { const body = Buffer.from(text); return Buffer.concat([Buffer.from([...tag, body.length]), body]); };
const index = Buffer.concat([field([10], 'Fixture'), field([26], 'a'.repeat(64)), field([0xaa, 6], Buffer.alloc(0))]);
it('retries decoding failures using validated raw bytes without changing a successful URL', async () => {
  const url = 'https://github.com/owner/repository/raw/repo/index.pb';
  const calls: string[] = [];
  const add = async (value: string) => { calls.push(value); if (calls.length === 1) throw Error('ProtobufDecodingException: NetworkExtensionStore'); return { url: value }; };
  const result = await addMihonRepository(url, add, new AbortController().signal, async () => new Response(gzipSync(index)));
  expect(result.url).toBe('https://raw.githubusercontent.com/owner/repository/repo/index.pb');
  expect(calls).toEqual([url, result.url]);
  let fetched = false;
  expect(await addMihonRepository(url, async value => value, new AbortController().signal, async () => { fetched = true; })).toBe(url);
  expect(fetched).toBe(false);
});
it('rejects HTML, malformed protobuf and insecure redirects without another host mutation', async () => {
  for (const body of ['<!doctype html><h1>Unavailable</h1>', Buffer.from([10, 120, 1])]) {
    let mutations = 0;
    await expect(addMihonRepository('https://github.com/a/b/raw/repo/index.pb', async () => { mutations++; throw Error('ProtobufDecodingException'); }, new AbortController().signal, async () => new Response(body))).rejects.toThrow('Existing extensions were preserved');
    expect(mutations).toBe(1);
  }
  await expect(addMihonRepository('https://github.com/a/b/raw/repo/index.pb', async () => { throw Error('ProtobufDecodingException'); }, new AbortController().signal, async () => new Response(null, { status: 302, headers: { location: 'http://insecure.test/index.pb' } }))).rejects.toThrow('HTTPS');
  expect(() => validateIndex(Buffer.from([0]))).toThrow();
  expect(canonicalRaw('https://other.test/a/b/raw/repo/index.pb')).toBe('https://other.test/a/b/raw/repo/index.pb');
});
