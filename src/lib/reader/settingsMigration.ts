import { DEFAULT_SETTINGS, normalizeSettings, type ReaderSettings } from './settings';

export const READER_DEFAULTS_VERSION = 1;
const { tapBehavior, hideCursorWhileReading, cursorWakeDistance, autoScrollMode, autoScrollInterval, ...legacy } = DEFAULT_SETTINGS;
const legacyDefaults = { ...legacy, preloading: 'partial' };

/** A revision on any setting makes the old payload ambiguous: preserve it. */
export function migrateReaderSettings(raw: Partial<ReaderSettings> & { __updatedAt?: number; __defaultsVersion?: number }, revision = 0) {
  const untouched = !revision && !Number(raw.__updatedAt) && !Number(raw.__defaultsVersion)
    && Object.entries(legacyDefaults).every(([key, value]) => raw[key] === value)
    && [tapBehavior, hideCursorWhileReading, cursorWakeDistance, autoScrollMode, autoScrollInterval].every((value, index) => {
      const key = ['tapBehavior', 'hideCursorWhileReading', 'cursorWakeDistance', 'autoScrollMode', 'autoScrollInterval'][index];
      return raw[key] === undefined || raw[key] === value;
    });
  return normalizeSettings(untouched ? { ...raw, preloading: 'full' } : raw);
}
