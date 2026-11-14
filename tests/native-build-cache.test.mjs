import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildFingerprint, isBuildCurrent, saveBuildStamp } from '../scripts/native-build-cache.mjs';

test('native cache invalidates source edits, changed settings and missing or damaged outputs', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tatakai-build-cache-'));
  try {
    const source = join(directory, 'src');
    mkdirSync(source);
    const input = join(source, 'main.rs');
    const binary = join(directory, 'helper.exe');
    const stamp = join(directory, 'cache.json');
    writeFileSync(input, 'first');
    writeFileSync(binary, 'working binary');
    const fingerprint = buildFingerprint([source], { target: 'x64' });
    assert.equal(isBuildCurrent(stamp, fingerprint), false);
    saveBuildStamp(stamp, fingerprint, [binary]);
    assert.equal(isBuildCurrent(stamp, fingerprint), true);
    assert.equal(isBuildCurrent(stamp, buildFingerprint([source], { target: 'arm64' })), false);

    const timestamps = statSync(input);
    writeFileSync(input, 'other');
    utimesSync(input, timestamps.atime, timestamps.mtime);
    assert.notEqual(buildFingerprint([source], { target: 'x64' }), fingerprint);
    writeFileSync(binary, 'damaged binary');
    assert.equal(isBuildCurrent(stamp, fingerprint), false);
    rmSync(binary);
    assert.equal(isBuildCurrent(stamp, fingerprint), false);
    writeFileSync(stamp, 'interrupted write');
    assert.equal(isBuildCurrent(stamp, fingerprint), false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
