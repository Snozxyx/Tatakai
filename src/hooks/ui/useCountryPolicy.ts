export { useCountryPolicy, blurIp } from '@/core/country-policy/useCountryPolicy';

export function readStoredCountryCode(): string | null {
  try {
    const raw = localStorage.getItem('tatakai_country_iso2');
    if (!raw) return null;
    const code = raw.trim().toUpperCase();
    return /^[A-Z]{2}$/.test(code) ? code : null;
  } catch {
    return null;
  }
}
