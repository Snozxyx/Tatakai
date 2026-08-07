/**
 * Multilingual (dub) providers for Toko.
 *
 * Each provider extends BaseI18nProvider, tags its sources with a BCP 47
 * `audioLanguage`, and advertises languages via `getLanguages()`. Register
 * new language sites here so they flow into the main stream-provider list
 * automatically.
 */
import type { StreamProvider } from '../../types.js';
import animeblkom from './animeblkom.js';

// Add new dub providers here as they are implemented:
//   - fr (French):  Anime Sama / Fluneo / Voiranime
//   - de (German):  AniWorld (already in stream/aniworld.ts)
//   - pl (Polish):  Anime-Odcinki / Okami-Subs
//   - zh (Chinese): Agregat / Ymadub
export const I18N_STREAM_PROVIDERS: StreamProvider[] = [
  animeblkom as unknown as StreamProvider,
];

export { categorizeByLanguage } from './base-i18n-provider.js';
export {
  categorizeSources,
  categorizeByDubLanguage,
  selectByPreferredLanguages,
  sourceLanguageCode,
  type CategorizedSources,
} from './language-mapper.js';
export { DUB_LANGUAGES, resolveDubLanguage, toAudioLanguageCode } from './dub-languages.js';
export { AnimeblkomProvider } from './animeblkom.js';
