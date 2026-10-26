import { CosmeticAvatar, CosmeticName } from '@/components/profile/IdentityCosmetics';
import { Suspense, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowLeft, Check, Clock, Diamond, Edit3, Flame, Grip, Heart, ImageIcon, Layers, Library, LinkIcon, Loader2, Maximize2, Play, Redo2, Sparkles, Star, Undo2, User, X, Home } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSettingsModal } from '@/contexts/SettingsModalContext';
import { SekaiSelect } from './SekaiSelect';
import SekaiProfileTab from './SekaiProfileTab';
import { cachedProfileImageUrl } from '@/lib/profileImage';
import { SakuraArrival } from './SekaiProfileLoading';
import { useReducedMotion } from 'framer-motion';
import { clamp, defaultSekaiConfig, readSekaiConfig, safeThemeImage, sekaiMascotUrl, type ScrapWidget, type SekaiConfig, type ThemePreferences } from '@/lib/profileThemes';
import { useSaveProfileThemes } from '@/hooks/user/useProfileThemes';
import { getProxiedImageUrl } from '@/lib/api';
import { isTV } from '@/core/tv/device';
import { Seo } from '@/components/seo/Seo';
import { PROFILE_THEMES } from '../registry';
import type { ProfileThemeData, ThemeMediaItem, ThemeRendererProps } from '../types';
import './sekaipop.css';
import './sekaipop-experience.css';
import './sekaipop-music-update.css';
import './sekaipop-polish.css';
import { SekaiMusic } from './SekaiMusic';

const LABELS = { identity: 'Player card', stats: 'My statistics', streaks: 'Watch streak', activity: 'Recent activity', favorites: 'Favorites', library: 'My library', badges: 'Badge collection', links: 'Find me here', clock: 'Clock', calendar: 'Calendar', note: 'Sticky note', image: 'Image sticker', overview: 'Overview', watchlist: 'Watchlist', 'manga-readlist': 'Manga readlist', 'novel-readlist': 'Novel readlist', history: 'History', vault: 'Vault' };
const ICONS = { identity: User, stats: Play, streaks: Flame, activity: Clock, favorites: Heart, library: Library, badges: Star, links: LinkIcon, clock: Clock, calendar: Clock, note: Edit3, image: ImageIcon, overview: Layers, watchlist: Play, 'manga-readlist': Library, 'novel-readlist': Library, history: Clock, vault: Star };
function MediaImage({ src, alt, className }: { src?: string | null; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const url = safeThemeImage(src);
  return url && !failed ? <img src={getProxiedImageUrl(url)} alt={alt} className={className} loading="lazy" onError={() => setFailed(true)} /> : <span className={`sp-image-empty ${className ?? ''}`} role="img" aria-label={alt}><ImageIcon size={24} /></span>;
}
function MediaList({ items, posters = false }: { items: ThemeMediaItem[]; posters?: boolean }) {
  if (!items.length) return <p className="sp-empty">A little space for your next discovery.</p>;
  return <div className={posters ? 'sp-posters' : 'sp-media-list'}>{items.slice(0, posters ? 12 : 8).map((item, index) => <Link key={`${item.id}-${index}`} to={item.href} className="sp-media-item"><MediaImage src={item.image} alt="" /><span>{item.title}{item.detail && <small>{item.detail}</small>}</span></Link>)}</div>;
}
function Wallpaper({ url, x, y, blur, onError }: { url: string; x: number; y: number; blur: number; onError: () => void }) {
  const [fallback, setFallback] = useState(false);
  useEffect(() => setFallback(false), [url]);
  return <div className="sp-wallpaper" aria-hidden="true" style={{ filter: `blur(${blur}px)` }}>{url && <img key={`${url}-${fallback}`} src={fallback ? cachedProfileImageUrl(url) : url} alt="" style={{ objectPosition: `${x}% ${y}%` }} onError={() => { if (!fallback) setFallback(true); else onError(); }} />}</div>;
}
function WidgetContent({ widget, data, now, onOpenTab }: { widget: ScrapWidget; data: ProfileThemeData; now: Date; onOpenTab: (id: string) => void }) {
  const { owner, stats } = data;
  const profileTab = data.tabs?.find(tab => tab.id === widget.kind);
  if (['overview', 'watchlist', 'manga-readlist', 'novel-readlist', 'history', 'vault'].includes(widget.kind)) {
    return profileTab ? <div className="sp-tab-widget"><div className="sp-tab-symbol"><Library size={30} /></div><p>{profileTab.summary}</p><button type="button" onClick={() => onOpenTab(profileTab.id)}>Open {profileTab.label}</button></div> : <p className="sp-empty">This section is private or unavailable.</p>;
  }
  if (widget.kind === 'identity') return <>
    <div className="sp-player-banner">{owner.banner_url ? <MediaImage src={owner.banner_url} alt="Profile banner" /> : <div className="sp-banner-art"><Diamond /><Diamond /><Diamond /></div>}<span className="sp-greeting">{now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening'}</span></div>
    <div className="sp-player-name"><CosmeticAvatar userId={owner.user_id} className="sp-avatar"><MediaImage src={owner.avatar_url} alt={`${owner.display_name || owner.username || 'Player'} avatar`} className="h-full w-full object-cover" /></CosmeticAvatar><div><h1><CosmeticName userId={owner.user_id}>{owner.display_name || owner.username || 'Tatakai player'}</CosmeticName></h1><span>@{owner.username || 'player'}</span></div></div>
    <div className="sp-key-row">{[[data.canViewHistory ? `${stats.hours}h` : 'Private', 'watched'], [data.canViewLibrary ? String(stats.anime) : 'Private', 'anime'], [data.canViewLibrary ? String(stats.manga) : 'Private', 'reading']].map(([value, label], i) => <div className={`sp-key sp-key-${i}`} key={label}><small>{label}</small><strong>{value}</strong></div>)}</div>
    <div className="sp-player-lane"><span>TATAKAI</span><div><i style={{ width: `${clamp(now.getHours() / 24 * 100, 4, 100)}%` }} /><Diamond size={12} /></div><b>{data.canViewHistory ? `${stats.streak}d` : '—'}</b></div>
  </>;
  if (widget.kind === 'stats') return <><div className="sp-stat-hero"><Play size={32} /><div><strong>{data.canViewLibrary ? stats.anime + stats.manga : '—'}</strong><span>stories in my world</span></div></div><div className="sp-key-row">{[[stats.completed, 'completed'], [stats.episodes, 'episodes'], [stats.hours, 'hours']].map(([value, label], i) => <div className={`sp-key sp-key-${i}`} key={label}><small>{label}</small><strong>{label === 'completed' ? data.canViewLibrary ? value : '—' : data.canViewHistory ? value : '—'}</strong></div>)}</div><p className="sp-caption">One more episode? Always.</p></>;
  if (widget.kind === 'streaks') return data.canViewHistory ? <><div className="sp-streak"><Flame size={48} /><strong>{stats.streak}</strong><span>day streak</span></div><div className="sp-lane-label"><span>Longest streak</span><b>{stats.longestStreak} days</b></div><div className="sp-track"><i style={{ width: `${stats.longestStreak ? Math.max(3, stats.streak / stats.longestStreak * 100) : 0}%` }} /></div></> : <p className="sp-empty">Watch activity is private.</p>;
  if (widget.kind === 'library') return data.canViewLibrary ? <MediaList items={data.library} posters /> : <p className="sp-empty">This library is private.</p>;
  if (widget.kind === 'activity') return data.canViewHistory ? <MediaList items={data.activity} /> : <p className="sp-empty">Watch history is private.</p>;
  if (widget.kind === 'favorites') return <MediaList items={data.favorites} posters />;
  if (widget.kind === 'badges') return data.badges.length ? <div className="sp-badges">{data.badges.map(b => <figure key={b.key}><img src={b.image} alt="" loading="lazy" /><figcaption>{b.label}</figcaption></figure>)}</div> : <p className="sp-empty">The collection starts here.</p>;
  if (widget.kind === 'links') return <><p className="sp-bio">{owner.bio || 'A world of stories, one episode at a time.'}</p><div className="sp-links">{data.links.map(link => <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer"><LinkIcon size={14} />{link.label}</a>)}</div>{!data.isOwner && <button type="button" disabled={data.followPending} onClick={data.onFollow}><Heart size={14} />{data.following ? 'Following' : 'Follow'} · {data.followers}</button>}</>;
  if (widget.kind === 'note') return <p className="sp-note-text">{widget.text || 'Your story goes here.'}</p>;
  if (widget.kind === 'image') return <MediaImage src={widget.image || owner.avatar_url} alt={widget.text || 'Profile image sticker'} className="sp-sticker-image" />;
  if (widget.kind === 'calendar') {
    if (!data.canViewCalendar) return <p className="sp-empty">Calendar is private.</p>;
    const first = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
    const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return <><h3 className="sp-month">{now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3><div className="sp-calendar">{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => <b key={d}>{d}</b>)}{Array.from({ length: first }, (_, i) => <span key={`blank-${i}`} />)}{Array.from({ length: days }, (_, i) => <span key={i} className={now.getDate() === i + 1 ? 'today' : ''}>{i + 1}</span>)}</div></>;
  }
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }).split(' ')[0];
  return <><div className="sp-date"><b>{now.getDate()}</b><span><strong>{now.toLocaleDateString(undefined, { weekday: 'long' })}</strong><small>{now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</small></span><small>{now.getHours() >= 12 ? 'PM' : 'AM'}</small></div><div className="sp-clock-digits">{time.split('').map((d, i) => d === ':' ? <span key={i} className="sp-colon"><Diamond size={9} /><Diamond size={9} /></span> : <b key={i}>{d}</b>)}</div><div className="sp-track"><i style={{ width: `${now.getMinutes() / 60 * 100}%` }} /></div><div className="sp-week">{['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((d, i) => <span className={now.getDay() === i ? 'today' : ''} key={d}>{d}</span>)}</div></>;
}

export default function SekaiProfile({ data, configuration, preferences, onBack }: ThemeRendererProps) {
  const { openSettings } = useSettingsModal();
  const [searchParams, setSearchParams] = useSearchParams();
  const initial = readSekaiConfig(configuration) ?? defaultSekaiConfig();
  const [draft, setDraft] = useState<SekaiConfig>(initial);
  const [draftPreferences, setDraftPreferences] = useState(preferences);
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState('');
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | undefined>();
  const [openTab, setOpenTab] = useState<string | null>(null);
  const initialCustomize = useRef(false);
  const [now, setNow] = useState(() => new Date());
  const [undo, setUndo] = useState<{ config: SekaiConfig; preferences: ThemePreferences }[]>([]);
  const [redo, setRedo] = useState<typeof undo>([]);
  const save = useSaveProfileThemes(); const reducedMotion = useReducedMotion();
  const stage = useRef<HTMLDivElement>(null);
  const [stageWidth, setStageWidth] = useState(1144);
  const [stageHeight, setStageHeight] = useState(850);
  const [canvasZoom, setCanvasZoom] = useState<number | null>(null);
  const [panMode, setPanMode] = useState(false);
  const scaleRef = useRef(1);
  const tv = isTV();
  const current = editing ? draft : initial;
  const active = useRef<(() => void) | null>(null);
  useEffect(() => { const interval = window.setInterval(() => setNow(new Date()), 30000); return () => clearInterval(interval); }, []);
  useEffect(() => { const el = stage.current; if (!el) return; const observer = new ResizeObserver(([entry]) => { setStageWidth(entry.contentRect.width); setStageHeight(entry.contentRect.height); }); observer.observe(el); return () => observer.disconnect(); }, []);
  useEffect(() => () => active.current?.(), []);
  useEffect(() => {
    if (!editing) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [editing]);
  const commit = (config: SekaiConfig, nextPreferences = draftPreferences) => {
    setUndo(prev => [...prev.slice(-49), { config: draft, preferences: draftPreferences }]); setRedo([]);
    setDraft(readSekaiConfig(config) ?? draft); setDraftPreferences(nextPreferences);
  };
  const travel = (direction: 'undo' | 'redo') => {
    const from = direction === 'undo' ? undo : redo; const target = from.at(-1); if (!target) return;
    const snapshot = { config: draft, preferences: draftPreferences };
    if (direction === 'undo') { setUndo(from.slice(0, -1)); setRedo(prev => [...prev, snapshot]); }
    else { setRedo(from.slice(0, -1)); setUndo(prev => [...prev, snapshot]); }
    setDraft(target.config); setDraftPreferences(target.preferences);
  };
  const startPointer = (event: ReactPointerEvent<HTMLButtonElement>, widget: ScrapWidget, resize: boolean) => {
    if (!editing || preview || event.button !== 0) return;
    event.preventDefault(); active.current?.();
    const sx = event.clientX; const sy = event.clientY; const scale = scaleRef.current;
    const before = draft; let next = draft;
    const move = (e: PointerEvent) => {
      const dx = (e.clientX - sx) / scale; const dy = (e.clientY - sy) / scale;
      next = { ...before, widgets: before.widgets.map(w => w.id !== widget.id ? w : resize ? { ...w, w: Math.round(clamp(widget.w + dx, 200, Math.min(900, 1144 - w.x))), h: Math.round(clamp(widget.h + dy, 160, Math.min(900, 4000 - w.y))) } : { ...w, x: Math.round(clamp(widget.x + dx, 0, 1144 - w.w)), y: Math.round(clamp(widget.y + dy, 0, 4000 - w.h)) }) };
      setDraft(next);
    };
    const cleanup = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', cancel); active.current = null; };
    const end = () => { cleanup(); if (next !== before) { setUndo(prev => [...prev.slice(-49), { config: before, preferences: draftPreferences }]); setRedo([]); } };
    const cancel = () => { cleanup(); setDraft(before); };
    active.current = cancel;
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', cancel);
  };
  const keyboardMove = (event: React.KeyboardEvent, widget: ScrapWidget, resize: boolean) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); const amount = event.shiftKey ? 20 : 4;
    const dx = event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0;
    const dy = event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0;
    commit({ ...draft, widgets: draft.widgets.map(w => w.id !== widget.id ? w : resize ? { ...w, w: clamp(w.w + dx, 200, Math.min(900, 1144 - w.x)), h: clamp(w.h + dy, 160, Math.min(900, 4000 - w.y)) } : { ...w, x: clamp(w.x + dx, 0, 1144 - w.w), y: clamp(w.y + dy, 0, 4000 - w.h) }) });
  };
  const colors = current.colors;
  const dark = current.mode !== 'light';
  const styles = { '--sp-ink': dark ? '#f0e9fa' : colors.ink, '--sp-outline': colors.ink,
    '--sp-a': colors.primary, '--sp-b': colors.secondary, '--sp-paper': dark ? current.mode === 'darker' ? '#17121e' : '#30243d' : colors.paper,
    '--sp-board': dark ? '#201828' : '#f1e7f6', '--sp-ring': dark ? '#736080' : '#fffdf5',
    '--sp-radius': `${current.radius}px`, '--sp-shadow': `${current.shadow}px`, '--sp-scale': Math.min(stageWidth / 1144, 1) } as CSSProperties;
  const widgets = current.widgets.filter(w => w.visible && (w.kind !== 'calendar' || data.canViewCalendar));
  const canvasHeight = Math.max(850, ...widgets.map(w => w.y + w.h + 48));
  const fitScale = Math.max(0.05, Math.min(stageWidth / 1144, stageHeight / canvasHeight, 1));
  const sceneScale = canvasZoom ?? Math.max(0.85, fitScale);
  scaleRef.current = sceneScale;
  const Editor = PROFILE_THEMES.find(t => t.id === 'sekaipop')!.Editor!;
  const beginEdit = () => { setDraft(initial); setDraftPreferences(preferences); setUndo([]); setRedo([]); setError(''); setEditing(true); };
  useEffect(() => {
    if (data.isOwner && searchParams.get('customize') === '1' && !initialCustomize.current) {
      initialCustomize.current = true; setDraft(initial); setDraftPreferences(preferences); setEditing(true);
      setSearchParams(params => { params.delete('customize'); return params; }, { replace: true });
    }
  }, [data.isOwner, searchParams, setSearchParams, initial, preferences]);
  const requestedTab = searchParams.get('tab');
  useEffect(() => { if (requestedTab) setOpenTab(requestedTab); }, [requestedTab]);
  const activeTab = data.tabs?.find(tab => tab.id === openTab);
  const handleBack = () => { if (editing) { setEditing(false); setPreview(false); } else onBack(); };
  const showScrapbook = () => { setOpenTab(null); if (requestedTab) setSearchParams(params => { params.delete('tab'); return params; }, { replace: true }); };
  const panCanvas = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !stage.current) return;
    const target = event.target as HTMLElement;
    if (target.closest('button,input,textarea,select,a') || (!panMode && target.closest('.sp-widget'))) return;
    event.preventDefault(); active.current?.();
    const view = stage.current; const startX = event.clientX; const startY = event.clientY;
    const left = view.scrollLeft; const top = view.scrollTop;
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (next: PointerEvent) => { if (next.pointerId === event.pointerId) { view.scrollLeft = left - (next.clientX - startX); view.scrollTop = top - (next.clientY - startY); } };
    const end = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end); active.current = null; };
    active.current = end;
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
  };
  return <main className="sp-profile" data-mode={current.mode} data-wallpaper={Boolean(current.wallpaper.url)} data-stickers={current.stickers} data-motion={current.motion && !reducedMotion} data-tv-profile={tv || undefined} style={styles}>
    {current.motion && !reducedMotion && <SakuraArrival />}
    <Seo title={`${data.owner.display_name || data.owner.username || 'Player'} · Tatakai`} description={data.owner.bio || 'A little world of stories on Tatakai.'} />
    <Wallpaper url={current.wallpaper.url} x={current.wallpaper.x} y={current.wallpaper.y} blur={current.wallpaper.blur} onError={() => { if (data.isOwner) setError('This wallpaper image could not load. Use a direct public image link or upload another image in Wallpaper.'); }} />
    <div className="sp-dim" aria-hidden="true" style={{ background: `rgba(0,0,0,${current.wallpaper.dim / 100})` }} />
    <nav className="sp-hover-rail" aria-label="Profile navigation"><div className="sp-rail-items">
      <button type="button" onClick={handleBack} aria-label="Back"><ArrowLeft size={20} /><span>Back</span></button>
      <div className="sp-rail-divider" />
      <button type="button" onClick={showScrapbook} aria-label="Scrapbook" aria-current={!activeTab ? 'page' : undefined}><Home size={20} /><span>Scrapbook</span></button>
      {data.tabs?.map(tab => { const Icon = ICONS[tab.id as keyof typeof ICONS] || Library; return <button type="button" key={tab.id} aria-label={tab.label} aria-current={openTab === tab.id ? 'page' : undefined} onClick={() => setOpenTab(tab.id)}><Icon size={20} /><span>{tab.label}</span></button>; })}
    </div></nav>
    <div className={`sp-workspace ${editing && !preview ? 'sp-editing' : ''}`}>
      <header className="sp-world-header"><div className="sp-header-identity"><span className="sp-header-mark">{data.owner.avatar_url ? <MediaImage src={data.owner.avatar_url} alt="" /> : <Sparkles size={22} />}</span><div><h1 className="sp-brand">{data.owner.display_name || data.owner.username || 'My'}’s Sekai</h1><span className="sp-world-title"><span>Tatakai</span><Diamond size={8} />{activeTab?.label || 'A little world of stories'}</span></div></div>{data.isOwner && <div className="sp-owner-actions"><button type="button" onClick={() => openSettings('profile-store')}><Sparkles size={15} /><span>Collection</span></button>{!editing && <button type="button" className="sp-customize-action" onClick={beginEdit}><Edit3 size={15} /><span>Customize</span></button>}</div>}{!data.isOwner && <button type="button" disabled={data.followPending} onClick={data.onFollow}><Heart size={15} />{data.following ? 'Following' : 'Follow'}</button>}</header>
      {activeTab && <section className="sp-full-section" aria-label={activeTab.label} key={activeTab.id}><header className="sp-plate"><h2>{activeTab.label}</h2><button type="button" onClick={showScrapbook}><X size={15} />Scrapbook</button></header><div className="sp-section-scroll"><SekaiProfileTab data={data} tab={activeTab.id} /></div></section>}
      <div hidden={Boolean(activeTab)} className="sp-scene-container">
      {editing && <div className="sp-edit-toolbar" role="toolbar" aria-label="Profile editor actions"><span><Layers size={16} />{preview ? 'Preview' : 'Edit desktop'}</span><button type="button" disabled={!undo.length || save.isPending} onClick={() => travel('undo')} aria-label="Undo"><Undo2 size={17} /></button><button type="button" disabled={!redo.length || save.isPending} onClick={() => travel('redo')} aria-label="Redo"><Redo2 size={17} /></button><button type="button" onClick={() => setPreview(!preview)}>{preview ? 'Keep editing' : 'Preview'}</button><button type="button" disabled={save.isPending} onClick={() => { setEditing(false); setPreview(false); }}><X size={15} />Cancel</button><button type="button" className="sp-save" disabled={save.isPending} onClick={async () => { setError(''); try { await save.mutateAsync({ ...draftPreferences, selected: 'sekaipop', configurations: { ...draftPreferences.configurations, sekaipop: draft } }); setEditing(false); setPreview(false); } catch (e) { setError(e instanceof Error ? e.message : 'Save failed. Try again.'); } }}>{save.isPending ? <Loader2 size={15} className="sp-spin" /> : <Check size={15} />}Save</button></div>}
      {error && <p className="sp-error" role="alert">{error}</p>}
      {data.error && <p className="sp-error" role="status">Some profile content could not load. Refresh to try again.</p>}
      {data.loading && <p className="sp-help" role="status">Loading your stories…</p>}
      <div className="sp-canvas-controls" role="toolbar" aria-label="Canvas view">
        <button type="button" aria-pressed={panMode} onClick={() => setPanMode(!panMode)}><Grip size={14} />Pan</button>
        <button type="button" aria-label="Zoom out canvas" disabled={sceneScale <= 0.25} onClick={() => setCanvasZoom(Math.max(0.25, sceneScale - 0.1))}>−</button>
        <span>{Math.round(sceneScale * 100)}%</span>
        <button type="button" aria-label="Zoom in canvas" disabled={sceneScale >= 1.5} onClick={() => setCanvasZoom(Math.min(1.5, sceneScale + 0.1))}>+</button>
        <button type="button" onClick={() => setCanvasZoom(1)}>100%</button>
        <button type="button" onClick={() => { setCanvasZoom(fitScale); stage.current?.scrollTo({ left: 0, top: 0 }); }}>Fit all</button>
      </div>
      <div className="sp-composition">
        <div ref={stage} className="sp-stage sp-free-stage" data-panning={panMode} tabIndex={0} aria-label="Scrapbook canvas; drag the background or use arrow keys to pan" onPointerDown={panCanvas} onKeyDown={event => {
          if (event.target !== event.currentTarget || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
          event.preventDefault(); const amount = event.shiftKey ? 120 : 40;
          event.currentTarget.scrollBy({ left: event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0, top: event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0 });
        }}>
          <div className="sp-canvas-space" style={{ width: Math.max(stageWidth, 1144 * sceneScale), height: Math.max(stageHeight, canvasHeight * sceneScale) }}>
          <div className="sp-canvas" style={{ left: Math.max(0, (stageWidth - 1144 * sceneScale) / 2), width: 1144, height: canvasHeight, transform: `scale(${sceneScale})` }}>
            <div className="sp-center-stamp" aria-hidden="true"><Diamond /><span>Stay a little.<br />There’s a whole<br /><em>world</em> here.</span><Star /></div>
            {current.mascot.enabled && <img className="sp-scene-mascot" src={sekaiMascotUrl(current.mascot.key)} alt="" style={{ width: current.mascot.size }} />}
            {widgets.map(widget => {
              const Icon = ICONS[widget.kind]; const title = widget.title || LABELS[widget.kind];
              const width = current.mobile.find(m => m.id === widget.id)?.width;
              return <section key={widget.id} className={`sp-widget sp-widget-${widget.kind} ${width === 'half' ? 'sp-half' : ''}`} aria-label={title} style={{ left: widget.x, top: widget.y, width: widget.w, height: widget.h, zIndex: widget.z, transform: `rotate(${widget.rotation}deg)` }}>
                {editing && !preview && <div className="sp-widget-handles"><button type="button" aria-label={`Move ${title}; use arrow keys`} onPointerDown={e => startPointer(e, widget, false)} onKeyDown={e => keyboardMove(e, widget, false)}><Grip size={16} /><span>Move</span></button><button type="button" aria-label={`Resize ${title}; use arrow keys`} onPointerDown={e => startPointer(e, widget, true)} onKeyDown={e => keyboardMove(e, widget, true)}><Maximize2 size={16} /></button></div>}
                <div className="sp-card-inner">{widget.kind !== 'identity' && <header className="sp-widget-heading"><Icon size={16} /><h2>{title}</h2>{widget.kind === 'note' && data.isOwner && <button type="button" className="sp-edit-note" aria-label={`Edit ${title}`} onClick={() => { if (!editing) beginEdit(); setSelectedWidgetId(widget.id); }}><Edit3 size={12} />Edit</button>}</header>}<div className="sp-widget-content"><WidgetContent widget={widget} data={data} now={now} onOpenTab={setOpenTab} /></div></div>
              </section>;
            })}
          </div>
          </div>
        </div>
        {editing && !preview && <fieldset className="sp-editor-fieldset" disabled={save.isPending}><Suspense fallback={<div className="sp-editor">Opening editor…</div>}><Editor configuration={draft} preferences={draftPreferences} selectedWidgetId={selectedWidgetId} onChange={value => { const next = readSekaiConfig(value); if (next) commit(next); }} onPresets={presets => commit(draft, { ...draftPreferences, presets })} /></Suspense><div className="sp-default-switch"><span>Profile theme</span><SekaiSelect label="Profile theme" value="sekaipop" disabled={save.isPending} options={[{ value: 'sekaipop', label: 'SekaiPop' }, { value: 'default', label: 'Default Tatakai' }]} onChange={async value => {
          if (value === 'default') { setError(''); try { await save.mutateAsync({ ...draftPreferences, selected: 'default', configurations: { ...draftPreferences.configurations, sekaipop: draft } }); setEditing(false); } catch (err) { setError(err instanceof Error ? err.message : 'Could not switch theme.'); } }
        }} /></div></fieldset>}
      </div>
      </div>
      <SekaiMusic music={current.music} mascot={current.mascot} isOwner={data.isOwner} onEdit={() => openSettings('profile-store', 'music')} />
    </div>
  </main>;
}
