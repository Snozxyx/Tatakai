/**
 * defaultExtensions.ts
 *
 * Reserved slot for any bundled first-party extensions.
 *
 * Tatakai ships NO first-party scraper/streaming extensions and does not
 * endorse, badge, sign, or one-click-install any. Users discover and install
 * extensions themselves from the Extension Hub (backend catalogue) or by
 * sideloading a bundle they obtained on their own. These exports are kept
 * intentionally empty so nothing here presents a project-curated "official"
 * extension.
 */

import type { ExtensionManifest } from '@/pages/base/ExtensionHubPage';

/** No bundled first-party extensions. */
export const OFFICIAL_EXTENSIONS: ExtensionManifest[] = [];

/** No first-party install URLs. */
export const OFFICIAL_EXTENSION_URLS: Record<string, string> = {};
