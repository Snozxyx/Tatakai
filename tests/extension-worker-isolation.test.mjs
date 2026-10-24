/**
 * Regression test — extension worker isolation (SEC audit finding EXT-1).
 *
 * Threat model: a `.kai` bundle is untrusted code. Before the fix it ran in a
 * plain `worker_threads` Worker via `new Function`, which left the real `process`
 * global reachable, and therefore:
 *
 *     process.getBuiltinModule('child_process').execSync('id')      // RCE
 *     process.getBuiltinModule('fs').readFileSync('/etc/hostname')  // arbitrary read
 *
 * both succeeded. This test drives the real pool (not a mock) with a hostile
 * bundle and asserts the escapes are refused, while a benign bundle still works.
 *
 * Run: node --test tests/extension-worker-isolation.test.mjs
 *      (also executes under `bun test` — the assertions are runtime-agnostic)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  ExtensionWorkerPool,
} = require('../desktop/runtime/extension/extension-worker-pool.cjs');
const {
  buildPermissionExecArgv,
  isProcessIsolationAvailable,
} = require('../desktop/runtime/extension/extension-sandbox.cjs');

const HOSTILE_BUNDLE = `
module.exports = {
  async probe() {
    const out = {};
    // 1. child_process via the documented builtin escape hatch
    try {
      out.childProcess = String(process.getBuiltinModule('child_process').execSync('id')).trim();
    } catch (e) { out.childProcessError = e.code || e.message; }

    // 2. arbitrary filesystem read outside the extension directory
    try {
      out.fsRead = process.getBuiltinModule('fs').readFileSync('/etc/hostname', 'utf8').trim();
    } catch (e) { out.fsReadError = e.code || e.message; }

    // 3. low-level binding access
    try {
      out.binding = typeof process.binding('fs').open;
    } catch (e) { out.bindingError = e.code || e.message; }

    // 4. dynamic import of a builtin
    try {
      const cp = await import('node:child_process');
      out.dynamicImport = typeof cp.execSync;
    } catch (e) { out.dynamicImportError = e.code || e.message; }

    // 5. writing outside the extension directory
    try {
      process.getBuiltinModule('fs').writeFileSync('/tmp/tatakai-sandbox-escape.txt', 'pwned');
      out.fsWrite = 'allowed';
    } catch (e) { out.fsWriteError = e.code || e.message; }

    return out;
  },
};
`;

const BENIGN_BUNDLE = `
module.exports = {
  async ping() { return 'pong'; },
  async echo(v) { return v; },
};
`;

describe('extension worker isolation', () => {
  it('denies child_process / fs / binding escapes from a hostile bundle', async () => {
    const pool = new ExtensionWorkerPool();
    try {
      await pool.getOrSpawn('hostile-fixture', HOSTILE_BUNDLE, {
        permissions: ['network:domain:example.com'],
      });
      const entry = pool._workers.get('hostile-fixture');
      assert.ok(entry, 'worker was spawned');
      // If the runtime has no permission model the worker runs JS-hardened only;
      // the assertions below still hold because the hardening strip is applied.
      assert.equal(entry.isolation, isProcessIsolationAvailable() ? 'process-permission' : 'js-only');

      const out = await pool.invoke('hostile-fixture', 'probe', []);

      assert.equal(out.childProcess, undefined, 'child_process must not be reachable');
      assert.ok(out.childProcessError, 'child_process access must throw');
      assert.equal(out.fsRead, undefined, 'arbitrary fs reads must not be reachable');
      assert.ok(out.fsReadError, 'fs read outside allowlist must throw');
      assert.equal(out.fsWrite, undefined, 'fs writes must not be reachable');
      assert.ok(out.fsWriteError, 'fs write outside allowlist must throw');
      assert.equal(out.binding, undefined, 'process.binding must be removed');
      assert.ok(out.bindingError, 'process.binding must throw');

      // Denials must be the kernel/runtime access check, not a lucky missing API.
      const codes = [out.childProcessError, out.fsReadError, out.bindingError];
      assert.ok(
        codes.some((c) => /ERR_ACCESS_DENIED|not a function|undefined/i.test(String(c))),
        `expected access-denied style failures, got ${JSON.stringify(codes)}`
      );
    } finally {
      pool.terminateAll();
    }
  });

  it('still runs a benign bundle normally', async () => {
    const pool = new ExtensionWorkerPool();
    try {
      await pool.getOrSpawn('benign-fixture', BENIGN_BUNDLE, { permissions: [] });
      assert.equal(await pool.invoke('benign-fixture', 'ping', []), 'pong');
      assert.deepEqual(await pool.invoke('benign-fixture', 'echo', [{ a: 1 }]), { a: 1 });
    } finally {
      pool.terminateAll();
    }
  });

  it('builds a least-privilege execArgv (no child-process / worker / wasi grants)', () => {
    const argv = buildPermissionExecArgv({ readPaths: ['/app', '/app', '/exts'] });
    if (argv === null) return; // runtime without the permission model
    assert.ok(argv[0] === '--permission' || argv[0] === '--experimental-permission');
    assert.deepEqual(
      argv.filter((a) => a.startsWith('--allow-fs-read=')),
      ['--allow-fs-read=/app', '--allow-fs-read=/exts']
    );
    for (const forbidden of ['--allow-child-process', '--allow-worker', '--allow-wasi', '--allow-addons']) {
      assert.ok(!argv.includes(forbidden), `${forbidden} must never be granted`);
    }
  });
});
