import { randomUUID } from '../../../../lib/uuid';
import { useEffect, useRef, useState } from 'react';
import { Copy, Plus, Trash2, ArrowUp, ArrowDown, ImagePlus, RotateCcw } from 'lucide-react';
import { applyScrapbookLayout, defaultSekaiConfig, makeWidget, mobileWidgets, moveMobileWidget, readSekaiConfig, safeThemeImage, SEKAI_PALETTES, SEKAI_WALLPAPERS, SEKAI_MASCOTS, sekaiMascotUrl, WIDGET_KINDS, type SekaiConfig, type ScrapWidget, type WidgetKind } from '@/lib/profileThemes';
import type { ThemeEditorProps } from '../types';
import { uploadProfileImage } from '@/lib/profileMedia';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { SekaiSelect } from './SekaiSelect';
import { cachedProfileImageUrl } from '@/lib/profileImage';
import { listUserMedia } from '@/lib/userMedia';
import { prepareProfileThemeImage } from '@/lib/profileThemeMedia';
import { detectProfileMusic, findProfileLyrics, profileYouTubeId, safeProfileAudio } from '@/lib/profileThemeMusic';

const WIDGET_LABELS: Record<WidgetKind, string> = { identity: 'Player card', stats: 'My statistics', streaks: 'Watch streak', activity: 'Recent activity', favorites: 'Favorites', library: 'My library', badges: 'Badge collection', links: 'Find me here', clock: 'Clock', calendar: 'Calendar', note: 'Sticky note', image: 'Image sticker', overview: 'Overview', watchlist: 'Watchlist', 'manga-readlist': 'Manga readlist', 'novel-readlist': 'Novel readlist', history: 'History', vault: 'Vault' };

function WidgetNumber({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  const [input, setInput] = useState(String(value));
  useEffect(() => setInput(String(value)), [value]);
  return <label className="sp-field">{label}<input type="number" inputMode="numeric" min={min} max={max} step={1} value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} onBlur={() => {
    const number = input.trim() ? Number(input) : NaN;
    const next = Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : value;
    setInput(String(next)); if (next !== value) onChange(next);
  }} /></label>;
}

export default function SekaiEditor({ configuration, onChange, preferences, onPresets, selectedWidgetId, initialSection }: ThemeEditorProps) {
  const config = readSekaiConfig(configuration) ?? defaultSekaiConfig();
  const { user } = useAuth();
  const [tab, setTab] = useState('Widgets');
  const [selected, setSelected] = useState(config.widgets[0].id);
  const [presetName, setPresetName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [wallpaperLink, setWallpaperLink] = useState(config.wallpaper.url);
  const [imageLink, setImageLink] = useState('');
  const [audioLink, setAudioLink] = useState(config.music.url);
  const [detectingMusic, setDetectingMusic] = useState(false);
  const [musicStatus, setMusicStatus] = useState('');
  const musicRequest = useRef<AbortController | null>(null);
  useEffect(() => () => musicRequest.current?.abort(), []);
  const [wallpaperPreviewFailed, setWallpaperPreviewFailed] = useState(false);
  const [uploadedWallpapers, setUploadedWallpapers] = useState<{ title: string; url: string }[]>([]);
  useEffect(() => {
    const userId = user?.id;
    if (tab !== 'Wallpaper' || !userId) return;
    let cancelled = false;
    void listUserMedia(userId).then(files => { if (!cancelled) setUploadedWallpapers(files.filter(f => f.category === 'banner').map(f => ({ title: f.name, url: f.url }))); }).catch(() => { if (!cancelled) setError('Your uploaded collection could not load. You can still choose the original wallpaper or paste a link.'); });
    return () => { cancelled = true; };
  }, [tab, user?.id]);
  const latest = useRef(config);
  latest.current = config;
  useEffect(() => { if (selectedWidgetId) { setSelected(selectedWidgetId); setTab('Widgets'); } }, [selectedWidgetId]);
  useEffect(() => { if (initialSection) setTab(initialSection); }, [initialSection]);
  useEffect(() => setAudioLink(config.music.url), [config.music.url]);
  useEffect(() => setWallpaperLink(config.wallpaper.url), [config.wallpaper.url]);
  useEffect(() => setWallpaperPreviewFailed(false), [config.wallpaper.url]);
  const patch = (p: Partial<SekaiConfig>) => onChange({ ...config, ...p });
  const widget = config.widgets.find(w => w.id === selected);
  useEffect(() => setImageLink(widget?.image ?? ''), [widget?.id, widget?.image]);
  const patchWidget = (p: Partial<ScrapWidget>) => patch({ widgets: config.widgets.map(w => w.id === selected ? { ...w, ...p } : w) });
  const detectMusic = async (applyLink: boolean) => {
    const url = applyLink ? safeProfileAudio(audioLink) : config.music.url;
    if (!url) { setError('Paste a valid HTTPS YouTube, YouTube Music, or audio link.'); return; }
    if (applyLink) onChange({ ...latest.current, music: { ...latest.current.music, url, ...(url !== latest.current.music.url ? { title: '', artist: '', lyrics: '' } : {}) } });
    if (applyLink && !profileYouTubeId(url)) { setError(''); setMusicStatus('Audio link applied. Enter its title and artist, then choose Find lyrics.'); return; }
    musicRequest.current?.abort(); const request = new AbortController(); musicRequest.current = request;
    setDetectingMusic(true); setMusicStatus('Identifying the song and looking for lyrics…'); setError('');
    try {
      const result = applyLink ? await detectProfileMusic(url, request.signal) : await findProfileLyrics(config.music.title, config.music.artist, request.signal);
      if (request.signal.aborted || latest.current.music.url !== url) return;
      onChange({ ...latest.current, music: { ...latest.current.music, url, title: result.title, artist: result.artist, ...(result.lyrics ? { lyrics: result.lyrics } : {}) } });
      setMusicStatus(result.status === 'synced' ? 'Song identified with synchronized lyrics. Review the match, then Save.' : result.status === 'plain' ? 'Song identified. Lyrics are available without timestamps.' : result.status === 'instrumental' ? 'This track is listed as instrumental.' : result.status === 'unavailable' ? 'Song identified. The lyrics service is temporarily unavailable; retry Find lyrics later or import an LRC file.' : 'Song identified, but no confident lyrics match was found. Edit the title/artist and retry, or import an LRC file.');
    } catch (e) { if (!request.signal.aborted) { setMusicStatus(''); setError(e instanceof Error ? e.message : 'Music lookup failed. You can enter the song details manually.'); } }
    finally { if (musicRequest.current === request) setDetectingMusic(false); }
  };
  const add = (kind: WidgetKind) => {
    if (config.widgets.length >= 32) return;
    const existing = config.widgets.find(w => w.kind === kind);
    if (existing && kind !== 'note' && kind !== 'image') { setSelected(existing.id); patch({ widgets: config.widgets.map(w => w.id === existing.id ? { ...w, visible: true } : w) }); return; }
    const next = { ...makeWidget(kind), id: `${kind}-${randomUUID()}`, x: 400, y: 100, z: Math.min(100, Math.max(...config.widgets.map(w => w.z)) + 1) };
    patch({ widgets: [...config.widgets, next] }); setSelected(next.id);
  };
  const upload = async (file: File | undefined, target: 'wallpaper' | 'image') => {
    if (!file) return;
    if (!user) { setError('Sign in before uploading an image.'); return; }
    const targetWidgetId = selected;
    setUploading(true); setError('');
    try {
      const prepared = await prepareProfileThemeImage(file);
      const media = await uploadProfileImage(supabase, prepared, user.id, 'banner');
      const current = latest.current;
      if (target === 'wallpaper') onChange({ ...current, wallpaper: { ...current.wallpaper, url: media.url } });
      else onChange({ ...current, widgets: current.widgets.map(w => w.id === targetWidgetId ? { ...w, image: media.url } : w) });
    } catch (e) { setError(e instanceof Error ? e.message : 'Upload failed. Try again.'); }
    finally { setUploading(false); }
  };
  const range = (label: string, value: number, min: number, max: number, change: (v: number) => void, step = 1) => <label className="sp-field">{label}<span>{value}</span><input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={e => change(Number(e.target.value))} /></label>;
  return <aside className="sp-editor" aria-label="Edit scrapbook">
    <header className="sp-plate"><h2>Edit profile</h2><span>Make yourself at home.</span></header>
    <div className="sp-tabs" role="tablist" aria-label="Customization sections">{['Widgets', 'Theme', 'Wallpaper', 'Music', 'Mascots', 'Layout', 'Presets'].map(t => <button type="button" role="tab" aria-selected={tab === t} id={`sp-tab-${t}`} aria-controls="sp-editor-panel" className={tab === t ? 'active' : ''} onClick={() => setTab(t)} key={t}>{t}</button>)}</div>
    <div key={tab} id="sp-editor-panel" role="tabpanel" aria-labelledby={`sp-tab-${tab}`} className="sp-editor-body">
      {tab === 'Widgets' && <>
        <p className="sp-help">Add a widget, then drag its handle on the canvas. Notes and image cards are public profile content.</p>
        <div className="sp-widget-shelf">{WIDGET_KINDS.map(kind => <button type="button" key={kind} disabled={config.widgets.length >= 32 && !config.widgets.some(w => w.kind === kind)} onClick={() => add(kind)}><Plus size={14} />{WIDGET_LABELS[kind]}</button>)}</div>
        <div className="sp-field"><span>Edit widget</span><SekaiSelect label="Edit widget" value={selected} onChange={setSelected} options={config.widgets.map(w => ({ value: w.id, label: `${w.title || WIDGET_LABELS[w.kind]}${!w.visible ? ' (hidden)' : ''}` }))} /></div>
        <div className="sp-note-shortcuts">{config.widgets.filter(w => w.kind === 'note').map((note, index) => <button type="button" key={note.id} aria-pressed={selected === note.id} onClick={() => setSelected(note.id)}>Edit {note.title || `sticky note ${index + 1}`}</button>)}</div>
        {widget && <>
          <label className="sp-field">Card title<input maxLength={60} value={widget.title} onChange={e => patchWidget({ title: e.target.value })} placeholder={WIDGET_LABELS[widget.kind]} /></label>
          {widget.kind !== 'identity' && <label className="sp-toggle"><input type="checkbox" checked={widget.visible} onChange={e => patchWidget({ visible: e.target.checked })} />Show widget</label>}
          {widget.kind === 'note' && <label className="sp-field">Public note<textarea maxLength={2000} value={widget.text} onChange={e => patchWidget({ text: e.target.value })} rows={5} /></label>}
          {widget.kind === 'image' && <>
            <label className="sp-field">Image URL (HTTPS)<input type="url" value={imageLink} onChange={e => setImageLink(e.target.value)} placeholder="https://example.com/image.jpg" /></label>
            <button type="button" onClick={() => { const url = safeThemeImage(imageLink.trim()); if (!url) { setError('Paste a direct HTTPS image URL.'); return; } setError(''); patchWidget({ image: url }); }}>Apply image link</button>
            <label className="sp-upload"><ImagePlus size={16} />{uploading ? 'Uploading…' : 'Upload public image'}<input aria-label="Upload image card" type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,.svg" disabled={uploading} onChange={e => void upload(e.target.files?.[0], 'image')} /></label>
            <label className="sp-field">Image description<input maxLength={2000} value={widget.text} onChange={e => patchWidget({ text: e.target.value })} /></label>
          </>}
          <div className="sp-pair"><WidgetNumber label="Rotation" value={widget.rotation} min={-12} max={12} onChange={rotation => patchWidget({ rotation })} /><WidgetNumber label="Layer" value={widget.z} min={0} max={100} onChange={z => patchWidget({ z })} /></div>
          <div className="sp-pair"><WidgetNumber label="X position" value={widget.x} min={0} max={1144 - widget.w} onChange={x => patchWidget({ x })} /><WidgetNumber label="Y position" value={widget.y} min={0} max={4000 - widget.h} onChange={y => patchWidget({ y })} /></div>
          <div className="sp-pair"><WidgetNumber label="Width" value={widget.w} min={200} max={Math.min(900, 1144 - widget.x)} onChange={w => patchWidget({ w })} /><WidgetNumber label="Height" value={widget.h} min={160} max={Math.min(900, 4000 - widget.y)} onChange={h => patchWidget({ h })} /></div>
          <div className="sp-pair">
            {['note', 'image'].includes(widget.kind) && <button type="button" disabled={config.widgets.length >= 32} onClick={() => { const copy = { ...widget, id: `${widget.kind}-${randomUUID()}`, x: Math.min(1144 - widget.w, widget.x + 24), y: Math.min(4000 - widget.h, widget.y + 24) }; patch({ widgets: [...config.widgets, copy] }); setSelected(copy.id); }}><Copy size={14} />Duplicate</button>}
            {widget.kind !== 'identity' && <button type="button" onClick={() => { patch({ widgets: config.widgets.filter(w => w.id !== widget.id), mobile: config.mobile.filter(m => m.id !== widget.id) }); setSelected(config.widgets.find(w => w.kind === 'identity')!.id); }}><Trash2 size={14} />Remove</button>}
          </div>
        </>}
      </>}
      {tab === 'Theme' && <>
        <h3>Choose your colors</h3><div className="sp-palettes">{Object.entries(SEKAI_PALETTES).map(([key, p]) => <button type="button" key={key} aria-pressed={config.palette === key} onClick={() => patch({ palette: key, colors: { ink: p.ink, primary: p.primary, secondary: p.secondary, paper: p.paper } })}><span className="sp-swatch" style={{ background: p.primary, borderColor: p.ink }} /><span className="sp-swatch" style={{ background: p.secondary, borderColor: p.ink }} />{p.name}</button>)}</div>
        <div className="sp-field"><span>Appearance</span><SekaiSelect label="Appearance" value={config.mode} onChange={mode => patch({ mode: mode as SekaiConfig['mode'] })} options={['light', 'dark', 'darker'].map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) }))} /></div>
        <div className="sp-pair">{Object.entries(config.colors).map(([key, color]) => <label className="sp-field" key={key}>{key}<input aria-label={`${key} color`} type="color" value={color} onChange={e => patch({ palette: 'custom', colors: { ...config.colors, [key]: e.target.value } })} /></label>)}</div>
        {range('Card corners', config.radius, 4, 28, radius => patch({ radius }))}
        {range('Shadow depth', config.shadow, 0, 10, shadow => patch({ shadow }))}
        <label className="sp-toggle"><input type="checkbox" checked={config.stickers} onChange={e => patch({ stickers: e.target.checked })} />Sticker details</label>
        <label className="sp-toggle"><input type="checkbox" checked={config.motion} onChange={e => patch({ motion: e.target.checked })} />Playful motion (respects reduced motion)</label>
      </>}
      {tab === 'Wallpaper' && <>
        <h3>Wallpaper collection</h3>
        <div className="sp-wallpaper-gallery">{[...SEKAI_WALLPAPERS, ...uploadedWallpapers, ...preferences.presets.flatMap(preset => { const saved = readSekaiConfig(preset.configuration); return preset.theme === 'sekaipop' && saved?.wallpaper.url ? [{ title: preset.name, url: saved.wallpaper.url }] : []; })].filter((item, index, all) => all.findIndex(other => other.url === item.url) === index).map(item => <button type="button" key={item.url} aria-pressed={config.wallpaper.url === item.url} onClick={() => { setError(''); patch({ wallpaper: { ...config.wallpaper, url: item.url } }); }}><img src={cachedProfileImageUrl(item.url)} alt="" loading="lazy" /><span>{item.title}</span></button>)}</div>
        <button type="button" onClick={() => onChange(defaultSekaiConfig())}>Apply SekaiPop original layout & wallpaper</button>
        <a href="https://wallhaven.cc/" target="_blank" rel="noopener noreferrer" className="sp-wallhaven-link">Browse Wallhaven wallpapers</a>
        <p className="sp-help">Use your own artwork, or leave this empty for the SekaiPop scrapbook board.</p>
        <label className="sp-field">Wallpaper URL (HTTPS)<input type="url" value={wallpaperLink} onChange={e => setWallpaperLink(e.target.value)} placeholder="https://example.com/wallpaper.jpg" /></label>
        <button type="button" onClick={() => { const url = safeThemeImage(wallpaperLink.trim()); if (!url) { setError('Paste a direct HTTPS image URL, then choose Apply wallpaper link.'); return; } setError(''); patch({ wallpaper: { ...config.wallpaper, url } }); }}>Apply wallpaper link</button>
        <p className="sp-help">Paste a direct image link, choose Apply wallpaper link, then Save your profile. A gallery or webpage link will not work.</p>
        {config.wallpaper.url && <div className="sp-wallpaper-preview"><img src={cachedProfileImageUrl(config.wallpaper.url)} alt="Applied wallpaper preview" onError={() => setWallpaperPreviewFailed(true)} /><span>{wallpaperPreviewFailed ? 'Image could not load. Check that this is a public image link.' : 'Applied to preview · Save to keep it'}</span></div>}
        <label className="sp-upload"><ImagePlus size={16} />{uploading ? 'Uploading…' : 'Upload wallpaper'}<input aria-label="Upload wallpaper" type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,.svg" disabled={uploading} onChange={e => void upload(e.target.files?.[0], 'wallpaper')} /></label>
        {range('Horizontal crop', config.wallpaper.x, 0, 100, x => patch({ wallpaper: { ...config.wallpaper, x } }))}
        {range('Vertical crop', config.wallpaper.y, 0, 100, y => patch({ wallpaper: { ...config.wallpaper, y } }))}
        {range('Dim wallpaper', config.wallpaper.dim, 0, 80, dim => patch({ wallpaper: { ...config.wallpaper, dim } }))}
        {range('Blur wallpaper', config.wallpaper.blur, 0, 20, blur => patch({ wallpaper: { ...config.wallpaper, blur } }))}
        <button type="button" onClick={() => patch({ wallpaper: { ...config.wallpaper, url: '' } })}>Remove wallpaper</button>
      </>}
      {tab === 'Layout' && <>
        <button type="button" onClick={() => onChange(applyScrapbookLayout(config))}>Scrapbook remix — keep my content</button>
        <h3>Phone & TV reading order</h3><p className="sp-help">Separate from desktop positions. Half-width cards share a row on phones; TV always uses full width.</p>
        {mobileWidgets(config).map((w, index, all) => <div key={w.id} className="sp-order-row"><span>{w.title || WIDGET_LABELS[w.kind]}</span><button type="button" aria-label={`Move ${WIDGET_LABELS[w.kind]} up`} disabled={index === 0} onClick={() => onChange(moveMobileWidget(config, w.id, -1))}><ArrowUp size={14} /></button><button type="button" aria-label={`Move ${WIDGET_LABELS[w.kind]} down`} disabled={index === all.length - 1} onClick={() => onChange(moveMobileWidget(config, w.id, 1))}><ArrowDown size={14} /></button><SekaiSelect label={`${WIDGET_LABELS[w.kind]} phone width`} value={config.mobile.find(m => m.id === w.id)?.width ?? 'full'} onChange={width => patch({ mobile: [...config.mobile.filter(m => m.id !== w.id), { id: w.id, width: width as 'half' | 'full' }] })} options={[{ value: 'full', label: 'Full' }, { value: 'half', label: 'Half' }]} /></div>)}
        <button type="button" onClick={() => patch({ mobile: [] })}>Use desktop reading order</button>
      </>}
      {tab === 'Music' && <>
        <label className="sp-toggle"><input type="checkbox" checked={config.music.autoplay} onChange={e => patch({ music: { ...config.music, autoplay: e.target.checked } })} />Start music when visitors arrive</label>
        <p className="sp-help">Playing your saved track enables this preference. Pausing with the profile controls disables it. Visitors may need to tap Play if their browser blocks automatic sound.</p>
        <h3>A soundtrack for your world</h3><p className="sp-help">Paste a YouTube or YouTube Music video link to identify the song and find lyrics automatically. Direct MP3, OGG, WAV, and M4A links also work.</p>
        <label className="sp-field">Music URL<input type="url" value={audioLink} onChange={e => { musicRequest.current?.abort(); setDetectingMusic(false); setMusicStatus(''); setAudioLink(e.target.value); }} placeholder="https://www.youtube.com/watch?v=…" /></label>
        <button type="button" disabled={detectingMusic} onClick={() => void detectMusic(true)}>{detectingMusic ? 'Detecting song…' : 'Apply link & detect song'}</button>
        {musicStatus && <p className="sp-help" role="status">{musicStatus}</p>}
        <label className="sp-field">Song title<input maxLength={100} value={config.music.title} onChange={e => patch({ music: { ...config.music, title: e.target.value } })} /></label>
        <label className="sp-field">Artist<input maxLength={100} value={config.music.artist} onChange={e => patch({ music: { ...config.music, artist: e.target.value } })} /></label>
        <button type="button" disabled={detectingMusic || !config.music.title.trim()} onClick={() => void detectMusic(false)}>Find lyrics using this title & artist</button>
        {range('Starting volume', Math.round(config.music.volume * 100), 0, 100, volume => patch({ music: { ...config.music, volume: volume / 100 } }))}
        <label className="sp-field">Timed lyrics (LRC)<textarea rows={8} maxLength={20000} value={config.music.lyrics} onChange={e => patch({ music: { ...config.music, lyrics: e.target.value } })} placeholder={'[00:05.00] First line\n[00:10.50] Next line'} /></label>
        <label className="sp-upload">Import .lrc lyrics<input type="file" accept=".lrc,.txt,text/plain" aria-label="Import lyrics" onChange={async e => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 100000) { setError('Choose a lyrics file smaller than 100KB.'); return; } const lyrics = (await file.text()).slice(0,20000); onChange({ ...latest.current, music: { ...latest.current.music, lyrics } }); }} /></label>
        <button type="button" onClick={() => patch({ music: { ...config.music, url: '', lyrics: '' } })}>Remove music</button>
      </>}
      {tab === 'Mascots' && <>
        <h3>Your little companion</h3><label className="sp-toggle"><input type="checkbox" checked={config.mascot.enabled} onChange={e => patch({ mascot: { ...config.mascot, enabled: e.target.checked } })} />Show Tatakai mascots</label>
        <div className="sp-mascot-gallery">{SEKAI_MASCOTS.map(mascot => <button type="button" key={mascot.key} aria-pressed={config.mascot.key === mascot.key} onClick={() => patch({ mascot: { ...config.mascot, key: mascot.key } })}><img src={sekaiMascotUrl(mascot.key)} alt="" loading="lazy" /><span>{mascot.name}</span></button>)}</div>
        {range('Mascot size', config.mascot.size, 60, 220, size => patch({ mascot: { ...config.mascot, size } }))}
      </>}
      {tab === 'Presets' && <>
        <p className="sp-help">Save up to eight layouts. Presets are saved to your account when you save the profile.</p>
        <label className="sp-field">Preset name<input value={presetName} maxLength={40} onChange={e => setPresetName(e.target.value)} /></label>
        <button type="button" disabled={!presetName.trim() || preferences.presets.length >= 8} onClick={() => { onPresets([...preferences.presets, { id: randomUUID(), name: presetName.trim(), theme: 'sekaipop', configuration: config }]); setPresetName(''); }}><Plus size={14} />Save preset</button>
        {preferences.presets.filter(p => p.theme === 'sekaipop').map(p => <div className="sp-order-row" key={p.id}><button type="button" onClick={() => { const restored = readSekaiConfig(p.configuration); if (restored) onChange(restored); else setError('This preset uses an unsupported version.'); }}>{p.name}</button><button type="button" aria-label={`Delete ${p.name}`} onClick={() => onPresets(preferences.presets.filter(item => item.id !== p.id))}><Trash2 size={14} /></button></div>)}
        <button type="button" onClick={() => onChange(defaultSekaiConfig())}><RotateCcw size={14} />Reset starter layout</button>
      </>}
      {error && <p className="sp-error" role="alert">{error}</p>}
    </div>
  </aside>;
}
