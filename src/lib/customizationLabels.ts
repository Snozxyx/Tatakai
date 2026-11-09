import uiI18n from '@/lib/uiI18n';
/** Stable keys for the editor vocabulary; user-authored titles retain their text as the fallback. */
export function customizationLabel(value: string): string {
  const key = value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return String(uiI18n.t(`customization.sections.${key}`, { defaultValue: value }));
}
export function customizationMessage(key: string, defaultValue: string, values: Record<string, string> = {}): string {
  return String(uiI18n.t(`customization.sections.${key}`, { defaultValue, ...values }));
}
