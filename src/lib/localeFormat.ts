import {
  format as formatDate,
  formatDistanceToNow as distanceToNow,
} from 'date-fns';
import { enUS, es, ja } from 'date-fns/locale';
import i18n from './i18n';

function currentLocale() {
  const language = (i18n.resolvedLanguage || i18n.language || 'en').split(
    '-'
  )[0];
  return language === 'es' ? es : language === 'ja' ? ja : enUS;
}

export const format: typeof formatDate = (date, pattern, options) =>
  formatDate(date, pattern, { locale: currentLocale(), ...options });

export const formatDistanceToNow: typeof distanceToNow = (date, options) => {
  const out = distanceToNow(date, { locale: currentLocale(), ...options });
  // date-fns `es` renders "hace alrededor de X horas" for some ranges — the
  // literal "alrededor de" (about) bloats compact UI timestamps, so shorten
  // to "hace X horas" to match the app's concise style.
  if ((i18n.resolvedLanguage || i18n.language || 'en').startsWith('es')) {
    return out.replace('alrededor de ', '').replace('alrededor de', '').trim();
  }
  return out;
};
