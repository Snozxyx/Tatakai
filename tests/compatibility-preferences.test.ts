import { describe, expect, it } from 'bun:test';
import { preferences, preferenceChange } from '../desktop/runtime/compatibility/preferences.cjs';
describe('original source preference boundary', () => {
  const rows = [
    { __typename: 'SwitchPreference', key: 'enabled', booleanValue: false, booleanDefault: true, enabled: true, visible: true },
    { __typename: 'ListPreference', key: 'server', textValue: '', entries: ['Automatic', 'Mirror'], entryValues: ['', 'mirror'], enabled: true, visible: true },
    { __typename: 'MultiSelectListPreference', key: 'languages', multiValue: ['en'], entries: ['English', 'Japanese'], entryValues: ['en', 'ja'], enabled: true, visible: true },
    { __typename: 'EditTextPreference', key: 'api_token', textValue: 'local-secret', enabled: true, visible: true },
  ];
  it('keeps false and empty values and preserves option order', () => {
    const normalized = preferences(rows);
    expect(normalized[0].value).toBe(false);
    expect(normalized[1].value).toBe('');
    expect(normalized[1].options[0]).toEqual({ value: '', label: 'Automatic' });
    expect(normalized[3].secret).toBe(true);
    expect(preferenceChange(rows, 0, true)).toEqual({ position: 0, switchState: true });
    expect(preferenceChange(rows, 1, '')).toEqual({ position: 1, listState: '' });
    expect(preferenceChange(rows, 2, ['ja', 'ja'])).toEqual({ position: 2, multiSelectState: ['ja'] });
  });
  it('rejects foreign positions, undeclared options and unavailable controls', () => {
    expect(() => preferenceChange(rows, -1, true)).toThrow();
    expect(() => preferenceChange(rows, 1, 'injected')).toThrow();
    expect(() => preferenceChange(rows, 0, 'true')).toThrow();
    expect(() => preferenceChange([{ ...rows[0], visible: false }], 0, true)).toThrow();
    expect(() => preferenceChange(rows, 2, ['de'])).toThrow();
  });
});
