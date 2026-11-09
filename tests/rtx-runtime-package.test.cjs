'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { verifyRtxRuntimePackage, RTX_RUNTIME_FILES } = require('../scripts/verify-rtx-runtime-package.cjs');
test('a Windows release cannot omit the helper, NVIDIA runtime, or their notices', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tatakai-rtx-package-'));
  const directory = path.join(root, 'bin', 'rtx-video'); fs.mkdirSync(directory, { recursive: true });
  try {
    assert.throws(() => verifyRtxRuntimePackage(root), /tatakai-rtx-video.exe/);
    for (const file of RTX_RUNTIME_FILES) fs.writeFileSync(path.join(directory, file), /\.(exe|dll)$/.test(file) ? 'MZfixture' : 'License notice');
    assert.doesNotThrow(() => verifyRtxRuntimePackage(root));
    fs.writeFileSync(path.join(directory, 'nvngx_vsr.dll'), 'not a binary');
    assert.throws(() => verifyRtxRuntimePackage(root), /invalid Windows binary/);
  } finally { assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep)); fs.rmSync(root, { recursive: true, force: true }); }
});
