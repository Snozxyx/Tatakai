import { useEffect, useState } from 'react';
import { useReaderSettings } from '@/hooks/media/useReaderSettings';
import { SettingRow, SettingsSection } from '@/components/settings/SettingsPrimitives';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { UpscalerPreview } from './UpscalerPreview';
import { UPSCALERS, type EnhancementQuality, type UpscalerEngine, type UpscalerStatus } from '@/lib/upscaling';
import type { Anime4KMode } from '@/lib/video/anime4k/Anime4KRenderer';

export function ReaderUpscaling() {
  const { settings, updateSetting } = useReaderSettings();
  const [status, setStatus] = useState<UpscalerStatus>();
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const bridge = window.electron?.upscaler;
  const engine = settings.upscaler;
  const native = engine === 'realesrgan' || engine === 'manga';
  const ready = !native || Boolean(status?.[engine]);
  useEffect(() => {
    if (!bridge) return;
    let disposed = false;
    const refresh = () => { void bridge.status().then(result => { if (!disposed) setStatus(result); }).catch(err => { if (!disposed) setError(String(err)); }); };
    refresh(); const timer = window.setInterval(refresh, 2000);
    return () => { disposed = true; clearInterval(timer); };
  }, [bridge]);
  const install = async () => {
    if (!bridge || !native) return;
    setStarting(true); setError('');
    try { await bridge.install(engine); setStatus(await bridge.status()); }
    catch (err) { setError(err instanceof Error ? err.message : 'Setup failed. Please try again.'); }
    finally { setStarting(false); }
  };
  const storageAction = async (action: 'cancelSetup' | 'clearCache') => {
    setError('');
    try { await bridge?.[action]?.(); if (bridge) setStatus(await bridge.status()); }
    catch (err) { setError(err instanceof Error ? err.message : 'Please try again.'); }
  };
  const megabytes = (bytes = 0) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return <SettingsSection title="Reader page enhancement" description="Make small pages clearer while you read. Originals are kept, and you can switch this off at any time.">
    <SettingRow title="Upscaler" description={UPSCALERS.find(item => item.value === engine)?.description} control={({ labelId }) => <Select value={engine} onValueChange={value => updateSetting('upscaler', value as UpscalerEngine)}>
      <SelectTrigger aria-labelledby={labelId} className="h-9 w-44"><SelectValue /></SelectTrigger>
      <SelectContent>{UPSCALERS.map(item => <SelectItem key={item.value} value={item.value} disabled={['realesrgan', 'manga'].includes(item.value) && !bridge}>{item.label}</SelectItem>)}</SelectContent>
    </Select>} />
    {!bridge && <p className="mb-3 text-xs text-muted-foreground">Real-ESRGAN and Manga Upscaler run locally in the desktop app. Anime4K runs in supported browsers too.</p>}
    {engine === 'anime4k' && <SettingRow title="Anime4K quality" description="Balanced suits most pages. Restore keeps the original resolution." control={({ labelId }) => <Select value={settings.upscalePreset} onValueChange={value => updateSetting('upscalePreset', value as Anime4KMode)}>
      <SelectTrigger aria-labelledby={labelId} className="h-9 w-44"><SelectValue /></SelectTrigger><SelectContent>
        <SelectItem value="light">Light · restore</SelectItem><SelectItem value="standard">Balanced · 2×</SelectItem><SelectItem value="high">High · 2×</SelectItem><SelectItem value="upscale">Upscale only · 2×</SelectItem><SelectItem value="restore">Restore only</SelectItem>
      </SelectContent></Select>} />}
    {native && <>
      <SettingRow title="Processing quality" description="Light uses smaller tiles. High quality adds more context around fine lines; all presets use the selected upstream model." control={({ labelId }) => <Select value={settings.upscaleQuality} onValueChange={value => updateSetting('upscaleQuality', value as EnhancementQuality)}><SelectTrigger aria-labelledby={labelId} className="h-9 w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="light">Light</SelectItem><SelectItem value="balanced">Balanced</SelectItem><SelectItem value="high">High quality</SelectItem></SelectContent></Select>} />
      <SettingRow title="Output size" description="2× uses less memory. 4× is useful for very small pages." control={({ labelId }) => <Select value={String(settings.upscaleScale)} onValueChange={value => updateSetting('upscaleScale', Number(value) as 2 | 4)}><SelectTrigger aria-labelledby={labelId} className="h-9 w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="2">2× · recommended</SelectItem><SelectItem value="4">4×</SelectItem></SelectContent></Select>} />
      {!ready && <div className="my-3 space-y-2">
        <p className="text-sm text-muted-foreground">One-time setup downloads AI dependencies and this model. Requires Python 3.10+ and free disk space; CPU processing can be slow. Pages stay on your device.</p>
        <Button type="button" variant="secondary" size="sm" disabled={starting || status?.installing} onClick={() => void install()}>{starting || status?.installing ? 'Setting up…' : `Set up ${engine === 'manga' ? 'Manga Upscaler' : 'Real-ESRGAN'}`}</Button>
      </div>}
      {status?.installing && <p role="status" className="my-2 text-sm text-muted-foreground">{status.stage}</p>}
      {status?.installing && <div className="my-2 space-y-2">
        {Boolean(status.downloadTotal) && <><progress aria-label="Model download" className="w-full accent-primary" value={status.downloadBytes} max={status.downloadTotal} /><p className="text-xs text-muted-foreground">{megabytes(status.downloadBytes)} / {megabytes(status.downloadTotal)}</p></>}
        {bridge?.cancelSetup && <Button type="button" size="sm" variant="ghost" onClick={() => void storageAction('cancelSetup')}>Cancel setup</Button>}
      </div>}
      {(error || status?.error) && <p role="alert" className="my-2 text-sm text-destructive">{error || status?.error}</p>}
      {ready && <p className="my-2 text-xs text-muted-foreground">Ready. Visible pages are enhanced one at a time and cached on this device.</p>}
    </>}
    {engine !== 'off' && <UpscalerPreview engine={engine} preset={settings.upscalePreset} scale={settings.upscaleScale} quality={settings.upscaleQuality} disabled={!ready || status?.installing} />}
    {bridge && <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>Models & downloads: {megabytes(status?.modelBytes)} · Page cache: {megabytes(status?.cacheBytes)} / 512 MB{status?.loadedEngine ? ` · ${status.loadedEngine === 'manga' ? 'MangaJaNai' : 'Real-ESRGAN'} loaded` : ''}</span>
      {bridge.clearCache && <Button type="button" variant="ghost" size="sm" disabled={Boolean(status?.queued) || !status?.cacheBytes} onClick={() => void storageAction('clearCache')}>Clear page cache</Button>}
    </div>}
    <p className="mt-3 text-xs text-muted-foreground">Open source: <a className="underline underline-offset-2" href="https://github.com/bloc97/Anime4K" target="_blank" rel="noreferrer">Anime4K</a> · <a className="underline underline-offset-2" href="https://github.com/xinntao/Real-ESRGAN" target="_blank" rel="noreferrer">Real-ESRGAN</a> · <a className="underline underline-offset-2" href="https://github.com/Yui007/manga_upscaler" target="_blank" rel="noreferrer">Manga Upscaler</a> (MangaJaNai model, headless inference)</p>
  </SettingsSection>;
}
