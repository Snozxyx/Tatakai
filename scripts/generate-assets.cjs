'use strict';
import('./generate-branding-assets.mjs').then(({ generateBrandingAssets }) => generateBrandingAssets()).catch(error => { console.error(error); process.exitCode = 1; });
