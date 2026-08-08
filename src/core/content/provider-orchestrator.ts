const PROVIDER_SOURCES_EXPIRED_KEY = "tatakai.provider.sources.expired.reason";

export function markProviderSourcesExpired(reason = "unknown"): void {
  try {
    localStorage.setItem(PROVIDER_SOURCES_EXPIRED_KEY, String(reason));
  } catch {
    // Ignore storage failures in restricted environments.
  }
}

export function readProviderSourcesExpiredReason(): string | null {
  try {
    const value = localStorage.getItem(PROVIDER_SOURCES_EXPIRED_KEY);
    return value || null;
  } catch {
    return null;
  }
}

export function clearProviderSourcesExpiredReason(): void {
  try {
    localStorage.removeItem(PROVIDER_SOURCES_EXPIRED_KEY);
  } catch {
    // Ignore storage failures.
  }
}
