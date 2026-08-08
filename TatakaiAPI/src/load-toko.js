/**
 * Loads the compiled Toko extension bundle and wires up the sandbox globals
 * (__tatakai_fetch__ via Node fetch, __tatakai_parse_html__ via cheerio).
 *
 * The bundle is a CommonJS module that reads the two globals at call time, so
 * we set them on globalThis before requiring it. Because the toko package.json
 * declares "type": "module", we stage a .cjs copy of the bundle in the temp dir
 * so Node always loads it as CommonJS.
 */
import { createRequire } from 'node:module';
import { readFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { load } from 'cheerio';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TOKO_BUNDLE_SRC = process.env.TOKO_BUNDLE ||
  path.resolve(__dirname, '../../extension/toko/dist/bundle.js');
const TOKO_BUNDLE = path.join(os.tmpdir(), 'tatakai-toko-bundle.cjs');

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

async function tatiFetch(url, init = {}) {
  const headers = new Headers(init.headers || {});
  if (!headers.has('User-Agent')) headers.set('User-Agent', DEFAULT_UA);
  if (!headers.has('Accept-Language')) headers.set('Accept-Language', 'en-US,en;q=0.9');
  if (!headers.has('Accept')) headers.set('Accept', '*/*');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.signal ? undefined : 15000);
  if (init.signal) init.signal.addEventListener('abort', () => controller.abort());

  try {
    return await fetch(url, { ...init, headers, signal: controller.signal, redirect: init.redirect || 'follow' });
  } finally {
    clearTimeout(timeout);
  }
}

function parseHtml(html) {
  return load(html || '', { xml: false, decodeEntities: false });
}

let toko = null;

export function loadToko() {
  if (toko) return toko;

  if (!existsSync(TOKO_BUNDLE_SRC)) {
    throw new Error(`Toko bundle not found at ${TOKO_BUNDLE_SRC}. Run: npm --prefix extension/toko run build`);
  }

  // Stage a .cjs copy. Re-copy on every load so bundle rebuilds take effect.
  mkdirSync(path.dirname(TOKO_BUNDLE), { recursive: true });
  copyFileSync(TOKO_BUNDLE_SRC, TOKO_BUNDLE);

  globalThis.__tatakai_fetch__ = tatiFetch;
  globalThis.__tatakai_parse_html__ = parseHtml;

  const mod = require(TOKO_BUNDLE);
  const Bundle = mod.default || mod;
  toko = typeof Bundle === 'function' ? new Bundle() : Bundle;

  if (!toko || typeof toko.single !== 'function') {
    throw new Error('Toko bundle loaded but does not expose single()');
  }
  return toko;
}
