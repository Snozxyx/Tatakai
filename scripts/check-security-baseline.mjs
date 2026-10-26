#!/usr/bin/env node
/**
 * Tatakai security baseline — repository invariants that must never regress.
 *
 * These are the checks a generic SAST/scanner will not make: they encode the
 * specific decisions this project made about its own trust boundaries. Run in CI
 * (.github/workflows/security.yml) and locally:
 *
 *     node scripts/check-security-baseline.mjs
 *
 * Exit code 0 = every invariant holds. Non-zero = a regression; the output names
 * the file and the invariant so the fix is obvious.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const failures = [];
const checked = [];

function fail(id, message, detail) {
  failures.push({ id, message, detail });
}
function ok(id) {
  checked.push(id);
}

function read(rel) {
  return readFileSync(join(ROOT, rel), 'utf8');
}

/** Walk the repo, skipping generated / vendored / binary trees. */
function walk(dir, out = []) {
  const SKIP = new Set([
    'node_modules', '.git', 'dist', 'dist_electron', 'build', 'coverage',
    '.cache', '.artifacts', '.agents', 'target', 'vendor', 'Pods',
  ]);
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

// ── 1. Desktop preload bridge must not mirror arbitrary IPC ───────────────────
{
  const preload = read('desktop/preload.cjs');
  if (/invoke:\s*\([^)]*\)\s*=>\s*ipcRenderer\.(invoke|send)/.test(preload)) {
    fail(
      'DESK-1',
      'desktop/preload.cjs exposes a generic invoke() passthrough',
      'Every renderer capability must be a named entry on the bridge.'
    );
  } else {
    ok('DESK-1 preload has no generic invoke() passthrough');
  }
}

// ── 2. IPC sender guard must be installed before handlers ─────────────────────
{
  const main = read('desktop/main.cjs');
  const guardAt = main.indexOf('installIpcSenderGuard(ipcMain');
  const firstHandler = main.indexOf("require('./ipc/");
  if (guardAt === -1) {
    fail('DESK-2', 'desktop/main.cjs does not install the IPC sender guard', '');
  } else if (firstHandler !== -1 && firstHandler < guardAt) {
    fail(
      'DESK-2',
      'IPC handler modules are required before installIpcSenderGuard() runs',
      'Handlers registered before the guard are unvalidated.'
    );
  } else {
    ok('DESK-2 IPC sender guard installed before handler registration');
  }
}

// ── 3. Extension workers must request process isolation ───────────────────────
{
  const pool = read('desktop/runtime/extension/extension-worker-pool.cjs');
  if (!pool.includes('buildPermissionExecArgv')) {
    fail(
      'EXT-1',
      'extension workers are spawned without process isolation',
      'A .kai bundle can otherwise reach process.getBuiltinModule("child_process").'
    );
  } else {
    ok('EXT-1 extension workers request the Node permission model');
  }
  if (!pool.includes('WORKER_GLOBAL_HARDENING_SOURCE')) {
    fail('EXT-1', 'worker bootstrap hardening strip is missing', '');
  } else {
    ok('EXT-1 worker bootstrap strips process escape hatches');
  }
}

// ── 4. Extension packages must not be trusted without integrity checks ────────
{
  const registry = read('desktop/ipc/ipc-runtime.cjs');
  if (!/isValidExtensionId/.test(registry)) {
    fail('EXT-2', 'extension ids are not validated before use as paths', '');
  } else {
    ok('EXT-2 extension ids validated');
  }
}

// ── 5. Streaming proxy must not follow redirects blindly ──────────────────────
{
  const worker = read('cloudflare-worker/src/index.js');
  // Match the option, not prose: comments may legitimately mention the old value.
  if (/redirect:\s*['"]follow['"]\s*[,}]/.test(worker.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''))) {
    fail(
      'PW-2',
      "cloudflare-worker/src/index.js passes redirect: 'follow'",
      'A redirect can bypass the SSRF host check; follow redirects manually.'
    );
  } else {
    ok('PW-2 streaming proxy validates redirect hops');
  }
  if (!/isBlockedHost/.test(worker)) fail('PW-2', 'streaming proxy lost its SSRF host guard', '');
  else ok('PW-2 streaming proxy keeps the private-range guard');
}

// ── 6. Home server must not trust loopback + wildcard CORS ────────────────────
{
  const store = read('desktop/runtime/home-server/store.cjs');
  if (/corsOrigins:\s*\['\*'\]/.test(store)) {
    fail('HOME-1', "home-server default corsOrigins is ['*']", 'Default must be same-origin only.');
  } else {
    ok('HOME-1 home server defaults to same-origin CORS');
  }
  const server = read('desktop/runtime/home-server/server.cjs');
  for (const marker of ['isAllowedHostHeader', 'isAllowedOrigin']) {
    if (!server.includes(marker)) fail('HOME-1', `home server is missing ${marker}()`, '');
  }
  ok('HOME-1 home server validates Host and Origin');
}

// ── 7. Renderer HTML injection must go through the sanitizer ──────────────────
{
  const files = walk(join(ROOT, 'src')).filter((f) => ['.ts', '.tsx'].includes(extname(f)));
  const allowed = new Set([
    join(ROOT, 'src/components/ui/safe-html.tsx'),
    join(ROOT, 'src/components/ui/chart.tsx'), // library-generated SVG, no user input
    join(ROOT, 'src/integrations/supabase/client.ts'), // static markup, no user input
  ]);
  const offenders = [];
  for (const file of files) {
    if (allowed.has(file)) continue;
    const source = readFileSync(file, 'utf8');
    // Only a real JSX sink counts — the string also appears in doc comments that
    // explain why it is *not* used.
    if (/dangerouslySetInnerHTML\s*=\s*\{/.test(source)) offenders.push(relative(ROOT, file));
  }
  if (offenders.length) {
    fail(
      'XSS-1',
      `dangerouslySetInnerHTML outside SafeHtml: ${offenders.join(', ')}`,
      'User-authored HTML must render through <SafeHtml>, which re-sanitizes at render time.'
    );
  } else {
    ok('XSS-1 no raw HTML sinks outside the sanitizer');
  }
}

// ── 8. No tracked environment files / obvious credentials ─────────────────────
{
  const suspicious = [];
  for (const name of ['.env', '.env.local', '.env.production', '.env.development']) {
    if (existsSync(join(ROOT, name))) suspicious.push(name);
  }
  const patterns = [
    ['Supabase service-role JWT', /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/],
    ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{20,}/],
    ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
    ['Private key block', /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/],
    ['Stripe secret key', /\bsk_live_[A-Za-z0-9]{20,}/],
    ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ];
  const expiringAnonJwt = /role"\s*:\s*"anon"/; // public by design; allow-listed below
  const allow = new Set([join(ROOT, '.env.web')]);
  for (const file of walk(ROOT)) {
    if (!['.ts', '.tsx', '.js', '.cjs', '.mjs', '.json', '.md', '.yml', '.yaml', '.toml', '.sql', '.html', '.kt', '.java', '.swift', '.py', '.sh'].includes(extname(file))) continue;
    const source = readFileSync(file, 'utf8');
    for (const [label, pattern] of patterns) {
      const match = source.match(pattern);
      if (!match) continue;
      if (label === 'Supabase service-role JWT' && (allow.has(file) || expiringAnonJwt.test(source.slice(Math.max(0, match.index - 400), match.index + 400)))) continue;
      suspicious.push(`${relative(ROOT, file)} → ${label}`);
    }
  }
  if (suspicious.length) {
    fail('SEC-1', `possible committed credentials: ${suspicious.join('; ')}`, 'Rotate and remove from history.');
  } else {
    ok('SEC-1 no tracked env files or hard-coded credentials');
  }
}

// ── 9. CI workflows must not run PR-supplied code with write tokens ───────────
{
  const dir = join(ROOT, '.github/workflows');
  const problems = [];
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
  } catch {
    /* no workflows */
  }
  for (const name of files) {
    const source = readFileSync(join(dir, name), 'utf8');
    // `pull_request_target` + checkout of the PR head is the classic RCE pattern.
    if (/pull_request_target/.test(source) && /github\.event\.pull_request\.head\.(sha|ref)/.test(source)) {
      problems.push(`${name}: pull_request_target checks out PR head`);
    }
    // Unquoted interpolation of event data into `run:` blocks (script injection).
    if (/run:\s*\|[\s\S]*?\$\{\{\s*github\.event\.(issue|comment|pull_request)\./.test(source)) {
      problems.push(`${name}: interpolates event text into a shell command`);
    }
  }
  if (problems.length) fail('CI-1', problems.join('; '), '');
  else ok('CI-1 workflows avoid PR-head + write-token patterns');
}

// ── 10. Desktop media bridge must not accept protocol-handler URLs ────────────
{
  const media = read('desktop/ipc/ipc-media.cjs');
  // `concat:`, `subfile:`, `pipe:` and friends make ffmpeg/ffprobe read a second
  // file the renderer never named; the guard must be scheme-based, not a denylist
  // of the schemes we happen to remember today.
  if (!/ALLOWED_MEDIA_SCHEMES/.test(media)) {
    fail(
      'DESK-7',
      'desktop/ipc/ipc-media.cjs lost its media URL scheme allowlist',
      'DESK-7: probe/extract handlers must reject concat:, subfile:, pipe:, playlist:.'
    );
  } else if (!/new URL\(|URL\.parse\(/.test(media)) {
    fail('DESK-7', 'media scheme check no longer parses the URL', 'String prefix checks miss encoded separators.');
  } else {
    ok('DESK-7 media bridge allowlists URL schemes before spawning ffmpeg');
  }
}

// ── 11. media:read-local-file must stay a narrow subtitle reader ──────────────
{
  const media = read('desktop/ipc/ipc-media.cjs');
  const hasExtAllowlist = /TEXT_ASSET_EXTENSIONS/.test(media);
  const hasSizeCap = /MAX_TEXT_ASSET_BYTES/.test(media);
  const hasDenylist = /isSensitivePath/.test(media) && /\.ssh/.test(media) && /\.gnupg/.test(media);
  if (!hasExtAllowlist || !hasSizeCap || !hasDenylist) {
    fail(
      'DESK-8',
      'media:read-local-file is no longer a narrow, bounded text-asset reader',
      'DESK-8: keep the extension allowlist, the size cap and the sensitive-path denylist.'
    );
  } else {
    ok('DESK-8 local subtitle reader is extension- and path-restricted with a size cap');
  }
}

// ── 12. Android must not back up session tokens or the library index ──────────
{
  const manifestPath = 'android/app/src/main/AndroidManifest.xml';
  const rulesPath = 'android/app/src/main/res/xml/data_extraction_rules.xml';
  if (!existsSync(join(ROOT, manifestPath))) {
    ok('MOB-1 no Android manifest in this checkout');
  } else {
    const manifest = read(manifestPath);
    const problems = [];
    if (!/android:allowBackup="false"/.test(manifest)) problems.push('allowBackup is not "false"');
    if (!/android:fullBackupContent="false"/.test(manifest)) problems.push('fullBackupContent is not "false"');
    if (!/android:dataExtractionRules="@xml\/data_extraction_rules"/.test(manifest)) {
      problems.push('dataExtractionRules is not wired to @xml/data_extraction_rules');
    }
    if (!existsSync(join(ROOT, rulesPath))) {
      problems.push('res/xml/data_extraction_rules.xml is missing');
    } else {
      const rules = read(rulesPath);
      for (const marker of ['<cloud-backup', '<device-transfer', 'root', 'sharedpref']) {
        if (!rules.includes(marker)) problems.push(`data_extraction_rules.xml no longer excludes ${marker}`);
      }
    }
    if (problems.length) {
      fail(
        'MOB-1',
        `Android backup of app-private state is exposed: ${problems.join('; ')}`,
        'MOB-1: the session token and library index live in device storage and must not leave via adb backup or device transfer.'
      );
    } else {
      ok('MOB-1 Android backup/device-transfer exclude app-private state');
    }
  }
}

// ── 13. Internal tables must keep an explicit RLS decision ────────────────────
{
  const expected = [
    'public.app_config',
    'public.anime_trending_scores',
    'public.analytics_events',
  ];
  // The hardening migration is the single place that documents the decision for
  // these tables; if it disappears, they silently fall back to anon-writable.
  const hardening = 'supabase/migrations/20261026000007_rls_hardening_internal_tables.sql';
  if (!existsSync(join(ROOT, hardening))) {
    fail(
      'DB-1',
      `${hardening} is missing`,
      'DB-1: app_config holds android_download_url; an anon-writable config table is a supply-chain hole.'
    );
  } else {
    const sql = read(hardening);
    const missing = expected.filter((t) => !sql.includes(`ALTER TABLE IF EXISTS ${t} ENABLE ROW LEVEL SECURITY`)
      && !sql.includes(`EXECUTE 'ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY'`));
    if (missing.length) {
      fail('DB-1', `RLS decision missing for: ${missing.join(', ')}`, '');
    } else {
      ok('DB-1 internal public tables have an explicit RLS decision');
    }
  }
}

// ── 14. Local extension-API host must not answer with wildcard CORS ───────────
{
  const hostServer = read('desktop/runtime/extension-api-host/host-server.cjs');
  const wildcard = /Access-Control-Allow-Origin':\s*'\*'/.test(hostServer);
  if (wildcard) {
    fail(
      'EXT-3',
      "extension-api host answers with a hard-coded Access-Control-Allow-Origin: '*'",
      'EXT-3: the server runs on a predictable loopback port; a wildcard lets any web page read it.'
    );
  } else if (!/evaluateRequestOrigin/.test(hostServer) || !/isAllowedHostHeader/.test(hostServer)) {
    fail('EXT-3', 'extension-api host lost its request-origin guard', 'Host and Origin must be validated before routing.');
  } else {
    ok('EXT-3 extension-api host validates Host/Origin and echoes the caller origin');
  }
}

// ── 15. open-path must not hand arbitrary files to the OS handler ─────────────
{
  const lib = read('desktop/ipc/ipc-library.cjs');
  const handlerAt = lib.indexOf("ipcMain.handle('open-path'");
  const handlerBody = handlerAt === -1 ? '' : lib.slice(handlerAt, handlerAt + 2600);
  if (handlerAt === -1) {
    fail('DESK-9', 'the open-path IPC handler is missing', '');
  } else if (!/OPENABLE_EXTENSIONS/.test(handlerBody) || /shell\.openPath\(filePath\)/.test(lib)) {
    fail(
      'DESK-9',
      'open-path forwards caller paths straight to shell.openPath()',
      'DESK-9: shell.openPath on a .exe/.bat/.lnk is local code execution.'
    );
  } else {
    ok('DESK-9 open-path only opens directories and media/document files');
  }
}

// ── 16. OAuth callbacks must verify the CSRF `state` ──────────────────────────
{
  const integrations = read('src/lib/externalIntegrations.ts');
  const redirectPage = read('src/pages/auth/AniListRedirectPage.tsx');
  const problems = [];
  if (!/state:\s*effectiveState|state:\s*state\b/.test(integrations)) {
    problems.push('the AniList authorize URL no longer carries a state parameter');
  }
  if (!/readAniListOAuthState/.test(redirectPage) || !/stateParam\s*!==\s*expectedState/.test(redirectPage)) {
    problems.push('AniListRedirectPage no longer compares the returned state with the stored one');
  }
  if (problems.length) {
    fail('AUTH-1', `OAuth CSRF state check regressed: ${problems.join('; ')}`, 'AUTH-1: an unverified code links the attacker\'s provider account to the signed-in user.');
  } else {
    ok('AUTH-1 AniList OAuth flow sends and verifies a CSRF state');
  }
}

// ── 17. Every table a migration creates must carry an RLS decision ────────────
{
  // Supabase grants `anon` and `authenticated` ALL on new public tables, so a
  // table with no RLS is an open table. "An RLS decision" here means one of:
  //   • the migration set executes `ALTER TABLE … ENABLE ROW LEVEL SECURITY`;
  //   • the table is later dropped;
  //   • the table lives in a schema whose client privileges are revoked, or is
  //     named in the backend-only list of the hardening migration.
  const dir = join(ROOT, 'supabase/migrations');
  const HARDENING = '20261026000007_rls_hardening_internal_tables.sql';
  const ident = String.raw`("?[\w]+"?\s*\.\s*"?[\w]+"?|"?[\w]+"?)`;
  const norm = (v) => v.replace(/\s+/g, '').replace(/"/g, '').toLowerCase();
  const created = new Map();
  const rls = new Set();
  const dropped = new Set();
  let migrations = [];
  try {
    migrations = readdirSync(dir).filter((f) => f.endsWith('.sql') && /^\d+_/.test(f)).sort();
  } catch {
    /* no migrations in this checkout */
  }
  for (const name of migrations) {
    const sql = readFileSync(join(dir, name), 'utf8').toLowerCase();
    for (const m of sql.matchAll(new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?${ident}`, 'g'))) {
      if (!created.has(norm(m[1]))) created.set(norm(m[1]), name);
    }
    for (const m of sql.matchAll(new RegExp(`alter\\s+table\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?${ident}\\s+enable\\s+row\\s+level\\s+security`, 'g'))) {
      rls.add(norm(m[1]));
    }
    for (const m of sql.matchAll(new RegExp(`drop\\s+table\\s+(?:if\\s+exists\\s+)?${ident}`, 'g'))) {
      dropped.add(norm(m[1]));
    }
  }

  // Backend-only tables named inside the hardening migration's DO block.
  const backendOnly = new Set();
  if (migrations.includes(HARDENING)) {
    const sql = readFileSync(join(dir, HARDENING), 'utf8').toLowerCase();
    const start = sql.indexOf('foreach target in array');
    const block = start < 0 ? '' : sql.slice(start, sql.indexOf('end loop', start));
    // Only the explicit string literals of the table array — NOT the
    // `format('ALTER TABLE public.%I …')` template, which would otherwise mark
    // every public table as handled.
    for (const m of block.matchAll(/'([a-z0-9_]+)'/g)) backendOnly.add(`public.${m[1]}`);
  }
  // Schemas whose client privileges are revoked wholesale.
  const revokedSchemas = new Set();
  for (const name of migrations) {
    const sql = readFileSync(join(dir, name), 'utf8').toLowerCase();
    for (const m of sql.matchAll(/revoke\s+all\s+on\s+schema\s+"?([a-z0-9_]+)"?\s+from\s+(?:public|anon)/g)) {
      revokedSchemas.add(m[1]);
    }
  }

  const unprotected = [];
  for (const [table, file] of created) {
    if (rls.has(table) || dropped.has(table)) continue;
    const [schema, name] = table.includes('.') ? table.split('.') : ['public', table];
    if (backendOnly.has(`${schema}.${name}`) || backendOnly.has(`${schema}.*`)) continue;
    if (revokedSchemas.has(schema)) continue;
    unprotected.push(`${table} (created in ${file})`);
  }

  if (migrations.length === 0) {
    ok('DB-2 no migrations in this checkout');
  } else if (unprotected.length) {
    fail(
      'DB-2',
      `tables created without an RLS decision: ${unprotected.join(', ')}`,
      'Enable RLS, drop the table, revoke the schema, or add it to the backend-only list in ' + HARDENING + '.'
    );
  } else {
    ok(`DB-2 every table created by ${migrations.length} migrations has an RLS decision`);
  }
}

// ── Report ────────────────────────────────────────────────────────────────────
if (failures.length === 0) {
  console.log(`✅ security baseline: ${checked.length} invariants hold`);
  for (const id of checked) console.log(`   • ${id}`);
  process.exit(0);
}

console.error(`❌ security baseline: ${failures.length} regression(s)\n`);
for (const f of failures) {
  console.error(`  [${f.id}] ${f.message}`);
  if (f.detail) console.error(`         ${f.detail}`);
}
process.exit(1);
