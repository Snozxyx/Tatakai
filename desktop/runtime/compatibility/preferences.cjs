'use strict';
const common = 'key title summary enabled visible';
const PREFERENCE_FIELDS = `__typename
 ... on CheckBoxPreference { ${common} booleanValue: currentValue booleanDefault: default }
 ... on SwitchPreference { ${common} booleanValue: currentValue booleanDefault: default }
 ... on EditTextPreference { ${common} textValue: currentValue textDefault: default }
 ... on ListPreference { ${common} textValue: currentValue textDefault: default entries entryValues }
 ... on MultiSelectListPreference { ${common} multiValue: currentValue multiDefault: default entries entryValues }`;
const kinds = { CheckBoxPreference: 'boolean', SwitchPreference: 'boolean', EditTextPreference: 'text', ListPreference: 'select', MultiSelectListPreference: 'multiselect' };
function preferences(rows) {
  return rows.map((row, position) => ({ position, key: row.key, title: row.title || row.key || 'Source setting', summary: row.summary,
    enabled: row.enabled !== false, visible: row.visible !== false, kind: kinds[row.__typename] || 'unsupported',
    value: row.booleanValue ?? row.textValue ?? row.multiValue ?? row.booleanDefault ?? row.textDefault ?? row.multiDefault ?? null,
    options: (row.entryValues || []).map((value, i) => ({ value, label: row.entries?.[i] || value })),
    secret: /password|token|secret|api.?key/i.test(`${row.key} ${row.title}`),
  }));
}
function preferenceChange(rows, position, value) {
  if (!Number.isInteger(position) || position < 0 || position >= rows.length || position > 500) throw Error('Invalid preference position');
  const raw = rows[position], pref = preferences(rows)[position];
  if (!pref.enabled || !pref.visible) throw Error('Source setting is unavailable');
  const change = { position };
  if (pref.kind === 'boolean' && typeof value === 'boolean') change[raw.__typename === 'SwitchPreference' ? 'switchState' : 'checkBoxState'] = value;
  else if (pref.kind === 'text' && typeof value === 'string' && value.length <= 10000) change.editTextState = value;
  else if (pref.kind === 'select' && typeof value === 'string' && pref.options.some(o => o.value === value)) change.listState = value;
  else if (pref.kind === 'multiselect' && Array.isArray(value) && value.length <= pref.options.length && value.every(v => typeof v === 'string' && pref.options.some(o => o.value === v))) change.multiSelectState = [...new Set(value)];
  else throw Error('Invalid source setting value');
  return change;
}
module.exports = { PREFERENCE_FIELDS, preferences, preferenceChange };
