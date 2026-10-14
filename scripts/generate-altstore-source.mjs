#!/usr/bin/env node
/**
 * Generates the AltStore / SideStore / StikStore source JSON for Tatakai's iOS app.
 *
 * AltStore, SideStore and StikStore all consume the same "source" format, so a
 * single hosted file covers all three. Users add it via:
 *
 *   AltStore  -> Sources tab -> + -> paste https://tatakai.me/altstore/apps.json
 *   SideStore -> same flow (identical format)
 *
 * The file is served as a static asset: `public/altstore/apps.json` is copied to
 * `dist/altstore/apps.json` by Vite, which Vercel then serves at
 * https://tatakai.me/altstore/apps.json.
 *
 * Usage:
 *   node scripts/generate-altstore-source.mjs [--out public/altstore/apps.json]
 *     [--size <bytes>] [--versionDate <iso>] [--notes <text>]
 *
 *   --size / --versionDate default to the on-disk
 *   `Tatakai-v<version>-ios-unsigned.ipa` (repo root or mobile-artifacts/ios/)
 *   when present, so CI can inject the real byte size after the iOS job runs.
 *   When no IPA is present, size falls back to 0 — AltStore tolerates it for
 *   display, but CI should always regenerate with the real artifact.
 *
 * Source format reference: https://faq.altstore.io/developers/make-a-source
 */

import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a, i, arr) => (a.startsWith('--') ? [a.slice(2), arr[i + 1]?.startsWith('--') ? 'true' : arr[i + 1]] : null))
    .filter(Boolean),
);

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const VERSION = pkg.version;
const TAG = `v${VERSION}`;
const REPO = 'snozxyx/tatakai';
const APPLE_BUNDLE_ID = 'app.tatakai.me';

const IPA_NAME = `Tatakai-v${VERSION}-ios-unsigned.ipa`;
const APK_NAME = `Tatakai-v${VERSION}-android.apk`;

const ipaSearchPaths = [
  join(root, IPA_NAME),
  join(root, `mobile-artifacts/ios/${IPA_NAME}`),
  join(root, `ios/package/${IPA_NAME}`),
];

// Resolve real IPA size when the artifact is on disk (CI release job).
let size = Number(args.size ?? 0);
if (!size) {
  for (const p of ipaSearchPaths) {
    if (existsSync(p)) {
      size = statSync(p).size;
      console.log(`[altstore] using IPA size ${size} bytes from ${p}`);
      break;
    }
  }
}
if (!size) {
  console.warn('[altstore] WARNING: no IPA found and no --size given; writing size 0. Regenerate in CI with the real artifact.');
}

// versionDate: explicit override, else IPA mtime, else now.
let versionDate = args.versionDate;
if (!versionDate) {
  for (const p of ipaSearchPaths) {
    if (existsSync(p)) {
      versionDate = statSync(p).mtime.toISOString();
      break;
    }
  }
}
versionDate ??= new Date().toISOString();

const versionDescription =
  args.notes ??
  `Tatakai ${VERSION} for iPhone & iPad. Unsigned build: sideload with AltStore, SideStore or TrollStore using your own Apple ID, then refresh before the 7-day free-account expiry. See the GitHub release notes for the full changelog.`;

const ICON_URL = 'https://tatakai.me/assets/logo/tatakai-logo-square.png';
const BANNER_URL = 'https://tatakai.me/assets/logo/tatakaibanner.png';

const source = {
  name: 'Tatakai',
  identifier: 'me.tatakai.altstore',
  subtitle: 'Extension-based anime & manga app for iOS',
  description:
    'Official Tatakai source for AltStore, SideStore and StikStore. ' +
    'Tatakai is an extension-based otaku community for tracking anime & manga — ' +
    'install the iOS build with your own Apple ID. Free accounts must refresh every 7 days.',
  iconURL: ICON_URL,
  headerURL: BANNER_URL,
  website: 'https://tatakai.me',
  tintColor: '#a855f7',
  featuredApps: [APPLE_BUNDLE_ID],
  apps: [
    {
      name: 'Tatakai',
      bundleIdentifier: APPLE_BUNDLE_ID,
      developerName: 'Snozxyx',
      subtitle: 'Discover, watch, and read — your way',
      localizedDescription:
        'Tatakai brings anime discovery, streaming, manga reading, and community features together in one customizable app. ' +
        'Its extension-first design lets you choose your sources.\n\n' +
        'THIS IS AN UNSIGNED BUILD for sideloading only: it cannot be installed directly. ' +
        'Add this source in AltStore / SideStore (or open the IPA in TrollStore) to sign it with your own Apple ID. ' +
        'Tatakai does not host media files; users access media through third-party extensions and are responsible for complying with applicable laws.',
      iconURL: ICON_URL,
      tintColor: '#a855f7',
      category: 'entertainment',
      version: VERSION,
      versionDate,
      versionDescription,
      downloadURL: `https://github.com/${REPO}/releases/download/${TAG}/${IPA_NAME}`,
      size,
      screenshots: [],
      permissions: [],
    },
  ],
  news: [
    {
      identifier: `tatakai-${VERSION}-ios-source`,
      title: `Tatakai ${VERSION} available for sideloading`,
      caption: 'Add this source in AltStore or SideStore to install on iPhone & iPad.',
      date: versionDate,
      tintColor: '#a855f7',
      imageURL: BANNER_URL,
      notify: false,
      url: `https://github.com/${REPO}/releases/tag/${TAG}`,
      appID: APPLE_BUNDLE_ID,
    },
  ],
};

// Tiny self-check: AltStore requires these fields, fail loudly instead of shipping a broken source.
for (const field of ['name', 'identifier', 'apps']) {
  if (!source[field]) throw new Error(`[altstore] missing required source field: ${field}`);
}
for (const field of ['bundleIdentifier', 'version', 'versionDate', 'downloadURL', 'size']) {
  if (source.apps[0][field] === undefined) throw new Error(`[altstore] missing required app field: ${field}`);
}

const out = resolve(root, args.out ?? 'public/altstore/apps.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(source, null, 2)}\n`);
console.log(`[altstore] wrote ${out}`);
console.log(`[altstore] Android users: sideloading on Android does NOT use this file — grab ${APK_NAME} from GitHub Releases, or track the repo in Obtainium (see docs/guides/sideload-and-stores.md).`);
