'use strict';
const fs = require('node:fs');
const path = require('node:path');

const requiredFiles = [
  'tatakai-server/src/desktop.mjs',
  'tatakai-server/dist/interpreter.mjs',
  'tatakai-server/dist/ui/index.html',
];

function verifyExtensionServerPackage(resources) {
  const archive = path.join(resources, 'app.asar');
  const asar = fs.existsSync(archive) ? require('@electron/asar') : null;
  for (const file of requiredFiles) {
    try {
      const info = asar ? asar.statFile(archive, path.normalize(file), false) : fs.statSync(path.join(resources, 'app', file));
      if (asar ? info.files || info.link : !info.isFile()) throw new Error('Not a regular file');
    } catch {
      throw new Error(`Packaged extension server is missing ${file}. Run npm run server:build before packaging.`);
    }
  }
}

module.exports = { verifyExtensionServerPackage, requiredFiles };
