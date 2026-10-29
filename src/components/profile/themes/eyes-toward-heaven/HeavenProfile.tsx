import { readFrostedConfig } from '../frosted-blast/config';
import { paletteFromSeed } from '../theme-palette';
import ProfileThemeDetails from '../ProfileThemeDetails';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowUpRight, BookOpen, Check, Clock3, Compass, Heart, Image, Settings2, Sparkles } from 'lucide-react';
import { useMotionPreference } from '@/hooks/ui/useMotionPreference';
import { useSettingsModal } from '@/contexts/SettingsModalContext';
import { CosmeticAvatar, CosmeticName } from '@/components/profile/IdentityCosmetics';
import { AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { UserBadges } from '@/components/ui/UserBadges';
import { getBadge, type BadgeDef } from '@/lib/badges';
import { ProfilePresence } from '@/components/profile/ProfilePresence';
import { ProfileSocialActions } from '@/components/profile/ProfileSocialActions';
import { ProfileGallery } from '../reference-worlds/ProfileGallery';
import type { ThemeMediaItem, ThemeRendererProps } from '../types';
import { HEAVEN_POSTER, HEAVEN_VIDEO, heavenDefaults, readHeavenConfig } from './config';
import '../reference-worlds/reference-worlds.css';
import './heaven.css';

function MediaShelf({ items,empty }: { items:ThemeMediaItem[];empty:string }) {
  return items.length ? <div className="eh-media-grid">{items.map(item => <Link key={`${item.href}:${item.id}`} to={item.href} className="eh-media"><div>{item.image ? <img src={item.image} alt="" loading="lazy" /> : <BookOpen size={26} />}<span><ArrowUpRight size={17} /></span></div><strong>{item.title}</strong><small>{item.detail || item.status}</small></Link>)}</div> : <p className="eh-empty">{empty}</p>;
}
export default function HeavenProfile({data,configuration,onBack,preferences}:ThemeRendererProps) {
  const frosted=preferences.selected==='frosted-blast'?readFrostedConfig(configuration):null;
  const colors=frosted?paletteFromSeed(frosted.seed):null;
  const c = frosted ?? readHeavenConfig(configuration) ?? heavenDefaults(); const reduced = useMotionPreference(); const {t} = useTranslation();
  const {openSettings} = useSettingsModal(); const [section,setSection] = useState('overview');
  const [videoFailed,setVideoFailed] = useState(false); const [playing,setPlaying] = useState(false);
  const video = useRef<HTMLVideoElement>(null); const content = useRef<HTMLElement>(null);
  const animate = !frosted && c.motion && !reduced && !videoFailed;
  useEffect(() => {
    const el = video.current; if(!el) return;
    const sync = () => { if(!animate || document.hidden) el.pause(); else void el.play().catch(() => setPlaying(false)); };
    sync(); document.addEventListener('visibilitychange',sync); return () => { document.removeEventListener('visibilitychange',sync); el.pause(); };
  },[animate]);
  useEffect(() => { if(section !== 'overview') content.current?.scrollIntoView({behavior:reduced ? 'auto':'smooth',block:'start'}); },[section,reduced]);
  const name = data.owner.display_name || data.owner.username || t('heaven.traveler');
  const badges = data.badges.map(b => getBadge(b.key)).filter((b):b is BadgeDef => !!b);
  const shelves:Record<string,ThemeMediaItem[]> = {
    favorites:data.favorites,
    anime:data.canViewLibrary ? data.sections?.watchlist ?? data.library:[],
    manga:data.canViewLibrary ? data.sections?.manga ?? []:[],
    novels:data.canViewLibrary ? data.sections?.novels ?? []:[],
    history:data.canViewHistory ? [...data.activity,...(data.sections?.readingHistory ?? [])]:[],
  };
  const restricted = section === 'history' ? !data.canViewHistory : section === 'novels' ? !data.canViewLibrary : ['anime','manga'].includes(section) && !data.canViewLibrary;
  const nav = [{id:'overview',icon:Compass},{id:'favorites',icon:Heart},{id:'gallery',icon:Image},{id:'history',icon:Clock3}];
  const choose = (id:string) => {setSection(id);if(id==='overview') window.scrollTo({top:0,behavior:reduced?'auto':'smooth'});};
  const heading = (id:string) => t(`heaven.${id}`);
  const [date] = useState(() => new Intl.DateTimeFormat(undefined,{month:'short',day:'2-digit',year:'numeric'}).format(new Date()));
  return <main className="eh-world" data-palette={c.palette} data-surface={c.surface} style={{'--eh-dim':c.dim,'--eh-position':`${c.scenePosition}%`,...(colors?{'--eh-ink':colors.ink,'--eh-muted':colors.muted,'--eh-primary':colors.primary,'--eh-tonal':colors.tonal,'--eh-panel':c.surface==='glass'?`color-mix(in srgb,${colors.panel} 82%,transparent)`:colors.panel,'--eh-line':colors.border,'--eh-base':colors.background}:{})} as CSSProperties}>
    <div className="eh-scene" aria-hidden="true"><img src={frosted?.backgroundUrl || HEAVEN_POSTER} alt="" />{animate && <video ref={video} src={HEAVEN_VIDEO} muted playsInline loop preload="metadata" poster={HEAVEN_POSTER} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => setVideoFailed(true)} data-playing={playing} />}<div className="eh-scene-shade" /></div>
    <header className="eh-topbar"><button type="button" className="eh-back" onClick={onBack}><ArrowLeft size={18} /><span>{t('heaven.back')}</span></button><Link to="/" className="eh-wordmark">tatakai<span>✦</span></Link><span className="eh-top-caption">{t('heaven.personalSpace')}</span><div className="eh-top-actions">{data.isOwner && <button type="button" className="eh-tonal" onClick={() => openSettings('profile-store')}><Settings2 size={17} /><span>{t('heaven.customize')}</span></button>}</div></header>
    <nav className="eh-rail" aria-label={t('heaven.navigation')}>{nav.map(({id,icon:Icon}) => <button key={id} type="button" aria-current={section===id?'page':undefined} onClick={() => choose(id)}><span><Icon size={21} /></span><small>{heading(id)}</small></button>)}</nav>
    <div className="eh-main"><section className="eh-hero"><div className="eh-hero-kicker"><span className="eh-eyebrow">{t('heaven.everyStory')}</span><span>{date}</span></div><div className="eh-hero-bottom"><div className="eh-identity"><div className="eh-person"><CosmeticAvatar userId={data.owner.user_id} className="size-14"><AvatarImage src={data.owner.avatar_url || undefined} alt={name} /><AvatarFallback>{name[0]}</AvatarFallback></CosmeticAvatar><div><p>@{data.owner.username || 'traveler'}</p><ProfilePresence userId={data.owner.user_id} /></div></div><h1><CosmeticName userId={data.owner.user_id}>{name}</CosmeticName><span aria-hidden="true">.</span></h1><p className="eh-bio">{data.owner.bio || t('heaven.bioFallback')}</p><div className="eh-hero-buttons"><button type="button" className="eh-filled" onClick={() => choose('favorites')}>{t('heaven.collection')}<ArrowUpRight size={18} /></button>{!data.isOwner && <button type="button" className="eh-outlined" disabled={data.followPending} onClick={data.onFollow}>{data.following ? <Check size={17} />:<PlusIcon />} {data.following ? t('heaven.following'):t('heaven.follow')}</button>}<ProfileSocialActions userId={data.owner.user_id} /></div></div><aside className="eh-moment"><Sparkles size={20} /><span className="eh-eyebrow">{t('heaven.atGlance')}</span><strong>{data.canViewHistory ? data.stats.hours.toFixed(1):data.followers}<small>{data.canViewHistory ? t('heaven.hours'):t('heaven.followers')}</small></strong><div hidden={!data.canViewHistory}><span>{data.stats.completed} {t('heaven.completed')}</span><span>{data.stats.streak} {t('heaven.dayStreak')}</span></div></aside></div></section>
    <section className="eh-content" ref={content}>
      <div className="eh-section-heading"><div><span className="eh-eyebrow">{t('heaven.yourOrbit')}</span><h2>{section==='overview'?t('heaven.collection'):heading(section)}</h2></div><div className="eh-segments">{['anime','manga','novels'].map(id=><button key={id} type="button" aria-pressed={section===id} onClick={() => choose(id)}>{heading(id)}</button>)}</div></div>
      {section==='gallery' ? <article className="eh-panel"><ProfileGallery userId={data.owner.user_id} isOwner={data.isOwner} /></article> : section !== 'overview' ? <article className="eh-panel">{restricted ? <p className="eh-empty">{t('heaven.private')}</p>:<MediaShelf items={shelves[section] ?? []} empty={data.loading?t('heaven.loading'):data.error?t('heaven.error'):t('heaven.empty')} />}</article> : <div className="eh-bento"><article className="eh-panel eh-collection"><div className="eh-panel-heading"><h3>{t('heaven.favorites')}</h3><button type="button" className="eh-icon" aria-label={t('heaven.viewAll')} onClick={() => choose('favorites')}><ArrowUpRight size={20} /></button></div><MediaShelf items={data.favorites.filter(item=>item.kind!=='characters').slice(0,4)} empty={data.loading?t('heaven.loading'):t('heaven.empty')} /></article><article className="eh-panel eh-about"><span className="eh-eyebrow">{t('heaven.about')}</span><p>{data.owner.bio || t('heaven.bioFallback')}</p><div className="eh-about-count"><strong>{data.followers}<span>{t('heaven.followers')}</span></strong>{data.canViewHistory && <strong>{data.stats.completed}<span>{t('heaven.completed')}</span></strong>}</div></article><article className="eh-panel eh-gallery"><div className="eh-panel-heading"><h3>{t('heaven.gallery')}</h3><button type="button" className="eh-icon" aria-label={t('heaven.viewAll')} onClick={() => choose('gallery')}><ArrowUpRight size={20} /></button></div><ProfileGallery userId={data.owner.user_id} isOwner={data.isOwner} preview /></article><article className="eh-panel eh-badges"><div className="eh-panel-heading"><h3>{t('heaven.earnedAlongWay')}</h3><span>{badges.length}</span></div><UserBadges badges={badges} size={26} max={6} />{!badges.length && <p className="eh-empty">{t('heaven.noBadges')}</p>}{data.links.length > 0 && <div className="eh-links">{data.links.map(link=><a key={link.url} href={link.url} target="_blank" rel="noreferrer">{link.label}<ArrowUpRight size={14} /></a>)}</div>}</article></div>}
    </section><footer className="eh-footer"><Link to="/">tatakai</Link><span>{t('heaven.footer')}</span><button type="button" className="eh-icon" aria-label={t('heaven.back')} onClick={onBack}><ArrowLeft size={17} /></button></footer></div>
  <ProfileThemeDetails data={data} themeId={preferences.selected} configuration={configuration} /></main>;
}
function PlusIcon(){return <span aria-hidden="true" style={{fontSize:20,lineHeight:1}}>+</span>;}
