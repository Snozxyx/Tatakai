import { useEffect, useState } from 'react';
import { useVideoSettings } from '@/hooks/media/useVideoSettings';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SettingRow } from '@/components/settings/SettingsPrimitives';
import { UpscalerPreview } from './UpscalerPreview';
import { Button } from '@/components/ui/button';
import { isMobileNative } from '@/lib/platform/platform';
import type { VideoEnhancementEngine, VideoEnhancementQuality } from '@/lib/video/enhancement-settings';
import type { RtxCapability } from '@/lib/video/rtx-video';

export function VideoEnhancementSettings() {
  const { settings, updateSetting } = useVideoSettings();
  const [caps, setCaps] = useState<RtxCapability>();
  const [playbackStatus, setPlaybackStatus] = useState('');
  const [gpuError, setGpuError] = useState('');
  const bridge = window.electron?.rtxVideo;
  useEffect(() => {
    let disposed = false;
    void bridge?.capability().then(result => { if (!disposed) setCaps(result); }).catch(() => { if (!disposed) setCaps({ available: false, reason: 'Could not check RTX Video. Restart the desktop app and try again.', maxOutputHeight: 1080 }); });
    return () => { disposed = true; };
  }, [bridge]);
  useEffect(() => {
    const receive = (event: Event) => setPlaybackStatus((event as CustomEvent<string>).detail);
    window.addEventListener('tatakai-video-enhancement-status', receive);
    return () => window.removeEventListener('tatakai-video-enhancement-status', receive);
  }, []);
  const engine = settings.videoEnhancementEngine;
  return <section className="space-y-3" aria-label="Video enhancement">
    <h3 className="text-sm font-medium">Video enhancement</h3>
    <SettingRow title="Engine" description="Enhance anime frames while keeping subtitles, playback speed, and audio in sync." control={({ labelId }) => <Select value={engine} onValueChange={value => updateSetting('videoEnhancementEngine', value as VideoEnhancementEngine)}>
      <SelectTrigger aria-labelledby={labelId} className="h-9 w-44"><SelectValue /></SelectTrigger><SelectContent>
        <SelectItem value="off">Off</SelectItem><SelectItem value="anime4k">Anime4K</SelectItem><SelectItem value="rtx" disabled={!caps?.available}>RTX Video · beta</SelectItem>
      </SelectContent></Select>} />
    <p className="text-xs text-muted-foreground">{!bridge ? 'RTX Video requires the Windows desktop app and a supported NVIDIA RTX GPU.' : !caps ? 'Checking NVIDIA RTX Video support…' : !caps.available ? caps.reason : `RTX Video ready on ${caps.adapter}. Output capped at ${caps.maxOutputHeight}p.`}</p>
    {bridge && !caps?.available && <Button type="button" size="sm" variant="ghost" disabled={!caps} onClick={() => {
      setCaps(undefined);
      void bridge.capability().then(setCaps).catch(() => setCaps({ available: false, reason: 'Could not check RTX Video. Restart the desktop app and try again.', maxOutputHeight: 1080 }));
    }}>Check again</Button>}
    {caps?.restartRequired && bridge && <Button type="button" size="sm" variant="secondary" onClick={() => void bridge.restartWithGpuPreference(true).catch(error => setGpuError(String(error)))}>Use NVIDIA GPU & restart</Button>}
    {caps?.restartRequired && <p className="text-xs text-muted-foreground">Using the dedicated GPU can increase laptop power use. You can return to the system GPU from these settings.</p>}
    {caps?.dedicatedGpuRequested && bridge && <Button type="button" size="sm" variant="ghost" onClick={() => void bridge.restartWithGpuPreference(false).catch(error => setGpuError(String(error)))}>Use system GPU & restart</Button>}
    {gpuError && <p role="alert" className="text-sm text-destructive">{gpuError}</p>}
    {engine !== 'off' && settings.playerEngine === 'jwplayer' && <p role="status" className="text-sm text-muted-foreground">Video enhancement requires Tatakai’s built-in player. Switch the player engine to use it.</p>}
    {engine === 'rtx' && playbackStatus && <p aria-live={playbackStatus.startsWith('Showing original.') ? 'polite' : 'off'} className="text-sm text-muted-foreground">{playbackStatus}</p>}
    {engine !== 'off' && <SettingRow title="Quality" description={engine === 'rtx' ? 'Balanced is recommended. Quality lowers if processing falls behind; the original is shown if it stays too slow.' : isMobileNative() ? 'Native mobile playback uses Light to limit GPU load.' : 'Balanced combines line restoration and 2× upscaling.'} control={({ labelId }) => <Select value={isMobileNative() && engine === 'anime4k' ? 'light' : settings.videoEnhancementQuality} onValueChange={value => updateSetting('videoEnhancementQuality', value as VideoEnhancementQuality)}>
      <SelectTrigger aria-labelledby={labelId} className="h-9 w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="light">Light</SelectItem><SelectItem value="balanced" disabled={isMobileNative() && engine === 'anime4k'}>Balanced</SelectItem><SelectItem value="high" disabled={isMobileNative() && engine === 'anime4k'}>High quality</SelectItem></SelectContent></Select>} />}
    {engine === 'anime4k' && !isMobileNative() && <SettingRow title="Anime4K processing" description="Keep a legacy restore-only or upscale-only preference, or use the selected quality preset." control={({ labelId }) => <Select value={settings.anime4kPreset} onValueChange={value => updateSetting('anime4kPreset', value as typeof settings.anime4kPreset)}><SelectTrigger aria-labelledby={labelId} className="h-9 w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="light">Light · restore</SelectItem><SelectItem value="standard">Balanced · 2×</SelectItem><SelectItem value="high">High quality · 2×</SelectItem><SelectItem value="restore">Restore only</SelectItem><SelectItem value="upscale">Upscale only · 2×</SelectItem></SelectContent></Select>} />}
    {engine === 'anime4k' && <UpscalerPreview engine="anime4k" preset={isMobileNative() ? 'light' : settings.anime4kPreset} />}
    {engine === 'rtx' && <p className="text-xs text-muted-foreground">RTX Video uses NVIDIA’s Super Resolution engine. It preserves SDR output; HDR conversion and frame generation are off.</p>}
    {engine === 'rtx' && <UpscalerPreview engine="rtx" quality={settings.videoEnhancementQuality} disabled={!caps?.available} />}
  </section>;
}
