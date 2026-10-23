import { ThemedSelect } from '@/components/ui/themed-select';
import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { browserKittenModel, getKittenLocalStatus, isKittenLocalAvailable, onKittenProgress, prepareKittenModel, type KittenLocalStatus } from '@/lib/novel/kittenLocal';
import { useNovelReaderSettings } from '@/hooks/media/useNovelReaderSettings';

export function ExperimentalKittenSettings() {
  useUiTranslation();
  const { settings, updateSetting } = useNovelReaderSettings();
  const [status, setStatus] = useState<KittenLocalStatus | null>(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const available = isKittenLocalAvailable();
  const refresh = () => getKittenLocalStatus().then(setStatus).catch(() => setError(uiI18n.t('app.unable_to_check_the_voice_engine_retry_9ddd79d8')));
  useEffect(() => {
    if (!available) return;
    void refresh();
    return onKittenProgress(progress => {
      if (progress.phase.startsWith('downloading')) setMessage(progress.progress !== undefined ? uiI18n.t('app.downloading_model_i18n_value_0_140353c3', { value0: Math.min(100, Math.round(progress.progress * 100)) }) : uiI18n.t('app.downloading_model_124bc207'));
      else if (progress.phase === 'ready') { setMessage(uiI18n.t('app.model_ready_4b7cbb1f')); void refresh(); }
      else if (progress.phase === 'error') setError(progress.error || uiI18n.t('app.download_failed_retry_b4125bad'));
      else setMessage(uiI18n.t('app.loading_voice_engine_0b397b49'));
    });
  }, [available]);
  return <div className="my-4 space-y-4 rounded-xl border border-border p-4">
    <div><h3 className="text-sm font-semibold">{uiI18n.t('app.kittentts_5bcc5066')} <span className="ml-2 rounded bg-amber/15 px-2 py-1 text-xs text-amber">{uiI18n.t('app.experimental_b718f8c3')}</span></h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{uiI18n.t('app.runs_on_this_device_in_web_desktop_and_mobile_th_5ccb954b')}</p></div>
    {!available ? <p className="text-sm text-muted-foreground">{uiI18n.t('app.update_your_browser_to_enable_webassembly_and_we_48b3291d')}</p> : <>
      <label className="flex flex-wrap items-center justify-between gap-3 text-sm font-medium">{uiI18n.t('app.voice_3091c844')}<ThemedSelect aria-label={uiI18n.t('app.experimental_kittentts_voice_6b4c1cce')} value={settings.kittenVoice} onChange={event => updateSetting('kittenVoice', event.target.value)} className="h-10 rounded-lg border border-input bg-background px-3">{(status?.voices.length ? status.voices : ['Luna','Bella','Bruno','Jasper','Rosie','Hugo','Kiki','Leo']).map(voice => <option key={voice}>{voice}</option>)}</ThemedSelect></label>
      <div className="space-y-2">
        <label className="flex flex-wrap items-center justify-between gap-3 text-sm font-medium">{uiI18n.t('app.playback_buffer_2525423c')}<ThemedSelect aria-describedby="kitten-buffer-help" value={settings.kittenBufferUnits} onChange={event => updateSetting('kittenBufferUnits', Number(event.target.value))} className="h-10 max-w-full rounded-lg border border-input bg-background px-3">
          <option value={0}>{uiI18n.t('app.off_generate_each_unit_when_needed_989e6270')}</option>
          <option value={1}>{uiI18n.t('app.1_unit_start_sooner_a1513bab')}</option>
          <option value={2}>{uiI18n.t('app.2_units_20d8cb01')}</option>
          <option value={3}>{uiI18n.t('app.3_units_recommended_27ea4767')}</option>
          <option value={4}>{uiI18n.t('app.4_units_2dda0bce')}</option>
          <option value={5}>{uiI18n.t('app.5_units_more_preparation_e42b41ee')}</option>
        </ThemedSelect></label>
        <p id="kitten-buffer-help" className="text-xs leading-relaxed text-muted-foreground">{uiI18n.t('app.prepare_this_many_short_passages_before_speaking_2b6da64d')}</p>
      </div>
      {(status?.models || []).map(model => <div key={model.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3"><div className="min-w-0 flex-1"><p className="text-sm font-medium">{model.label}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{model.description}</p></div>{model.downloaded ? <Button size="sm" disabled={Boolean(busy)} variant={browserKittenModel(settings.kittenLocalModel) === model.id ? 'default' : 'outline'} onClick={() => updateSetting('kittenLocalModel', model.id)}>{browserKittenModel(settings.kittenLocalModel) === model.id ? uiI18n.t('app.selected_9a976fc2') : uiI18n.t('app.select_85982229')}</Button> : <Button size="sm" disabled={Boolean(busy)} onClick={async () => { setBusy(model.id); setError(''); try { await prepareKittenModel(model.id); updateSetting('kittenLocalModel', model.id); await refresh(); } catch (err) { setError((err as Error).message); } finally { setBusy(''); setMessage(''); } }}>{busy === model.id ? uiI18n.t('app.preparing_0b1d6c0b') : uiI18n.t('app.load_model_7816d4d1')}</Button>}</div>)}
      {busy && <p role="status" className="text-sm text-muted-foreground">{message || uiI18n.t('app.preparing_model_ee30c672')}</p>}
    </>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
