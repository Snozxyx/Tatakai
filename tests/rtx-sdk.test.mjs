import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import AdmZip from 'adm-zip';
import { installVerifiedRtxSdk } from '../scripts/prepare-rtx-sdk.mjs';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tatakai-rtx-sdk-'));
  const zip = new AdmZip();
  for (const name of ['include/nvsdk_ngx_helpers_vsr.h', 'lib/Windows/x64/nvsdk_ngx_s.lib', 'bin/Windows/x64/rel/nvngx_vsr.dll', 'NVIDIA_RTX_Video_SDK_License.pdf']) zip.addFile(name, Buffer.from('SDK fixture'));
  return { root, zip, archive: path.join(root, 'sdk.zip'), destination: path.join(root, 'sdk') };
}
function save(f) {
  const bytes = f.zip.toBuffer();
  fs.writeFileSync(f.archive, bytes);
  return createHash('sha256').update(bytes).digest('hex');
}
function cleanup(root) {
  const resolved = path.resolve(root);
  assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
  assert.ok(path.basename(resolved).startsWith('tatakai-rtx-sdk-'));
  fs.rmSync(resolved, { recursive: true, force: true });
}
test('SDK is extracted only after checksum verification', () => {
  const f = fixture();
  try {
    const hash = save(f);
    assert.throws(() => installVerifiedRtxSdk(f.archive, f.destination, '0'.repeat(64)), /checksum mismatch/);
    assert.equal(fs.existsSync(f.destination), false);
    assert.equal(installVerifiedRtxSdk(f.archive, f.destination, hash), f.destination);
    assert.ok(fs.existsSync(path.join(f.destination, 'bin/Windows/x64/rel/nvngx_vsr.dll')));
  } finally { cleanup(f.root); }
});
test('SDK paths cannot escape the extraction directory', () => {
  const f = fixture();
  try {
    f.zip.addFile('C:/outside-file', Buffer.from('invalid'));
    const hash = save(f);
    assert.throws(() => installVerifiedRtxSdk(f.archive, f.destination, hash), /archive path/);
    assert.equal(fs.existsSync(f.destination), false);
  } finally { cleanup(f.root); }
});
