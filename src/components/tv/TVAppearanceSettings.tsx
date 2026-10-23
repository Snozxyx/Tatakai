import { ThemedCheckbox } from '@/components/ui/themed-checkbox';
import { useState } from "react";
import { saveTVAppearance, useTVAppearance } from "@/core/tv/appearance";
import { TV_WALLPAPERS, validTVWallpaper } from "@/core/tv/wallpapers";
export function TVAppearanceSettings() {
  const { appearance, reduced } = useTVAppearance();
  const [url, setUrl] = useState(appearance.wallpaper.startsWith('https:') ? appearance.wallpaper : '');
  const [message, setMessage] = useState('');
  return <section className="tv-appearance-settings">
    <h2>Wallpapers & atmosphere</h2>
    <p>Pick a scene. Cards and glass surfaces take their color from the background.</p>
    <div className="tv-wallpaper-presets">
      {TV_WALLPAPERS.map(preset => <button key={preset.id} className="tv-wallpaper-preset" data-tv-key={`wallpaper-${preset.id}`} aria-pressed={appearance.wallpaper === preset.src} onClick={() => {
        saveTVAppearance({ ...appearance, wallpaper: preset.src }); setMessage(`${preset.name} selected.`);
      }}><img src={preset.poster} alt="" loading="lazy" /><span>{preset.name}{appearance.wallpaper === preset.src && <small>Active</small>}</span></button>)}
    </div>
    <label className="tv-setting-row"><span><strong>Animated wallpaper</strong><small>Lightweight offline scenes. Animation pauses during playback and reading.</small></span><ThemedCheckbox type="checkbox" checked={appearance.videoWallpaper} onChange={event => saveTVAppearance({ ...appearance, videoWallpaper: event.target.checked })} /></label>
    <label className="tv-setting-row"><span><strong>Title previews</strong><small>Play muted previews after focusing a title. Availability depends on the title.</small></span><ThemedCheckbox type="checkbox" checked={appearance.previews} onChange={event => saveTVAppearance({ ...appearance, previews: event.target.checked })} /></label>
    <details className="tv-custom-wallpaper"><summary>Use your own video</summary><label>HTTPS video URL<input type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://example.com/wallpaper.mp4" /></label><button onClick={() => {
      if (!url.startsWith('https:') || !validTVWallpaper(url)) { setMessage('Enter an HTTPS video URL without credentials.'); return; }
      saveTVAppearance({ ...appearance, wallpaper: url }); setMessage('Custom wallpaper selected. A still image is shown if the video cannot play.');
    }}>Apply video</button></details>
    {reduced && <p>Reduced motion is active. Wallpaper is shown as a still image.</p>}
    <p role="status" aria-live="polite">{message}</p>
  </section>;
}
