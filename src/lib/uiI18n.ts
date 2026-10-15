import i18n from './i18n';

/** Plain string boundary for extracted interface copy and interpolation values. */
const uiI18n = {
  t(key: string, values?: Record<string, unknown>): string {
    return i18n.t(key, values) as string;
  },
  get language(): string {
    return i18n.resolvedLanguage || i18n.language || 'en';
  },
};

export default uiI18n;
