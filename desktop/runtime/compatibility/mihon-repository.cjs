'use strict';
const { gunzipSync } = require('node:zlib');
const LIMIT = 16 * 1024 * 1024;
const https = value => { const u = new URL(value); if (u.protocol !== 'https:' || u.username || u.password) throw Error('Repository must use HTTPS without login credentials'); return u.href; };
function canonicalRaw(url) {
  const u = new URL(url), parts = u.pathname.split('/');
  // GitHub /owner/repo/raw/ref/path redirects to this endpoint. Other hosts stay untouched.
  if (u.hostname === 'github.com' && parts[3] === 'raw' && parts.length >= 6) {
    u.hostname = 'raw.githubusercontent.com'; parts.splice(3, 1); u.pathname = parts.join('/');
  }
  return u.href;
}
function validateIndex(input) {
  let bytes = Buffer.from(input);
  if (bytes.length > LIMIT) throw Error('Repository index exceeds 16 MB');
  if (bytes[0] === 31 && bytes[1] === 139) bytes = gunzipSync(bytes, { maxOutputLength: LIMIT });
  if (/^\s*</.test(bytes.subarray(0, 128).toString())) throw Error('Repository returned an HTML page instead of an index');
  // Validate the store envelope only. The original host remains the package/schema decoder.
  let at = 0; const fields = new Map();
  const integer = () => { let n = 0n; for (let shift = 0n; shift <= 63n; shift += 7n) { if (at >= bytes.length) throw Error('Truncated protobuf index'); const b = bytes[at++]; if (shift === 63n && b > 1) throw Error('Invalid protobuf integer'); n |= BigInt(b & 127) << shift; if (!(b & 128)) return n; } throw Error('Invalid protobuf integer'); };
  while (at < bytes.length) {
    const tag = integer(), field = Number(tag >> 3n), wire = Number(tag & 7n);
    if (!field || field > 536870911) throw Error('Invalid protobuf field');
    if (wire === 0) { integer(); continue; }
    const length = wire === 2 ? Number(integer()) : wire === 1 ? 8 : wire === 5 ? 4 : -1;
    if (length < 0 || !Number.isSafeInteger(length) || length > bytes.length - at) throw Error('Invalid protobuf index length');
    if (wire === 2 && !fields.has(field)) fields.set(field, bytes.subarray(at, at + length));
    at += length;
  }
  if (!fields.get(1)?.length || !/^[a-f0-9]{64}$/i.test(fields.get(3)?.toString() || '') || (!fields.has(101) && !fields.get(102)?.length)) throw Error('Index is missing Mihon repository metadata');
}
async function validatedRaw(url, signal, fetcher) {
  let endpoint = https(canonicalRaw(url));
  for (let redirects = 0; redirects <= 5; redirects++) {
    const response = await fetcher(endpoint, { signal, redirect: 'manual' });
    if ([301, 302, 303, 307, 308].includes(response.status)) { await response.body?.cancel(); endpoint = https(new URL(response.headers.get('location'), endpoint).href); continue; }
    if (!response.ok) { await response.body?.cancel(); throw Error(`Repository download failed (${response.status})`); }
    if (Number(response.headers.get('content-length')) > LIMIT) { await response.body?.cancel(); throw Error('Repository index exceeds 16 MB'); }
    const chunks = []; let size = 0;
    for await (const chunk of response.body || []) { size += chunk.length; if (size > LIMIT) throw Error('Repository index exceeds 16 MB'); chunks.push(chunk); }
    validateIndex(Buffer.concat(chunks)); return endpoint;
  }
  throw Error('Too many repository redirects');
}
async function addMihonRepository(url, add, signal, fetcher = fetch) {
  try { return await add(url); }
  catch (original) {
    if (signal.aborted || !/Protobuf|decoding.*NetworkExtensionStore|NetworkExtensionStore.*decod/i.test(original.message)) throw original;
    try {
      const endpoint = await validatedRaw(url, signal, fetcher);
      if (endpoint === url) throw Error('The downloaded index is valid, but the local host could not decode it');
      return await add(endpoint);
    } catch (error) {
      signal.throwIfAborted();
      throw Error(`Could not read the Mihon repository index. ${error.message}. Retry or use the repository's raw index.pb URL. Existing extensions were preserved.`);
    }
  }
}
module.exports = { addMihonRepository, validateIndex, canonicalRaw };
