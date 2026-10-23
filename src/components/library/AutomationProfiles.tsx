import { ThemedSelect } from '@/components/ui/themed-select';
import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
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
  useUiTranslation();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState('');
  const [results, setResults] = useState<any>();
  const [previewTitle, setPreviewTitle] = useState('');
  const [preload, setPreload] = useState(() => localStorage.getItem('tatakai:preload-next-episode') === 'true');
  const [wifi, setWifi] = useState(() => localStorage.getItem(AUTOMATION_WIFI_KEY) !== 'false');
  const load = async () => { const list = await autoDownloadApi.list(); setRules(list); };
  useEffect(() => { void load().catch(() => setError(uiI18n.t('app.could_not_load_your_rules_refresh_to_try_again_1004bd39'))).finally(() => setLoading(false)); }, []);
  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key); setError('');
    try { await action(); }
    catch (failure) { const message = failure instanceof Error ? failure.message : uiI18n.t('app.could_not_complete_this_action_try_again_70a40f6b'); setError(message); toast.error(message); }
    finally { setBusy(undefined); }
  };
  return <section className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-xl space-y-1"><h2 className="text-xl font-semibold">{uiI18n.t('app.automatic_downloads_5e777bc1')}</h2><p className="text-sm leading-relaxed text-muted-foreground">{uiI18n.t('app.set_your_preferred_quality_and_preview_the_relea_7478cb5e')}</p></div>
      <div className="flex gap-2">
        <Button variant="ghost" size="icon" aria-label={uiI18n.t('app.refresh_rules_1141b494')} disabled={!!busy || loading} onClick={() => void run('refresh', load)}><RefreshCw className="h-4 w-4" /></Button>
        <Button variant="outline" disabled={!!busy || loading} onClick={() => void run('check', async () => {
          const desktop = (window as any).electron?.autoDownload;
          if (desktop && !desktop.checkNow) throw new Error(uiI18n.t('app.restart_tatakai_to_enable_manual_download_checks_7172f978'));
          if (desktop) await desktop.checkNow();
          await checkAndRunAutomation(); await load(); toast.success(uiI18n.t('app.download_check_finished_5786b5cb'));
        })}>{busy === 'check' ? 'Checking...' : uiI18n.t('app.check_now_2ce5dd0d')}</Button>
      </div>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {loading ? <div className="space-y-3" aria-label={uiI18n.t('app.loading_download_rules_9a2dc6b7')}><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div> : !rules.length ? <div className="rounded-xl border border-dashed border-border p-8 text-center space-y-2"><Bot className="mx-auto h-7 w-7 text-muted-foreground" /><h3 className="text-base font-semibold">{uiI18n.t('app.follow_a_series_automatically_ba11f5f6')}</h3><p className="mx-auto max-w-sm text-sm text-muted-foreground">{uiI18n.t('app.open_a_series_and_choose_download_then_auto_down_d0afd0a2')}</p></div> : <div className="divide-y divide-border border-y border-border">
      {rules.map(rule => <div key={rule.id || rule.animeId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
        <div className="min-w-0 flex-1 basis-48"><h3 className="break-words text-sm font-semibold">{rule.title}</h3><p className="mt-1 text-xs text-muted-foreground">{uiI18n.t('app.next_episode_b0056b01')} {rule.nextEpisode}</p></div>
        <Button variant="ghost" size="icon" className="sm:col-start-4 sm:row-start-1" aria-label={uiI18n.t('app.unsubscribe_from_i18n_value_0_ac67f5f9', { value0: rule.title })} disabled={!!busy} onClick={() => void run('remove', async () => { await autoDownloadApi.unsubscribe(rule.animeId); setResults(undefined); await load(); })}><Trash2 className="h-4 w-4 text-muted-foreground" /></Button>
        <div className="col-span-2 flex min-w-0 gap-2 sm:col-start-2 sm:row-start-1">
        <ThemedSelect aria-label={uiI18n.t('app.scoring_profile_for_i18n_value_0_bc07a759', { value0: rule.title })} disabled={!!busy} className="h-10 min-w-0 flex-1 max-w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" value={rule.scoringProfile || 'legacy'} onChange={event => {
          const profile = event.target.value as ScoringProfile;
          void run('profile', async () => {
            const desktop = (window as any).electron?.autoDownload;
            if (desktop?.setProfile) await desktop.setProfile(rule.id || rule.animeId, profile);
            else await db.downloadRules.update(rule.id!, { scoringProfile: profile });
            setResults(undefined); await load();
          });
        }}><option value="legacy" disabled>{uiI18n.t('app.existing_preferences_1b2a3f88')}</option><option value="balanced">{uiI18n.t('app.balanced_1080p_6dcc69a4')}</option><option value="best-quality">{uiI18n.t('app.best_quality_d92ffe94')}</option><option value="data-saver">{uiI18n.t('app.data_saver_720p_7298ed49')}</option></ThemedSelect>
        <Button variant="outline" disabled={!!busy} onClick={() => void run(rule.id || rule.animeId, async () => {
          setResults(undefined); setPreviewTitle(`${rule.title} - episode ${rule.nextEpisode}`);
          setResults(await simulateAutoDownload(rule.id || rule.animeId, rule.nextEpisode));
        })}><FlaskConical className="mr-2 h-4 w-4" />{busy === (rule.id || rule.animeId) ? 'Simulating...' : uiI18n.t('app.simulate_95c60456')}</Button>
        </div>

      </div>)}
    </div>}
    {results && <section aria-label={uiI18n.t('app.simulation_results_496e21a0')} className="rounded-xl border border-border overflow-hidden">
      <div className="space-y-1 bg-muted/40 p-4"><h3 className="text-base font-semibold">{results.selected ? uiI18n.t('app.proposed_release_88fee147') : uiI18n.t('app.no_eligible_release_e4bdf9c0')}</h3><p className="break-words text-sm text-muted-foreground">{previewTitle}</p><p className="text-xs text-muted-foreground">{uiI18n.t('app.preview_only_this_does_not_start_a_download_8aca80db')}</p></div>
      {results.message && <p className="p-4 text-sm text-muted-foreground">{results.message}</p>}
      <div className="divide-y divide-border">{(results.ranked || []).map((candidate: any) => <div key={candidate.id} className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words text-sm font-medium">{candidate.candidate.title || uiI18n.t('app.release_d41f56ce')}</p><p className="mt-1 text-xs text-muted-foreground">{candidate.candidate.quality || uiI18n.t('app.unknown_quality_2695c183')}{candidate.candidate.providerId ? uiI18n.t('app.i18n_value_0_31730452', { value0: candidate.candidate.providerId }) : ''}</p></div><span className="shrink-0 text-sm tabular-nums">{candidate.accepted ? uiI18n.t('app.score_i18n_value_0_554ca30c', { value0: candidate.score }) : uiI18n.t('app.rejected_27eeb7a2')}</span></div>
        {candidate.id === results.selected?.id && <p className="flex items-center gap-1 text-xs font-medium text-primary"><Check className="h-3.5 w-3.5" />{uiI18n.t('app.selected_for_download_ce4fc3bf')}</p>}
        <p className="text-xs leading-relaxed text-muted-foreground">{(candidate.accepted ? candidate.reasons : candidate.rejected).map(reasonLabel).join(', ')}</p>
      </div>)}</div>
    </section>}
    <details className="border-t border-border pt-4"><summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"><ChevronDown className="h-4 w-4" />{uiI18n.t('app.network_and_preloading_7471c2c1')}</summary>
      <SettingRow className="[&_.settings-row-main]:flex-nowrap [&_.settings-row-label]:min-w-0" title={uiI18n.t('app.wi_fi_only_on_mobile_b8fc70fe')} description={uiI18n.t('app.automatic_transfers_wait_for_wi_fi_source_checks_d6469090')} control={({ labelId, descriptionId }) => <Switch aria-labelledby={labelId} aria-describedby={descriptionId} checked={wifi} onCheckedChange={value => { setWifi(value); localStorage.setItem(AUTOMATION_WIFI_KEY, String(value)); }} />} />
      <SettingRow className="[&_.settings-row-main]:flex-nowrap [&_.settings-row-label]:min-w-0" title={uiI18n.t('app.preload_next_episode_bb79849a')} description={uiI18n.t('app.start_at_80_playback_with_a_20_mib_limit_current_8e44ab75')} control={({ labelId, descriptionId }) => <Switch aria-labelledby={labelId} aria-describedby={descriptionId} checked={preload} onCheckedChange={value => { setPreload(value); localStorage.setItem('tatakai:preload-next-episode', String(value)); }} />} />
    </details>
  </section>;
}
