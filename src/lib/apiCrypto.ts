/**
 * API Request Encryption / Decryption
 *
 * Encrypts outgoing API requests and decrypts incoming API responses
 * using AES-GCM via the Web Crypto API.  The shared secret is stored
 * in a non-public env var (VITE_API_SECRET) and must match the server.
 *
 * Wire format  (Base64):  iv(12B) || ciphertext || authTag(16B)
 */

// ── Shared key (must match server-side API_SECRET) ──────────────────
const API_SECRET = import.meta.env.VITE_API_SECRET || '';

// Cache the derived keys so we only derive once
let _cachedKey: CryptoKey | null = null;
let _cachedHmacKey: CryptoKey | null = null;

/**
 * Derive an HMAC-SHA256 key from the shared secret using PBKDF2.
 */
async function getHmacKey(): Promise<CryptoKey> {
  if (_cachedHmacKey) return _cachedHmacKey;

  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(API_SECRET),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  // Same deterministic salt as the AES key
  const salt = enc.encode(`tatakai-api-salt-${API_SECRET.slice(0, 8)}`);

  _cachedHmacKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  return _cachedHmacKey;
}

/**
 * Derive a 256-bit AES-GCM key from the shared secret using PBKDF2.
 * The salt is deterministic (derived from the secret itself) so both
 * sides produce the same key without exchanging a salt.
 */
async function getKey(): Promise<CryptoKey> {
  if (_cachedKey) return _cachedKey;

  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(API_SECRET),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  // Deterministic salt from the secret itself
  const salt = enc.encode(`tatakai-api-salt-${API_SECRET.slice(0, 8)}`);

  _cachedKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );

  return _cachedKey;
}

// ── Helpers ─────────────────────────────────────────────────────────
function toBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Returns true when encryption is configured (the secret is set).
 */
export function isApiCryptoEnabled(): boolean {
  return API_SECRET.length > 0;
}

/**
 * Encrypt a plaintext payload → Base64 string.
 */
export async function encryptPayload(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext),
  );

  // Prefix the IV so the server can decrypt
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return toBase64(combined.buffer);
}

/**
 * Decrypt a Base64 string → plaintext.
 */
export async function decryptPayload(encoded: string): Promise<string> {
  const key = await getKey();
  const raw = fromBase64(encoded);
  const iv = raw.slice(0, 12);
  const ciphertext = raw.slice(12);
  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(plainBuf);
}

/**
 * Generate the `X-Api-Timestamp` and `X-Api-Signature` headers that the
 * server validates to ensure requests come from our app.
 *
 * Signature = HMAC-SHA256( derived-key, timestamp + ":" + path )
 * Path should be /api/v1/... or the full request path.
 */
export async function generateApiSignature(
  path: string,
): Promise<{ timestamp: string; signature: string }> {
  const timestamp = Date.now().toString();
  const enc = new TextEncoder();
  
  // Normalize path: ensure it starts with /
  const normalizedPath = path.startsWith('/') ? path : '/' + path;
  
  // Use the derived HMAC key (matches backend)
  const key = await getHmacKey();

  const data = enc.encode(`${timestamp}:${normalizedPath}`);
  const sigBuf = await crypto.subtle.sign('HMAC', key, data);
  const signature = toBase64(sigBuf);
  
  console.debug('[API Signature] Generated for path:', normalizedPath, 'timestamp:', timestamp);
  return { timestamp, signature };
}
