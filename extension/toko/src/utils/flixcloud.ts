import { fetchResponse } from './http.js';
/**
 * FlixCloud stream resolver.
 *
 * Re:ANIME serves its episodes through FlixCloud (https://flixcloud.cc) embed
 * pages such as `/e/{id}?v=1`. The page does not expose a plain m3u8 — the real
 * URL is encrypted with a key derived from a tiny WASM module shipped inline,
 * PBKDF2-SHA256 + AES-CBC. This module ports the Seanime/A2 reference
 * implementation so Toko can return a directly playable HLS/MP4 URL instead of
 * the embed page.
 *
 * The high-level flow:
 *   1. Fetch the embed HTML and read `obfuscation_seed` + `w_payload` (wasm).
 *   2. Derive obfuscated field names from the seed and read the token, key
 *      fragments and IV.
 *   3. GET /api/m3u8/{token} → encrypted video URL + encrypted key.
 *   4. Run the wasm transform (native WebAssembly with a tiny interpreted
 *      fallback) to recover a key fragment.
 *   5. PBKDF2-SHA256 → XOR → SHA-256 → AES-CBC decrypt the video URL.
 *
 * All crypto is pure-JS (SHA-256/HMAC/PBKDF2) so it runs in the extension
 * worker sandbox without Node built-ins. AES-CBC uses the Web Crypto subtle
 * API when available.
 */


export interface FlixCloudResult {
  url: string;
  subtitles: FlixSubtitle[];
  audioType?: string;
}

export interface FlixSubtitle {
  url: string;
  language: string;
  isDefault: boolean;
}

interface FlixCloudCryptoData {
  seed: string;
  payload: string;
  token: string;
  frag1: Uint8Array;
  frag2: Uint8Array;
  iv: Uint8Array;
}

interface FlixCloudFields {
  keyField: string;
  ivField: string;
  tokenField: string;
  keyFrag2Field: string;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolve a FlixCloud embed URL (`https://flixcloud.cc/e/{id}?v=N`) to a
 * directly playable stream URL. Returns null if the page cannot be decrypted.
 */
export async function resolveFlixCloud(
  playerUrl: string,
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response> = fetchResponse,
): Promise<FlixCloudResult | null> {
  try {
    const origin = originOf(playerUrl);
    const res = await fetchImpl(playerUrl, {
      headers: {
        Accept: 'text/html,application/json,*/*',
        Referer: `${origin}/`,
        Origin: origin,
      },
    });
    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') || '';
    const body = await res.text();

    if (contentType.includes('application/json')) {
      const direct = deepFindVideoUrl(safeJsonParse(body));
      if (direct) return { url: cleanUrl(direct), subtitles: [] };
    }

    const direct = extractDirectUrlFromHtml(body);
    if (direct) return { url: direct, subtitles: extractSubtitles(body) };

    if (!origin.includes('flixcloud.cc')) return null;
    return await decryptFlixCloudSource(playerUrl, body, fetchImpl);
  } catch {
    return null;
  }
}

// ── HTML extraction ──────────────────────────────────────────────────────────

function extractDirectUrlFromHtml(html: string): string | null {
  const candidates = [
    /["'`](https?:\/\/[^"'`\s]+\.m3u8[^"'`\s]*)["'`]/,
    /["'`](https?:\/\/[^"'`\s]+\.mp4[^"'`\s]*)["'`]/,
    /(?:file|source|src|url)\s*[:=]\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i,
  ];
  for (const pattern of candidates) {
    const match = html.match(pattern);
    if (match?.[1]) return cleanUrl(match[1]);
  }
  return null;
}

function extractSubtitles(html: string): FlixSubtitle[] {
  const subtitles: FlixSubtitle[] = [];
  const seen = new Set<string>();
  const pattern = /\{\s*url:"([^"]+)"\s*,\s*language:"([^"]+)"\s*,\s*format:"([^"]+)"\s*,\s*default:(true|false)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const url = cleanUrl(match[1]);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const language = match[2].replace(/\\u0028/g, '(').replace(/\\u0029/g, ')').replace(/\s+/g, ' ').trim();
    subtitles.push({ url, language, isDefault: match[4] === 'true' });
  }
  if (!subtitles.some(s => s.isDefault)) {
    const english = subtitles.find(s => s.language.toLowerCase().includes('english'));
    if (english) english.isDefault = true;
  }
  return subtitles;
}

function deepFindVideoUrl(value: unknown): string | null {
  if (typeof value === 'string') {
    const clean = cleanUrl(value);
    return videoType(clean) !== 'unknown' ? clean : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = deepFindVideoUrl(item);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) {
      const found = deepFindVideoUrl(item);
      if (found) return found;
    }
  }
  return null;
}

// ── FlixCloud decryption ─────────────────────────────────────────────────────

async function decryptFlixCloudSource(
  playerUrl: string,
  html: string,
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>,
): Promise<FlixCloudResult | null> {
  const cryptoData = extractCryptoData(html);
  if (!cryptoData) return null;

  const origin = originOf(playerUrl);
  const tokenResponse = await fetchImpl(`${origin}/api/m3u8/${cryptoData.token}`, {
    headers: {
      Accept: 'application/json,*/*',
      Origin: origin,
      Referer: playerUrl,
    },
  });
  if (!tokenResponse.ok) return null;

  let tokenData: Record<string, string>;
  try {
    tokenData = await tokenResponse.json();
  } catch {
    return null;
  }

  const videoField = sha256Hex(`${cryptoData.token}vid`).substring(0, 10);
  const keyField = sha256Hex(`${cryptoData.token}key`).substring(0, 10);
  const encryptedUrl = tokenData[videoField];
  const tokenKey = tokenData[keyField];
  if (!encryptedUrl || !tokenKey) return null;

  const wasmKey = await runWasmTransform(
    cryptoData.payload,
    cryptoData.frag1,
    cryptoData.frag2,
    base64ToBytes(tokenKey),
    parseInt(cryptoData.seed.substring(0, 8), 16),
  );
  if (!wasmKey) return null;

  const derived = pbkdf2Sha256(wasmKey, utf8Bytes(cryptoData.seed), 1000, 32);
  for (let i = 0; i < derived.length; i++) {
    derived[i] = derived[i] ^ cryptoData.seed.charCodeAt(i % cryptoData.seed.length);
  }

  const aesKey = sha256Bytes(derived);
  const directUrl = await aesCbcDecryptToString(encryptedUrl, aesKey, cryptoData.iv);
  if (!directUrl || videoType(directUrl) === 'unknown') return null;

  return {
    url: cleanUrl(directUrl),
    subtitles: extractSubtitles(html),
    audioType: extractJsStringField(html, 'audio_type') || undefined,
  };
}

function extractCryptoData(html: string): FlixCloudCryptoData | null {
  const seed = extractJsStringField(html, 'obfuscation_seed');
  const payload = extractJsStringField(html, 'w_payload');
  if (!seed || !payload) return null;

  const fields = flixCloudFields(seed);
  const token = extractJsStringField(html, fields.tokenField);
  const frag1 = extractJsStringField(html, fields.keyField);
  const frag2 = extractJsStringField(html, fields.keyFrag2Field);
  const iv = extractJsStringField(html, fields.ivField);
  if (!token || !frag1 || !frag2 || !iv) return null;

  return {
    seed,
    payload,
    token,
    frag1: base64ToBytes(frag1),
    frag2: base64ToBytes(frag2),
    iv: base64ToBytes(iv),
  };
}

function flixCloudFields(seed: string): FlixCloudFields {
  let base = seed;
  for (let i = 0; i < 3; i++) base = sha256Hex(`${base}${i}`);

  let second = base;
  for (let i = 0; i < 3; i++) second = sha256Hex(`${second}${i}`);

  return {
    keyField: `kf_${base.substring(8, 16)}`,
    ivField: `ivf_${base.substring(16, 24)}`,
    tokenField: `${base.substring(48, 64)}_${base.substring(56, 64)}`,
    keyFrag2Field: `${second.substring(0, 16)}_${second.substring(16, 24)}`,
  };
}

function extractJsStringField(html: string, field: string): string | null {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?:["']${escaped}["']|\\b${escaped}\\b)\\s*:\\s*["']([^"']+)["']`);
  return pattern.exec(html)?.[1] || null;
}

// ── WASM transform ───────────────────────────────────────────────────────────

async function runWasmTransform(
  payload: string,
  frag1: Uint8Array,
  frag2: Uint8Array,
  tokenKey: Uint8Array,
  seed: number,
): Promise<Uint8Array | null> {
  const wasmBytes = base64ToBytes(payload);
  const native = await runNativeWasmTransform(wasmBytes, frag1, frag2, tokenKey, seed);
  if (native) return native;
  return runInterpretedWasmTransform(wasmBytes, frag1, frag2, tokenKey, seed);
}

async function runNativeWasmTransform(
  wasmBytes: Uint8Array,
  frag1: Uint8Array,
  frag2: Uint8Array,
  tokenKey: Uint8Array,
  seed: number,
): Promise<Uint8Array | null> {
  try {
    const webAssembly = (globalThis as any).WebAssembly;
    if (!webAssembly?.instantiate) return null;
    const instantiated = await webAssembly.instantiate(wasmBytes, {});
    const exports = instantiated.instance.exports;
    const memory = exports.memory;
    if (!memory || typeof exports._s !== 'function' || typeof exports._r !== 'function') return null;

    if (memory.buffer.byteLength === 0) memory.grow(1);
    const heap = new Uint8Array(memory.buffer);
    const length = frag1.length;
    const frag1Ptr = 1000;
    const frag2Ptr = frag1Ptr + length;
    const tokenKeyPtr = frag2Ptr + length;
    const outputPtr = tokenKeyPtr + length;

    heap.set(frag1, frag1Ptr);
    heap.set(frag2, frag2Ptr);
    heap.set(tokenKey, tokenKeyPtr);
    exports._s(seed);
    exports._r(frag1Ptr, frag2Ptr, tokenKeyPtr, outputPtr, length);

    return new Uint8Array(heap.subarray(outputPtr, outputPtr + length));
  } catch {
    return null;
  }
}

function runInterpretedWasmTransform(
  wasmBytes: Uint8Array,
  frag1: Uint8Array,
  frag2: Uint8Array,
  tokenKey: Uint8Array,
  seed: number,
): Uint8Array | null {
  const bodies = wasmFunctionBodies(wasmBytes);
  if (bodies.length < 2) return null;

  const length = frag1.length;
  const memory = new Uint8Array(4096 + length * 4);
  const frag1Ptr = 1000;
  const frag2Ptr = frag1Ptr + length;
  const tokenKeyPtr = frag2Ptr + length;
  const outputPtr = tokenKeyPtr + length;

  memory.set(frag1, frag1Ptr);
  memory.set(frag2, frag2Ptr);
  memory.set(tokenKey, tokenKeyPtr);

  const ok = executeWasmBody(bodies[1], [frag1Ptr, frag2Ptr, tokenKeyPtr, outputPtr, length], [seed], memory);
  if (!ok) return null;
  return new Uint8Array(memory.subarray(outputPtr, outputPtr + length));
}

export function wasmFunctionBodies(bytes: Uint8Array): Uint8Array[] {
  const bodies: Uint8Array[] = [];
  let cursor = 8;

  const readUleb = (): number => {
    let result = 0;
    let shift = 0;
    while (cursor < bytes.length) {
      const byte = bytes[cursor++];
      result |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) break;
      shift += 7;
    }
    return result;
  };

  while (cursor < bytes.length) {
    const sectionId = bytes[cursor++];
    const sectionSize = readUleb();
    const sectionEnd = cursor + sectionSize;
    if (sectionId === 10) {
      const functionCount = readUleb();
      for (let i = 0; i < functionCount; i++) {
        const bodySize = readUleb();
        bodies.push(bytes.subarray(cursor, cursor + bodySize));
        cursor += bodySize;
      }
      break;
    }
    cursor = sectionEnd;
  }
  return bodies;
}

export function executeWasmBody(body: Uint8Array, params: number[], globals: number[], memory: Uint8Array): boolean {
  let pc = 0;
  const readUleb = (): number => {
    let result = 0;
    let shift = 0;
    while (pc < body.length) {
      const byte = body[pc++];
      result |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) break;
      shift += 7;
    }
    return result;
  };
  const readSleb = (): number => {
    let result = 0;
    let shift = 0;
    let byte = 0;
    do {
      byte = body[pc++];
      result |= (byte & 0x7f) << shift;
      shift += 7;
    } while ((byte & 0x80) !== 0);
    if (shift < 32 && (byte & 0x40) !== 0) result |= ~0 << shift;
    return result | 0;
  };

  const locals = params.slice();
  const localDeclCount = readUleb();
  for (let i = 0; i < localDeclCount; i++) {
    const count = readUleb();
    pc++; // value type, always i32
    for (let j = 0; j < count; j++) locals.push(0);
  }

  const blockEnds = wasmBlockEnds(body, pc);
  const stack: number[] = [];
  const controlStack: { isLoop: boolean; startPc: number; endPc: number }[] = [];
  let steps = 0;

  const branch = (depth: number): boolean => {
    const targetIndex = controlStack.length - 1 - depth;
    if (targetIndex < 0) return false;
    const frame = controlStack[targetIndex];
    if (frame.isLoop) {
      controlStack.length = targetIndex + 1;
      pc = frame.startPc;
    } else {
      controlStack.length = targetIndex;
      pc = frame.endPc + 1;
    }
    return true;
  };

  while (pc < body.length && steps++ < 100000) {
    const opPc = pc;
    const op = body[pc++];
    switch (op) {
      case 0x02:
      case 0x03:
        pc++;
        controlStack.push({ isLoop: op === 0x03, startPc: pc, endPc: blockEnds.get(opPc) || body.length - 1 });
        break;
      case 0x0b:
        // End of a block/loop, or end of the function body. If the control
        // stack is empty we have reached the function's trailing `end` which
        // signals successful execution.
        if (controlStack.length === 0) return true;
        controlStack.pop();
        break;
      case 0x0c:
        if (!branch(readUleb())) return false;
        break;
      case 0x0d: {
        const depth = readUleb();
        const condition = stack.pop() || 0;
        if (condition !== 0 && !branch(depth)) return false;
        break;
      }
      case 0x20:
        stack.push(locals[readUleb()] | 0);
        break;
      case 0x21:
        locals[readUleb()] = stack.pop() || 0;
        break;
      case 0x23:
        stack.push(globals[readUleb()] | 0);
        break;
      case 0x41:
        stack.push(readSleb());
        break;
      case 0x2d: {
        readUleb();
        const offset = readUleb();
        const address = (stack.pop() || 0) + offset;
        stack.push(memory[address] || 0);
        break;
      }
      case 0x3a: {
        readUleb();
        const offset = readUleb();
        const value = stack.pop() || 0;
        const address = (stack.pop() || 0) + offset;
        memory[address] = value & 0xff;
        break;
      }
      case 0x4f: {
        const right = (stack.pop() || 0) >>> 0;
        const left = (stack.pop() || 0) >>> 0;
        stack.push(left >= right ? 1 : 0);
        break;
      }
      case 0x4e: { // i32.ge_s
        const right = (stack.pop() || 0) | 0;
        const left = (stack.pop() || 0) | 0;
        stack.push(left >= right ? 1 : 0);
        break;
      }
      case 0x6a:
        stack.push(((stack.pop() || 0) + (stack.pop() || 0)) | 0);
        break;
      case 0x6b: {
        const right = stack.pop() || 0;
        stack.push(((stack.pop() || 0) - right) | 0);
        break;
      }
      case 0x6c:
        stack.push(Math.imul(stack.pop() || 0, stack.pop() || 0));
        break;
      case 0x71:
        stack.push((stack.pop() || 0) & (stack.pop() || 0));
        break;
      case 0x72:
        stack.push((stack.pop() || 0) | (stack.pop() || 0));
        break;
      case 0x73:
        stack.push((stack.pop() || 0) ^ (stack.pop() || 0));
        break;
      case 0x74: {
        const shift = (stack.pop() || 0) & 31;
        stack.push((stack.pop() || 0) << shift);
        break;
      }
      case 0x76: {
        const shift = (stack.pop() || 0) & 31;
        stack.push((stack.pop() || 0) >>> shift);
        break;
      }
      default:
        return false;
    }
  }
  return false;
}

function wasmBlockEnds(body: Uint8Array, codeStart: number): Map<number, number> {
  const ends = new Map<number, number>();
  const stack: number[] = [];
  let cursor = codeStart;
  const readUlebAt = (): void => {
    while (cursor < body.length && (body[cursor++] & 0x80) !== 0) {
      // skip LEB continuation
    }
  };
  while (cursor < body.length) {
    const opPc = cursor;
    const op = body[cursor++];
    switch (op) {
      case 0x02:
      case 0x03:
        cursor++;
        stack.push(opPc);
        break;
      case 0x0b:
        if (stack.length === 0) return ends;
        ends.set(stack.pop()!, opPc);
        break;
      case 0x0c:
      case 0x0d:
      case 0x20:
      case 0x21:
      case 0x23:
      case 0x41:
        readUlebAt();
        break;
      case 0x2d:
      case 0x3a:
        readUlebAt();
        readUlebAt();
        break;
      default:
        break;
    }
  }
  return ends;
}

// ── AES-CBC ──────────────────────────────────────────────────────────────────

async function aesCbcDecryptToString(cipherTextB64: string, key: Uint8Array, iv: Uint8Array): Promise<string | null> {
  try {
    const subtle = (globalThis as any).crypto?.subtle;
    if (subtle?.importKey && subtle?.decrypt) {
      const cryptoKey = await subtle.importKey('raw', key, { name: 'AES-CBC' }, false, ['decrypt']);
      const decrypted = await subtle.decrypt({ name: 'AES-CBC', iv }, cryptoKey, base64ToBytes(cipherTextB64));
      return bytesToUtf8(new Uint8Array(decrypted));
    }
  } catch {
    // fall through
  }
  return null;
}

// ── PBKDF2 / HMAC / SHA-256 (pure JS) ────────────────────────────────────────

function pbkdf2Sha256(password: Uint8Array, salt: Uint8Array, iterations: number, keyLength: number): Uint8Array {
  const hashLength = 32;
  const blocks = Math.ceil(keyLength / hashLength);
  const derived = new Uint8Array(blocks * hashLength);

  for (let block = 1; block <= blocks; block++) {
    const blockSalt = concatBytes(salt, new Uint8Array([
      (block >>> 24) & 0xff,
      (block >>> 16) & 0xff,
      (block >>> 8) & 0xff,
      block & 0xff,
    ]));
    let u = hmacSha256(password, blockSalt);
    const t = new Uint8Array(u);
    for (let i = 1; i < iterations; i++) {
      u = hmacSha256(password, u);
      for (let j = 0; j < hashLength; j++) t[j] ^= u[j];
    }
    derived.set(t, (block - 1) * hashLength);
  }
  return derived.subarray(0, keyLength);
}

function hmacSha256(key: Uint8Array, message: Uint8Array): Uint8Array {
  let normalizedKey = key;
  if (normalizedKey.length > 64) normalizedKey = sha256Bytes(normalizedKey);
  const keyBlock = new Uint8Array(64);
  keyBlock.set(normalizedKey);
  const outer = new Uint8Array(64);
  const inner = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    outer[i] = keyBlock[i] ^ 0x5c;
    inner[i] = keyBlock[i] ^ 0x36;
  }
  return sha256Bytes(concatBytes(outer, sha256Bytes(concatBytes(inner, message))));
}

function sha256Hex(value: string | Uint8Array): string {
  return bytesToHex(sha256Bytes(value));
}

function sha256Bytes(value: string | Uint8Array): Uint8Array {
  const data = typeof value === 'string' ? utf8Bytes(value) : value;
  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const paddedLength = (((data.length + 9 + 63) >> 6) << 6);
  const bytes = new Uint8Array(paddedLength);
  bytes.set(data);
  bytes[data.length] = 0x80;

  const bitLengthLow = (data.length << 3) >>> 0;
  const bitLengthHigh = Math.floor(data.length / 0x20000000);
  bytes[paddedLength - 8] = (bitLengthHigh >>> 24) & 0xff;
  bytes[paddedLength - 7] = (bitLengthHigh >>> 16) & 0xff;
  bytes[paddedLength - 6] = (bitLengthHigh >>> 8) & 0xff;
  bytes[paddedLength - 5] = bitLengthHigh & 0xff;
  bytes[paddedLength - 4] = (bitLengthLow >>> 24) & 0xff;
  bytes[paddedLength - 3] = (bitLengthLow >>> 16) & 0xff;
  bytes[paddedLength - 2] = (bitLengthLow >>> 8) & 0xff;
  bytes[paddedLength - 1] = bitLengthLow & 0xff;

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const w = new Array<number>(64);

  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4;
      w[i] = ((bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + k[i] + w[i]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const out = new Uint8Array(32);
  const words = [h0, h1, h2, h3, h4, h5, h6, h7];
  for (let i = 0; i < words.length; i++) {
    out[i * 4] = (words[i] >>> 24) & 0xff;
    out[i * 4 + 1] = (words[i] >>> 16) & 0xff;
    out[i * 4 + 2] = (words[i] >>> 8) & 0xff;
    out[i * 4 + 3] = words[i] & 0xff;
  }
  return out;
}

function rotr(value: number, shift: number): number {
  return (value >>> shift) | (value << (32 - shift));
}

// ── Byte / string helpers ────────────────────────────────────────────────────

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, array) => sum + array.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const array of arrays) {
    out.set(array, offset);
    offset += array.length;
  }
  return out;
}

function utf8Bytes(value: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value);
  const out: number[] = [];
  for (let i = 0; i < value.length; i++) {
    let codePoint = value.charCodeAt(i);
    if (codePoint >= 0xd800 && codePoint <= 0xdbff && i + 1 < value.length) {
      const next = value.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (next - 0xdc00);
        i++;
      }
    }
    if (codePoint < 0x80) out.push(codePoint);
    else if (codePoint < 0x800) out.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    else if (codePoint < 0x10000) out.push(0xe0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f));
    else out.push(0xf0 | (codePoint >> 18), 0x80 | ((codePoint >> 12) & 0x3f), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f));
  }
  return new Uint8Array(out);
}

function bytesToUtf8(value: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(value);
  let out = '';
  for (let i = 0; i < value.length; i++) out += String.fromCharCode(value[i]);
  return decodeURIComponent(escape(out));
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function bytesToHex(value: Uint8Array): string {
  let out = '';
  for (let i = 0; i < value.length; i++) out += value[i].toString(16).padStart(2, '0');
  return out;
}

// ── URL helpers ───────────────────────────────────────────────────────────────

function videoType(url: string): 'm3u8' | 'mp4' | 'unknown' {
  const clean = url.split('?')[0].toLowerCase();
  if (clean.endsWith('.m3u8')) return 'm3u8';
  if (clean.endsWith('.mp4')) return 'mp4';
  return 'unknown';
}

function cleanUrl(url: string): string {
  return url.replace(/\\\//g, '/').replace(/&amp;/g, '&').trim();
}

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return 'https://flixcloud.cc';
  }
}

function safeJsonParse(text: string): unknown {
  try { return JSON.parse(text); } catch { return null; }
}
