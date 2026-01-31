#!/usr/bin/env node
/**
 * Generate Tauri (and optionally Capacitor) app icons from /public assets.
 * Uses `tauri icon` CLI to produce the full set (desktop + iOS + Android).
 *
 * Usage: node scripts/generate-app-icons.js
 * Input: public/tatakai-logo-square.png (or pass path as first arg)
 */

import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const defaultInput = path.join(root, 'public', 'tatakai-logo-square.png');
const input = process.argv[2] || defaultInput;

console.log('[generate-app-icons] Input:', input);
const r = spawnSync('npx', ['tauri', 'icon', input], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
});
if (r.status !== 0) {
  process.exit(r.status ?? 1);
}
console.log('[generate-app-icons] Done. Icons written to src-tauri/icons/');
