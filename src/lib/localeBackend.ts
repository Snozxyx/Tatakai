import type { BackendModule } from 'i18next';

// Dynamic imports remain bundled local assets in the Android/iOS/desktop apps.
// English is already in the entry bundle as the synchronous fallback.
const loaders = {
  es: () => import('@/locales/es.json'),
  ja: () => import('@/locales/ja.json'),
};

export const localeBackend: BackendModule = {
  type: 'backend',
  init() {},
  read(language, namespace, callback) {
    const load = loaders[language as keyof typeof loaders];
    if (namespace !== 'translation' || !load) {
      callback(null, {});
      return;
    }
    void load().then(module => callback(null, module.default), error => callback(error, false));
  },
};
