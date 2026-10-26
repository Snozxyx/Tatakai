'use strict';
const { test, expect } = require('bun:test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const asar = require('@electron/asar');
const { resolveExtensionServerEntry } = require('../desktop/runtime/home-server/index.cjs');
const { verifyExtensionServerPackage, requiredFiles } = require('../scripts/verify-extension-server-package.cjs');

test('server entry stays inside the packaged application archive', () => {
  const appRoot = path.resolve('fixture', 'resources', 'app.asar');
  expect(resolveExtensionServerEntry({ getAppPath: () => appRoot }))
    .toBe(path.join(appRoot, 'tatakai-server', 'src', 'desktop.mjs'));
});

test('development fallback resolves the repository server entry', () => {
  const file = resolveExtensionServerEntry({});
  expect(file).toBe(path.resolve(__dirname, '../tatakai-server/src/desktop.mjs'));
  expect(fs.existsSync(file)).toBe(true);
});

test('package validation reads ASAR contents and rejects missing server files', async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tatakai-server-package-'));
  try {
    const source = path.join(temporary, 'source');
    for (const file of requiredFiles) {
      const target = path.join(source, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, 'fixture');
    }
    const valid = path.join(temporary, 'valid');
    fs.mkdirSync(valid);
    await asar.createPackage(source, path.join(valid, 'app.asar'));
    expect(() => verifyExtensionServerPackage(valid)).not.toThrow();
    fs.unlinkSync(path.join(source, requiredFiles[0]));
    const invalid = path.join(temporary, 'invalid');
    fs.mkdirSync(invalid);
    await asar.createPackage(source, path.join(invalid, 'app.asar'));
    expect(() => verifyExtensionServerPackage(invalid)).toThrow('tatakai-server/src/desktop.mjs');
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});
