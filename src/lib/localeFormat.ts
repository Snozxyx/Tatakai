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

export const formatDistanceToNow: typeof distanceToNow = (date, options) =>
  distanceToNow(date, { locale: currentLocale(), ...options });
