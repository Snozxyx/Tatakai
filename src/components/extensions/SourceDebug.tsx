import { useDeveloperMode } from '@/hooks/ui/useDeveloperMode';
import { useEffect, useState } from 'react';

import { sourceReports } from '@/core/extensions/remote/diagnostics';


export function SourceDebug({ kind, sources = [], diagnostics = [], unit }: { kind: 'anime' | 'manga' | 'custom'; sources?: Array<{ provider?: string; providerKey?: string; providerName?: string }>; diagnostics?: Array<{ provider: string; status: string; resultCount?: number; durationMs?: number; error?: string }>; unit?: string }) {

  const { enabled } = useDeveloperMode();
  const [reports, setReports] = useState(sourceReports);

  useEffect(() => {
    if (!enabled) return;

    const refresh = () => setReports(sourceReports());

    refresh();
    window.addEventListener('tatakai:source-report', refresh);

    return () => window.removeEventListener('tatakai:source-report', refresh);

  }, [enabled]);

  if (!enabled) return null;

  const counts = new Map<string, { name: string; count: number }>();

  for (const source of sources) {

    const id = source.providerKey || source.provider || 'unknown';

    const entry = counts.get(id) || { name: source.providerName || id, count: 0 };

    entry.count++; counts.set(id, entry);

  }

  return <details className="rounded-xl border border-white/10 p-3 text-xs">

    <summary className="cursor-pointer font-medium">Source diagnostics · {sources.length} {unit || (kind === 'manga' ? 'chapter sources' : 'video sources')}</summary>

    <div className="mt-3 space-y-2" aria-live="polite">

      {[...counts].map(([id, entry]) => <div key={id}>{entry.name}: {entry.count} available</div>)}

      {diagnostics.filter(d => !/^(seanime|stremio)-/.test(d.provider)).map(d => <div key={d.provider}>

        <strong>{counts.get(d.provider)?.name || d.provider}</strong> · sources: {d.resultCount ?? counts.get(d.provider)?.count ?? 0} · {d.status} · {d.durationMs ?? 0} ms

        {d.error && <div className="text-destructive">{d.error.replace(/https?:\/\/[^\s)]+/gi, '[URL]').slice(0, 300)}</div>}

      </div>)}

      {reports.filter(r => r.kind === kind || kind === 'manga' && r.kind === 'pages').map(r => <div key={r.provider + r.kind}>

        <strong>{r.name}</strong> ({r.ecosystem}) · {r.kind === 'pages' ? 'pages' : 'sources'}: {r.count} · subtitles: {r.subtitleCount || 0} · {r.status} · {r.durationMs} ms

        {r.lookup && <span> · {r.lookup === 'catalog-search' ? 'search fallback' : 'mapped ID'} · stream attempts: {r.attempts || 0}</span>}

        {r.error && <div className="text-destructive">{r.error}</div>}

      </div>)}

      <p className="text-muted-foreground">Extension results show the most recent request in this session.</p>

    </div>

  </details>;

}

