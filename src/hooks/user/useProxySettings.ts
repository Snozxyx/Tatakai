import { useState, useEffect, useCallback } from 'react';

export type ProxyType = 'app' | 'env';

export interface CustomProxyEntry {
  id: string;
  name: string;
  type: ProxyType;
  url: string;
  password?: string;
  enabled: boolean;
  isDefault?: boolean;
  createdAt: number;
}

const STORAGE_KEY = 'tatakai_custom_proxies_v2';

export const DEFAULT_APP_PROXY_URL = 'http://127.0.0.1:8099';
export const DEFAULT_ENV_PROXY_URL =
  String(import.meta.env.VITE_STREAM_PROXY_URL || import.meta.env.VITE_PROXY_NODE_URL || 'https://moko.tatakai.me/api/v1/streamingProxy').trim();
export const DEFAULT_ENV_PROXY_PASSWORD =
  String(import.meta.env.VITE_STREAM_PROXY_PASSWORD || import.meta.env.VITE_PROXY_PASSWORD || '').trim();

export function getDefaultProxies(): CustomProxyEntry[] {
  return [
    {
      id: 'default-app-proxy',
      name: 'Local In-App Proxy (Runtime)',
      type: 'app',
      url: DEFAULT_APP_PROXY_URL,
      enabled: true,
      isDefault: true,
      createdAt: 1,
    },
    {
      id: 'default-env-proxy',
      name: 'Cloud / Environment Proxy',
      type: 'env',
      url: DEFAULT_ENV_PROXY_URL,
      password: DEFAULT_ENV_PROXY_PASSWORD,
      enabled: true,
      isDefault: true,
      createdAt: 2,
    },
  ];
}

export function loadStoredProxies(): CustomProxyEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultProxies();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch {
    // fallback to defaults on parse failure
  }
  return getDefaultProxies();
}

export function saveStoredProxies(proxies: CustomProxyEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(proxies));
    window.dispatchEvent(new Event('tatakai-proxy-settings-changed'));
  } catch (err) {
    console.error('Failed to save proxy settings to localStorage:', err);
  }
}

/**
 * Returns the primary stream proxy configured by the user, or falls back to defaults.
 */
export function getActiveStreamingProxySnapshot(): { url: string; password?: string } {
  const list = loadStoredProxies();
  const activeEnv = list.find((p) => p.type === 'env' && p.enabled && p.isDefault) ||
    list.find((p) => p.type === 'env' && p.enabled) ||
    list.find((p) => p.enabled);

  if (activeEnv && activeEnv.url) {
    return { url: activeEnv.url, password: activeEnv.password };
  }

  return { url: DEFAULT_ENV_PROXY_URL, password: DEFAULT_ENV_PROXY_PASSWORD };
}

/**
 * Returns all active proxy URLs (for fallback resolution chains).
 */
export function getAllActiveProxyUrls(): string[] {
  const list = loadStoredProxies();
  const urls = list.filter((p) => p.enabled && Boolean(p.url)).map((p) => p.url.trim().replace(/\/$/, ''));
  if (urls.length === 0) {
    return [DEFAULT_ENV_PROXY_URL];
  }
  return Array.from(new Set(urls));
}

export function useProxySettings() {
  const [proxies, setProxies] = useState<CustomProxyEntry[]>(() => loadStoredProxies());

  useEffect(() => {
    const handleProxyChange = () => {
      setProxies(loadStoredProxies());
    };
    window.addEventListener('tatakai-proxy-settings-changed', handleProxyChange);
    return () => window.removeEventListener('tatakai-proxy-settings-changed', handleProxyChange);
  }, []);

  const addProxy = useCallback((entry: Omit<CustomProxyEntry, 'id' | 'createdAt'>) => {
    const newEntry: CustomProxyEntry = {
      ...entry,
      id: `proxy-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      createdAt: Date.now(),
      url: entry.url.trim(),
    };
    setProxies((current) => {
      const updated = [...current, newEntry];
      saveStoredProxies(updated);
      return updated;
    });
    return newEntry;
  }, []);

  const updateProxy = useCallback((id: string, patch: Partial<Omit<CustomProxyEntry, 'id' | 'createdAt'>>) => {
    setProxies((current) => {
      const updated = current.map((p) => (p.id === id ? { ...p, ...patch } : p));
      saveStoredProxies(updated);
      return updated;
    });
  }, []);

  const removeProxy = useCallback((id: string) => {
    setProxies((current) => {
      const updated = current.filter((p) => p.id !== id);
      saveStoredProxies(updated);
      return updated;
    });
  }, []);

  const toggleProxy = useCallback((id: string, enabled: boolean) => {
    setProxies((current) => {
      const updated = current.map((p) => (p.id === id ? { ...p, enabled } : p));
      saveStoredProxies(updated);
      return updated;
    });
  }, []);

  const setDefaultProxy = useCallback((id: string) => {
    setProxies((current) => {
      const target = current.find((p) => p.id === id);
      if (!target) return current;
      const updated = current.map((p) => {
        if (p.type === target.type) {
          return { ...p, isDefault: p.id === id };
        }
        return p;
      });
      saveStoredProxies(updated);
      return updated;
    });
  }, []);

  const resetToDefaults = useCallback(() => {
    const defaults = getDefaultProxies();
    setProxies(defaults);
    saveStoredProxies(defaults);
  }, []);

  return {
    proxies,
    addProxy,
    updateProxy,
    removeProxy,
    toggleProxy,
    setDefaultProxy,
    resetToDefaults,
  };
}
