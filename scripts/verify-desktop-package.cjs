'use strict';
const path = require('node:path');
const verifyTranslationPackage = require('./verify-translate-package.cjs');
const { verifyExtensionServerPackage } = require('./verify-extension-server-package.cjs');

module.exports = async function verifyDesktopPackage(context) {
  await verifyTranslationPackage(context);
  const resources = context.electronPlatformName === 'darwin'
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : path.join(context.appOutDir, 'resources');
  verifyExtensionServerPackage(resources);
};
