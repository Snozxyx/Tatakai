import { useEffect, useMemo, useState } from 'react';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { getCountryTorrentPolicy, type CountryTorrentPolicy } from './torrent-legality';

type GeoState = {
  countryCode: string | null;
  countryName: string | null;
  ip: string | null;
  loading: boolean;
  error?: string;
};

export function blurIp(ip: string | null): string {
  if (!ip) return 'unknown';
  const parts = ip.split('.');
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.***.***`;
  return `${ip.slice(0, 3)}***`;
}

type GeoResult = { countryCode: string | null; countryName: string | null; ip: string | null };

/**
 * Geo-IP providers, tried in order until one returns a usable country code.
 * A single provider (ipapi.co) proved unreliable in the packaged desktop app —
 * requests from the `file://` origin can be rate-limited or refused — leaving the
 * setup wizard's region blank. The fallback chain makes the lookup robust to any
 * one endpoint failing; all three send permissive CORS and need no API key.
 */
const GEO_PROVIDERS: Array<{ url: string; parse: (j: any) => GeoResult }> = [
  {
    // This currently answers mobile clients reliably; ipapi.co commonly rate
    // limits packaged apps, so keep it as the fallback rather than making setup
    // wait for its failure first.
    url: 'https://ipwho.is/',
    parse: (j) =>
      j && j.success !== false
        ? {
            countryCode: String(j?.country_code || '').toUpperCase() || null,
            countryName: String(j?.country || '').trim() || null,
            ip: String(j?.ip || '').trim() || null,
          }
        : { countryCode: null, countryName: null, ip: null },
  },
  {
    url: 'https://ipapi.co/json/',
    parse: (j) => ({
      countryCode: String(j?.country_code || '').toUpperCase() || null,
      countryName: String(j?.country_name || '').trim() || null,
      ip: String(j?.ip || '').trim() || null,
    }),
  },
  {
    url: 'https://get.geojs.io/v1/ip/geo.json',
    parse: (j) => ({
      countryCode: String(j?.country_code || '').toUpperCase() || null,
      countryName: String(j?.country || '').trim() || null,
      ip: String(j?.ip || '').trim() || null,
    }),
  },
];

async function lookupGeo(
  isCancelled: () => boolean,
  setActiveController: (c: AbortController | null) => void,
): Promise<GeoResult | null> {
  for (const provider of GEO_PROVIDERS) {
    if (isCancelled()) return null;
    const controller = new AbortController();
    setActiveController(controller);
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      let payload: unknown;
      if (Capacitor.isNativePlatform()) {
        const response = await CapacitorHttp.get({
          url: provider.url,
          headers: { Accept: 'application/json' },
          connectTimeout: 4000,
          readTimeout: 4000,
          responseType: 'json',
        });
        if (response.status < 200 || response.status >= 300) continue;
        payload = response.data;
      } else {
        const res = await fetch(provider.url, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) continue;
        payload = await res.json();
      }
      const parsed = provider.parse(payload);
      if (parsed.countryCode) return parsed;
    } catch {
      /* timed out or refused — fall through to the next provider */
    } finally {
      clearTimeout(timer);
      setActiveController(null);
    }
  }
  return null;
}

export function useCountryPolicy() {
  const [geo, setGeo] = useState<GeoState>({
    countryCode: null,
    countryName: null,
    ip: null,
    loading: true,
  });
  const [revealIp, setRevealIp] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let activeController: AbortController | null = null;

    (async () => {
      const result = await lookupGeo(
        () => cancelled,
        (c) => {
          activeController = c;
        },
      );
      if (cancelled) return;
      if (result?.countryCode) {
        localStorage.setItem('tatakai_country_iso2', result.countryCode);
        setGeo({ ...result, loading: false });
      } else {
        const stored = localStorage.getItem('tatakai_country_iso2');
        setGeo({
          countryCode: stored?.toUpperCase() || null,
          countryName: null,
          ip: null,
          loading: false,
          error: 'geolookup_failed',
        });
      }
    })();

    return () => {
      cancelled = true;
      activeController?.abort();
    };
  }, []);

  const policy: CountryTorrentPolicy | null = useMemo(
    () => getCountryTorrentPolicy(geo.countryCode),
    [geo.countryCode],
  );

  const badge = useMemo(() => {
    if (!policy) return { tone: 'bg-zinc-500/20 text-zinc-300', label: 'Unknown' };
    if (policy.policy === 'legal' || policy.policy === 'decriminalized') {
      return { tone: 'bg-emerald-500/20 text-emerald-300', label: 'Permitted' };
    }
    return { tone: 'bg-amber-500/20 text-amber-300', label: 'Restricted / unclear' };
  }, [policy]);

  return {
    ...geo,
    policy,
    badge,
    revealIp,
    setRevealIp,
    displayedIp: revealIp ? geo.ip : blurIp(geo.ip),
    acknowledgedCompliance: localStorage.getItem('tatakai_country_ack') === 'true',
  };
}

