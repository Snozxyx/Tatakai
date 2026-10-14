import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { browserKittenModel, getKittenLocalStatus, isKittenLocalAvailable, onKittenProgress, prepareKittenModel, type KittenLocalStatus } from '@/lib/novel/kittenLocal';
import { useNovelReaderSettings } from '@/hooks/media/useNovelReaderSettings';

export function ExperimentalKittenSettings() {
  const { settings, updateSetting } = useNovelReaderSettings();
  const [status, setStatus] = useState<KittenLocalStatus | null>(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const available = isKittenLocalAvailable();
  const refresh = () => getKittenLocalStatus().then(setStatus).catch(() => setError('Unable to check the voice engine. Retry.'));
  useEffect(() => {
    if (!available) return;
    void refresh();
    return onKittenProgress(progress => {
      if (progress.phase.startsWith('downloading')) setMessage(progress.progress !== undefined ? `Downloading model · ${Math.min(100, Math.round(progress.progress * 100))}%` : 'Downloading model…');
      else if (progress.phase === 'ready') { setMessage('Model ready'); void refresh(); }
      else if (progress.phase === 'error') setError(progress.error || 'Download failed. Retry.');
      else setMessage('Loading voice engine…');
    });
  }, [available]);
  return <div className="my-4 space-y-4 rounded-xl border border-border p-4">
    <div><h3 className="text-sm font-semibold">KittenTTS <span className="ml-2 rounded bg-amber/15 px-2 py-1 text-xs text-amber">Experimental</span></h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Runs on this device in web, desktop and mobile. The first use downloads a model; later loads use the browser cache when available. English voices only. Longer passages may take time to generate.</p></div>
    {!available ? <p className="text-sm text-muted-foreground">Update your browser to enable WebAssembly and Web Workers, or select System voice.</p> : <>
      <label className="flex flex-wrap items-center justify-between gap-3 text-sm font-medium">Voice<select aria-label="Experimental KittenTTS voice" value={settings.kittenVoice} onChange={event => updateSetting('kittenVoice', event.target.value)} className="h-10 rounded-lg border border-input bg-background px-3">{(status?.voices.length ? status.voices : ['Luna','Bella','Bruno','Jasper','Rosie','Hugo','Kiki','Leo']).map(voice => <option key={voice}>{voice}</option>)}</select></label>
      <div className="space-y-2">
        <label className="flex flex-wrap items-center justify-between gap-3 text-sm font-medium">Playback buffer<select aria-describedby="kitten-buffer-help" value={settings.kittenBufferUnits} onChange={event => updateSetting('kittenBufferUnits', Number(event.target.value))} className="h-10 max-w-full rounded-lg border border-input bg-background px-3">
          <option value={0}>Off · generate each unit when needed</option>
          <option value={1}>1 unit · start sooner</option>
          <option value={2}>2 units</option>
          <option value={3}>3 units · recommended</option>
          <option value={4}>4 units</option>
          <option value={5}>5 units · more preparation</option>
        </select></label>
        <p id="kitten-buffer-help" className="text-xs leading-relaxed text-muted-foreground">Prepare this many short passages before speaking, then generate upcoming passages during playback. A larger buffer takes longer to start and uses more memory, but helps reduce gaps. Changes apply when you next press Play.</p>
      </div>
      {(status?.models || []).map(model => <div key={model.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3"><div className="min-w-0 flex-1"><p className="text-sm font-medium">{model.label}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{model.description}</p></div>{model.downloaded ? <Button size="sm" disabled={Boolean(busy)} variant={browserKittenModel(settings.kittenLocalModel) === model.id ? 'default' : 'outline'} onClick={() => updateSetting('kittenLocalModel', model.id)}>{browserKittenModel(settings.kittenLocalModel) === model.id ? 'Selected' : 'Select'}</Button> : <Button size="sm" disabled={Boolean(busy)} onClick={async () => { setBusy(model.id); setError(''); try { await prepareKittenModel(model.id); updateSetting('kittenLocalModel', model.id); await refresh(); } catch (err) { setError((err as Error).message); } finally { setBusy(''); setMessage(''); } }}>{busy === model.id ? 'Preparing…' : 'Load model'}</Button>}</div>)}
      {busy && <p role="status" className="text-sm text-muted-foreground">{message || 'Preparing model…'}</p>}
    </>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
