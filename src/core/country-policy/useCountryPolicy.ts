import { useEffect, useMemo, useState } from 'react';
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    fetch('https://ipapi.co/json/', { signal: controller.signal })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const cc = String(json?.country_code || '').toUpperCase() || null;
        const cn = String(json?.country_name || '').trim() || null;
        const ip = String(json?.ip || '').trim() || null;
        if (cc) localStorage.setItem('tatakai_country_iso2', cc);
        setGeo({
          countryCode: cc,
          countryName: cn,
          ip,
          loading: false,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        const stored = localStorage.getItem('tatakai_country_iso2');
        setGeo({
          countryCode: stored?.toUpperCase() || null,
          countryName: null,
          ip: null,
          loading: false,
          error: err?.message || 'geolookup_failed',
        });
      })
      .finally(() => clearTimeout(timer));

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
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

