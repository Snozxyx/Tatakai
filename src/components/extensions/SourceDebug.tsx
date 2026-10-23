import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useDeveloperMode } from '@/hooks/ui/useDeveloperMode';
import { useEffect, useState } from 'react';

import { sourceReports } from '@/core/extensions/remote/diagnostics';


export function SourceDebug({ kind, sources = [], diagnostics = [], unit }: { kind: 'anime' | 'manga' | 'custom'; sources?: Array<{ provider?: string; providerKey?: string; providerName?: string }>; diagnostics?: Array<{ provider: string; status: string; resultCount?: number; durationMs?: number; error?: string }>; unit?: string }) {
  useUiTranslation();

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
  const scopedReports = reports.filter(r => r.kind === kind || kind === 'manga' && r.kind === 'pages');
  const reported = new Set(scopedReports.map(report => report.provider));

  const counts = new Map<string, { name: string; count: number }>();

  for (const source of sources) {

    const id = source.providerKey || source.provider || 'unknown';

    const entry = counts.get(id) || { name: source.providerName || id, count: 0 };

    entry.count++; counts.set(id, entry);

  }

  return <details className="rounded-xl border border-white/10 p-3 text-xs">

    <summary className="cursor-pointer font-medium">{uiI18n.t('app.source_diagnostics_1977e187')} {sources.length} {unit || (kind === 'manga' ? uiI18n.t('app.chapter_sources_d18b7f55') : uiI18n.t('app.video_sources_75ce2b7c'))}</summary>

    <div className="mt-3 space-y-2" aria-live="polite">

      {[...counts].map(([id, entry]) => <div key={id}>{entry.name}: {entry.count} {uiI18n.t('app.available_7b231a50')}</div>)}

      {diagnostics.filter(d => !/^(seanime|stremio)-/.test(d.provider) && !reported.has(d.provider)).map(d => <div key={d.provider}>

        <strong>{counts.get(d.provider)?.name || d.provider}</strong> {uiI18n.t('app.sources_955e4eba')} {d.resultCount ?? counts.get(d.provider)?.count ?? 0} · {d.status} · {d.durationMs ?? 0} {uiI18n.t('app.ms_26cc3217')}

        {d.error && <div className="text-destructive">{d.error.replace(/https?:\/\/[^\s)]+/gi, '[URL]').slice(0, 300)}</div>}

      </div>)}

      {scopedReports.map(r => <div key={r.provider + r.kind}>

        <strong>{r.name}</strong> ({r.ecosystem}) · {r.kind === 'pages' ? uiI18n.t('app.pages_eec6542d') : uiI18n.t('app.sources_bce16dd0')}: {r.count} {uiI18n.t('app.subtitles_2b0bb9df')} {r.subtitleCount || 0} · {r.status} · {r.durationMs} {uiI18n.t('app.ms_26cc3217')}

        {r.lookup && <span> · {r.lookup === 'catalog-search' ? uiI18n.t('app.search_fallback_02ac9eb8') : uiI18n.t('app.mapped_id_36308965')} {uiI18n.t('app.stream_attempts_62867e35')} {r.attempts || 0}</span>}

        {r.error && <div className={r.status === 'unmatched' || r.status === 'skipped' ? 'break-words text-muted-foreground' : 'break-words text-destructive'}>{r.error}</div>}

      </div>)}

      <p className="text-muted-foreground">{uiI18n.t('app.extension_results_show_the_most_recent_request_i_d86d6e16')}</p>

    </div>

  </details>;

}

