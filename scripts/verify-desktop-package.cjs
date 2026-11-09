'use strict';
const path = require('node:path');
const verifyTranslationPackage = require('./verify-translate-package.cjs');
const { verifyExtensionServerPackage } = require('./verify-extension-server-package.cjs');
const fs = require('node:fs');

module.exports = async function verifyDesktopPackage(context) {
  await verifyTranslationPackage(context);
  const resources = context.electronPlatformName === 'darwin'
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : path.join(context.appOutDir, 'resources');
  verifyExtensionServerPackage(resources);
  if (context.electronPlatformName === 'win32' && (context.arch === 1 || context.arch === 'x64')) {
    require('./verify-rtx-runtime-package.cjs').verifyRtxRuntimePackage(resources);
  }
  const { PROFILE_THEME_PACKAGE_PATHS } = await import('./profile-theme-asset-check.mjs');
  const archive = path.join(resources, 'app.asar');
  if (fs.existsSync(archive)) {
    const files = require('@electron/asar').listPackage(archive).map(file => file.replace(/\\/g, '/').replace(/^\//, ''));
    const leaked = files.filter(file => PROFILE_THEME_PACKAGE_PATHS.some(asset => file === 'dist/' + asset || file.startsWith('dist/' + asset + '/')));
    if (leaked.length) throw new Error('Profile theme assets must be hosted by the server, not packaged in app.asar');
  } else {
    const { assertNoPackagedProfileThemeAssets } = await import('./profile-theme-asset-check.mjs');
    assertNoPackagedProfileThemeAssets(path.join(resources, 'app', 'dist'));
  }
};
