'use strict';
const path = require('node:path');
const { execFileSync } = require('node:child_process');
module.exports = async function prepareCompatibilityPackage() {
  execFileSync(process.execPath, [path.join(__dirname, 'prepare-compatibility-assets.mjs'), 'desktop'], { stdio: 'inherit' });
};
