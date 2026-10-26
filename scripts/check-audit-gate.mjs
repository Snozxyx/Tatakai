#!/usr/bin/env node
/**
 * Production-dependency audit gate.
 *
 * `npm audit --omit=dev --audit-level=high` is all-or-nothing: one advisory in an
 * unmaintained transitive package blocks every pull request until someone ships
 * a major upgrade, which in practice means the gate gets disabled. This wrapper
 * keeps the gate meaningful without hiding anything:
 *
 *   • a high/critical advisory that is NOT in scripts/security-audit-allowlist.json
 *     fails the build — new risk can never slip in silently;
 *   • a listed package that picks up an advisory id it was not listed for fails;
 *   • a listed entry past its `expires` date fails, so "accepted for now" has to
 *     be re-confirmed rather than becoming permanent;
 *   • the full list of accepted advisories is always printed, so the decision is
 *     visible in every CI log.
 *
 * Usage:
 *     node scripts/check-audit-gate.mjs [--json]
 *
 * Exit code 0 = no unaccepted high/critical advisory. Non-zero = gate failure.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWLIST = join(ROOT, 'scripts/security-audit-allowlist.json');

function runAudit() {
  try {
    const npmCli = process.env.npm_execpath || join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
    const command = process.platform === 'win32' ? process.execPath : 'npm';
    const args = process.platform === 'win32' ? [npmCli, 'audit', '--omit=dev', '--json'] : ['audit', '--omit=dev', '--json'];
    const out = execFileSync(command, args, {
      windowsHide: true,
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    });
    return JSON.parse(out);
  } catch (err) {
    // npm exits non-zero when it finds anything at all; the JSON is still on stdout.
    if (err.stdout) {
      try {
        return JSON.parse(err.stdout);
      } catch {
        throw new Error('npm audit did not return parsable JSON');
      }
    }
    throw new Error(`npm audit failed to run: ${err.message}`);
  }
}

/** Advisories reported for one package: {ids, titles}. */
function advisoriesFor(entry) {
  const ids = [];
  const titles = [];
  for (const via of entry.via ?? []) {
    if (typeof via === 'object' && via) {
      const id = via.url ? String(via.url).split('/').pop() : String(via.source ?? '');
      if (id) ids.push(id);
      if (via.title) titles.push(via.title);
    }
  }
  return { ids, titles };
}

const audit = runAudit();
const allowlist = JSON.parse(readFileSync(ALLOWLIST, 'utf8'));
const blockSeverities = new Set(allowlist.policy?.blockSeverities ?? ['high', 'critical']);
const entries = new Map((allowlist.entries ?? []).map((e) => [e.package, e]));

const today = new Date().toISOString().slice(0, 10);
const failures = [];
const accepted = [];
const counts = audit.metadata?.vulnerabilities ?? {};

for (const [name, vuln] of Object.entries(audit.vulnerabilities ?? {})) {
  if (!blockSeverities.has(vuln.severity)) continue;
  const entry = entries.get(name);
  const { ids, titles } = advisoriesFor(vuln);

  if (!entry) {
    failures.push(
      `${name} (${vuln.severity}): ${titles.join('; ') || `flagged via ${(vuln.via ?? []).join(', ')}`}` +
        ` — not in scripts/security-audit-allowlist.json`
    );
    continue;
  }
  if (entry.expires && entry.expires < today) {
    failures.push(`${name}: allowlist entry expired on ${entry.expires} — re-review the risk or upgrade`);
    continue;
  }
  const unexpected = ids.filter((id) => !(entry.advisories ?? []).includes(id));
  if (unexpected.length) {
    failures.push(`${name}: new advisory not covered by the allowlist entry (${unexpected.join(', ')})`);
    continue;
  }
  accepted.push({ name, severity: vuln.severity, ids, reason: entry.reason, expires: entry.expires });
}

const stale = [...entries.keys()].filter(
  (name) => !Object.keys(audit.vulnerabilities ?? {}).some((n) => n === name)
);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ counts, accepted, failures, stale }, null, 2));
} else {
  console.log(
    `audit (production deps): ${counts.critical ?? 0} critical, ${counts.high ?? 0} high, ` +
      `${counts.moderate ?? 0} moderate, ${counts.low ?? 0} low`
  );
  for (const item of accepted) {
    console.log(`  accepted  ${item.name} [${item.ids.join(', ') || 'transitive'}] — until ${item.expires}`);
    console.log(`            ${item.reason}`);
  }
  for (const name of stale) {
    console.log(`  note      allowlist entry for ${name} is no longer needed — remove it`);
  }
}

if (failures.length === 0) {
  console.log(`✅ audit gate: no unaccepted high/critical advisory (${accepted.length} tracked entry/entries printed above)`);
  process.exit(0);
}

console.error(`\n❌ audit gate: ${failures.length} unaccepted high/critical advisory group(s)\n`);
for (const failure of failures) console.error(`   • ${failure}`);
console.error(
  '\nFix by upgrading, or add a reviewed entry to scripts/security-audit-allowlist.json ' +
    '(reason + expiry) and record it in docs/security/SECURITY_AUDIT.md § F.'
);
process.exit(1);
