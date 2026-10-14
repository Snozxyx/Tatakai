import { useEffect, useState } from 'react';
import { Bot, Check, ChevronDown, FlaskConical, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { SettingRow } from '@/components/settings/SettingsPrimitives';
import { db } from '@/core/db';
import { autoDownloadApi, simulateAutoDownload, checkAndRunAutomation } from '@/core/download/automation-engine';
import { AUTOMATION_WIFI_KEY } from '@/core/download/mobile/network-policy';
import { toast } from 'sonner';
import type { ScoringProfile } from '@tatakai/candidate-evaluator';

type Rule = { id?: string; animeId: string; title: string; nextEpisode: number; scoringProfile?: ScoringProfile };
const reasonLabel = (reason: string) => reason.replace(/-/g, ' ').replace(/^./, value => value.toUpperCase());

export function AutomationProfiles() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState('');
  const [results, setResults] = useState<any>();
  const [previewTitle, setPreviewTitle] = useState('');
  const [preload, setPreload] = useState(() => localStorage.getItem('tatakai:preload-next-episode') === 'true');
  const [wifi, setWifi] = useState(() => localStorage.getItem(AUTOMATION_WIFI_KEY) !== 'false');
  const load = async () => { const list = await autoDownloadApi.list(); setRules(list); };
  useEffect(() => { void load().catch(() => setError('Could not load your rules. Refresh to try again.')).finally(() => setLoading(false)); }, []);
  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key); setError('');
    try { await action(); }
    catch (failure) { const message = failure instanceof Error ? failure.message : 'Could not complete this action. Try again.'; setError(message); toast.error(message); }
    finally { setBusy(undefined); }
  };
  return <section className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-xl space-y-1"><h2 className="text-xl font-semibold">Automatic downloads</h2><p className="text-sm leading-relaxed text-muted-foreground">Set your preferred quality and preview the release Tatakai would choose.</p></div>
      <div className="flex gap-2">
        <Button variant="ghost" size="icon" aria-label="Refresh rules" disabled={!!busy || loading} onClick={() => void run('refresh', load)}><RefreshCw className="h-4 w-4" /></Button>
        <Button variant="outline" disabled={!!busy || loading} onClick={() => void run('check', async () => {
          const desktop = (window as any).electron?.autoDownload;
          if (desktop && !desktop.checkNow) throw new Error('Restart Tatakai to enable manual download checks.');
          if (desktop) await desktop.checkNow();
          await checkAndRunAutomation(); await load(); toast.success('Download check finished');
        })}>{busy === 'check' ? 'Checking...' : 'Check now'}</Button>
      </div>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {loading ? <div className="space-y-3" aria-label="Loading download rules"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div> : !rules.length ? <div className="rounded-xl border border-dashed border-border p-8 text-center space-y-2"><Bot className="mx-auto h-7 w-7 text-muted-foreground" /><h3 className="text-base font-semibold">Follow a series automatically</h3><p className="mx-auto max-w-sm text-sm text-muted-foreground">Open a series and choose Download, then Auto-Download, to add your first rule.</p></div> : <div className="divide-y divide-border border-y border-border">
      {rules.map(rule => <div key={rule.id || rule.animeId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
        <div className="min-w-0 flex-1 basis-48"><h3 className="break-words text-sm font-semibold">{rule.title}</h3><p className="mt-1 text-xs text-muted-foreground">Next: episode {rule.nextEpisode}</p></div>
        <Button variant="ghost" size="icon" className="sm:col-start-4 sm:row-start-1" aria-label={`Unsubscribe from ${rule.title}`} disabled={!!busy} onClick={() => void run('remove', async () => { await autoDownloadApi.unsubscribe(rule.animeId); setResults(undefined); await load(); })}><Trash2 className="h-4 w-4 text-muted-foreground" /></Button>
        <div className="col-span-2 flex min-w-0 gap-2 sm:col-start-2 sm:row-start-1">
        <select aria-label={`Scoring profile for ${rule.title}`} disabled={!!busy} className="h-10 min-w-0 flex-1 max-w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" value={rule.scoringProfile || 'legacy'} onChange={event => {
          const profile = event.target.value as ScoringProfile;
          void run('profile', async () => {
            const desktop = (window as any).electron?.autoDownload;
            if (desktop?.setProfile) await desktop.setProfile(rule.id || rule.animeId, profile);
            else await db.downloadRules.update(rule.id!, { scoringProfile: profile });
            setResults(undefined); await load();
          });
        }}><option value="legacy" disabled>Existing preferences</option><option value="balanced">Balanced (1080p)</option><option value="best-quality">Best quality</option><option value="data-saver">Data saver (720p)</option></select>
        <Button variant="outline" disabled={!!busy} onClick={() => void run(rule.id || rule.animeId, async () => {
          setResults(undefined); setPreviewTitle(`${rule.title} - episode ${rule.nextEpisode}`);
          setResults(await simulateAutoDownload(rule.id || rule.animeId, rule.nextEpisode));
        })}><FlaskConical className="mr-2 h-4 w-4" />{busy === (rule.id || rule.animeId) ? 'Simulating...' : 'Simulate'}</Button>
        </div>

      </div>)}
    </div>}
    {results && <section aria-label="Simulation results" className="rounded-xl border border-border overflow-hidden">
      <div className="space-y-1 bg-muted/40 p-4"><h3 className="text-base font-semibold">{results.selected ? 'Proposed release' : 'No eligible release'}</h3><p className="break-words text-sm text-muted-foreground">{previewTitle}</p><p className="text-xs text-muted-foreground">Preview only. This does not start a download.</p></div>
      {results.message && <p className="p-4 text-sm text-muted-foreground">{results.message}</p>}
      <div className="divide-y divide-border">{(results.ranked || []).map((candidate: any) => <div key={candidate.id} className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words text-sm font-medium">{candidate.candidate.title || 'Release'}</p><p className="mt-1 text-xs text-muted-foreground">{candidate.candidate.quality || 'Unknown quality'}{candidate.candidate.providerId ? ` / ${candidate.candidate.providerId}` : ''}</p></div><span className="shrink-0 text-sm tabular-nums">{candidate.accepted ? `Score ${candidate.score}` : 'Rejected'}</span></div>
        {candidate.id === results.selected?.id && <p className="flex items-center gap-1 text-xs font-medium text-primary"><Check className="h-3.5 w-3.5" />Selected for download</p>}
        <p className="text-xs leading-relaxed text-muted-foreground">{(candidate.accepted ? candidate.reasons : candidate.rejected).map(reasonLabel).join(', ')}</p>
      </div>)}</div>
    </section>}
    <details className="border-t border-border pt-4"><summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"><ChevronDown className="h-4 w-4" />Network and preloading</summary>
      <SettingRow className="[&_.settings-row-main]:flex-nowrap [&_.settings-row-label]:min-w-0" title="Wi-Fi only on mobile" description="Automatic transfers wait for Wi-Fi. Source checks run while the mobile app is active or resumes." control={({ labelId, descriptionId }) => <Switch aria-labelledby={labelId} aria-describedby={descriptionId} checked={wifi} onCheckedChange={value => { setWifi(value); localStorage.setItem(AUTOMATION_WIFI_KEY, String(value)); }} />} />
      <SettingRow className="[&_.settings-row-main]:flex-nowrap [&_.settings-row-label]:min-w-0" title="Preload next episode" description="Start at 80% playback, with a 20 MiB limit. Current playback keeps priority." control={({ labelId, descriptionId }) => <Switch aria-labelledby={labelId} aria-describedby={descriptionId} checked={preload} onCheckedChange={value => { setPreload(value); localStorage.setItem('tatakai:preload-next-episode', String(value)); }} />} />
    </details>
  </section>;
}
