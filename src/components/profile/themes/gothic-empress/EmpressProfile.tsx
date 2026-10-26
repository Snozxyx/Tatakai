import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Crown, Flame, Heart, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Seo } from '@/components/seo/Seo';
import { useSettingsModal } from '@/contexts/SettingsModalContext';
import { EmpressCollection, EmpressEmpty, EmpressImage, EmpressName, EmpressPortrait, EmpressSigil } from './EmpressComponents';
import { EmpressScene } from './EmpressScene';
import { defaultEmpressConfig, readEmpressConfig } from './config';
import type { ProfileThemeData, ThemeRendererProps } from '../types';
import './empress.css';
import './empress-cinematic.css';

const Vault = lazy(() => import('./EmpressVault'));
function EmpressCalendar() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = window.setInterval(() => setNow(new Date()), 60000); return () => clearInterval(id); }, []);
  const first = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return <section className="ge-calendar"><header><span className="ge-eyebrow">THE PASSAGE OF TIME</span><h3>{now.toLocaleDateString(undefined, { month: 'long' })} <em>{now.getFullYear()}</em></h3></header><div className="ge-calendar-grid">{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => <b key={d}>{d}</b>)}{Array.from({ length: first }, (_, i) => <span key={`empty-${i}`} />)}{Array.from({ length: days }, (_, i) => <span key={i} aria-current={now.getDate() === i + 1 ? 'date' : undefined}>{i + 1}</span>)}</div><p>Every day, another chapter.</p></section>;
}
function EmpressStreak({ data }: { data: ProfileThemeData }) {
  return <section className="ge-streak"><Flame aria-hidden="true" /><div><strong>{data.canViewHistory ? data.stats.streak : '—'}</strong><span>days of devotion</span></div><p>{data.canViewHistory ? `Longest reign · ${data.stats.longestStreak} days` : 'Watch activity is private.'}</p><div className="ge-streak-track"><i style={{ width: `${data.canViewHistory && data.stats.longestStreak ? Math.min(100, data.stats.streak / data.stats.longestStreak * 100) : 0}%` }} /></div></section>;
}
function EmpressOverview({ data }: { data: ProfileThemeData }) {
  return <div className="ge-overview">
    <section className="ge-devotion"><header><span className="ge-eyebrow">I / THE CHRONICLE</span><h2>THE STORY <em>ARCHIVE</em></h2></header><dl>{[[data.canViewLibrary ? data.stats.anime : '—', 'Anime collected', 'I'], [data.canViewLibrary ? data.stats.manga : '—', 'Manga collected', 'II'], [data.canViewHistory ? data.stats.episodes : '—', 'Episodes watched', 'III'], [data.canViewHistory ? `${data.stats.hours}h` : '—', 'Hours devoted', 'IV']].map(([value, label, roman]) => <div key={label}><span>{roman}</span><dd>{value}</dd><dt>{label}</dt></div>)}</dl></section>
    <div className="ge-overview-columns"><div className="ge-overview-main"><section className="ge-activity"><header><span className="ge-eyebrow">II / ECHOES</span><h2>RECENT ECHOES</h2></header>{!data.canViewHistory ? <EmpressEmpty private>This history is private.</EmpressEmpty> : data.activity.length ? <ol>{data.activity.slice(0, 5).map((item, i) => <li key={`${item.id}-${i}`}><span className="ge-timeline-node" /><Link to={item.href}><EmpressImage src={item.image} /><div><small>CHAPTER {String(i + 1).padStart(2, '0')}</small><h3>{item.title}</h3><p>{item.detail || 'Recently watched'}</p></div><ArrowUpRight aria-hidden="true" /></Link></li>)}</ol> : <EmpressEmpty>Your next chapter is waiting.</EmpressEmpty>}</section>
    <section className="ge-favorites"><header><span className="ge-eyebrow">III / THE CHOSEN</span><h2>THE CHOSEN</h2></header>{data.favorites.length ? <div className="ge-favorite-row">{data.favorites.slice(0, 6).map((item, i) => <Link to={item.href} key={`${item.id}-${i}`}><div><EmpressImage src={item.image} /><Heart aria-hidden="true" /></div><span>{item.title}</span></Link>)}</div> : <EmpressEmpty>No favorite characters yet.</EmpressEmpty>}</section></div><aside><EmpressStreak data={data} />{data.canViewCalendar && <EmpressCalendar />}</aside></div>
  </div>;
}

export default function EmpressProfile({ data, configuration, onBack }: ThemeRendererProps) {
  const config = readEmpressConfig(configuration) ?? defaultEmpressConfig();
  const { openSettings } = useSettingsModal();
  const [params, setParams] = useSearchParams();
  const name = data.owner.display_name || data.owner.username || 'Wanderer';
  const tabs = data.tabs ?? [{ id: 'overview', label: 'Overview', summary: '' }];
  const requested = params.get('tab');
  const active = tabs.some(t => t.id === requested) ? requested! : 'overview';
  const labels: Record<string, string> = { overview: 'The throne', watchlist: 'Anime archives', 'manga-readlist': 'Manga grimoire', 'novel-readlist': 'Novel volumes', history: 'The chronicle', streaks: 'Devotion', vault: 'The treasury' };
  const collections = { watchlist: data.canViewLibrary ? data.sections?.watchlist ?? data.library : [], 'manga-readlist': data.canViewLibrary ? data.sections?.manga ?? [] : [], 'novel-readlist': data.isOwner ? data.sections?.novels ?? [] : [], history: data.canViewHistory ? [...data.activity, ...(data.sections?.readingHistory ?? [])] : [] };
  const openTab = (id: string) => setParams(p => { if (id === 'overview') p.delete('tab'); else p.set('tab', id); return p; }, { replace: true });
  const tabKeyboard = (e: React.KeyboardEvent, index: number) => {
    const next = e.key === 'ArrowRight' ? (index + 1) % tabs.length : e.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault(); openTab(tabs[next].id); document.getElementById(`ge-tab-${tabs[next].id}`)?.focus();
  };
  return <main className="ge-profile">
    <Seo title={name} description={`${name}'s profile on Tatakai.`} />
    <header className="ge-topbar"><Button variant="ghost" className="ge-back" onClick={onBack}><ArrowLeft data-icon="inline-start" />Back</Button><Link to="/" className="ge-wordmark">TATAKAI<span>@{data.owner.username || name} / PROFILE</span></Link><div className="ge-top-actions">{data.isOwner && <Button variant="ghost" onClick={() => openSettings('profile-store')}><Settings2 data-icon="inline-start" /><span>Profile store</span></Button>}</div></header>
    <section className="ge-hero" data-awakened="true" aria-label={`${name}'s profile banner`}><EmpressScene paused={!config.motion} intensity={config.embers} /><div className="ge-cinema-frame" aria-hidden="true"><i /><i /><i /><i /></div><div className="ge-hero-coordinate" aria-hidden="true">{data.canViewHistory ? `${data.stats.hours}H WATCHED` : 'PRIVATE HISTORY'}<br />{data.canViewLibrary ? `${data.stats.anime + data.stats.manga} STORIES COLLECTED` : 'PRIVATE LIBRARY'}</div><div className="ge-hero-copy"><span className="ge-eyebrow"><span />@{data.owner.username || 'wanderer'}</span><p><em><EmpressName userId={data.owner.user_id} name={name} /></em></p><span className="ge-hero-subtitle">{data.owner.bio?.split('\n')[0] || 'Welcome to my profile.'}</span></div><div className="ge-hero-bottom" aria-hidden="true"><span>@{data.owner.username || 'wanderer'}</span><span>✦</span><span>{data.followers} FOLLOWERS</span></div></section>
    <div className="ge-body"><aside className="ge-identity"><div className="ge-identity-seal"><EmpressSigil /><span>PROFILE</span></div><EmpressPortrait userId={data.owner.user_id} avatar={data.owner.avatar_url} name={name} /><h1><EmpressName userId={data.owner.user_id} name={name} /></h1><p className="ge-handle">@{data.owner.username || 'wanderer'}</p><div className="ge-identity-rule"><span />✦<span /></div><p className="ge-bio">{data.owner.bio || 'Every story leaves a mark. Welcome to my little kingdom.'}</p><div className="ge-badges" aria-label="Profile badges">{data.badges.map(b => <img key={b.key} src={b.image} alt={b.label} title={b.label} />)}</div><dl className="ge-identity-stats"><div><dd>{data.followers}</dd><dt>Followers</dt></div><div><dd>{data.canViewLibrary ? data.stats.completed : '—'}</dd><dt>Completed</dt></div></dl>{!data.isOwner && <Button className="ge-follow" disabled={data.followPending} onClick={data.onFollow}><Heart data-icon="inline-start" />{data.followPending ? 'Updating…' : data.following ? 'Following' : 'Join the court'}</Button>}{data.links.length > 0 && <div className="ge-links">{data.links.map(link => <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer">{link.label}<ArrowUpRight aria-hidden="true" /></a>)}</div>}<footer><EmpressSigil /><span>@{data.owner.username || 'wanderer'}<br /><small>MEMBER OF TATAKAI</small></span></footer></aside>
    <div className="ge-content"><nav className="ge-tabs" role="tablist" aria-label="Profile sections">{tabs.map((tab, i) => <button key={tab.id} type="button" id={`ge-tab-${tab.id}`} role="tab" aria-selected={active === tab.id} aria-controls="ge-panel" tabIndex={active === tab.id ? 0 : -1} onKeyDown={e => tabKeyboard(e, i)} onClick={() => openTab(tab.id)}>{labels[tab.id] || tab.label}</button>)}</nav><div className="ge-panel" id="ge-panel" role="tabpanel" tabIndex={0} aria-labelledby={`ge-tab-${active}`}>
    {data.loading ? <p className="ge-loading" role="status">Opening the archives…</p> : data.error ? <p className="ge-loading" role="alert">The archives could not be loaded. Please refresh to try again.</p> : active === 'overview' ? <EmpressOverview data={data} /> : active in collections ? <><header className="ge-section-heading"><span className="ge-eyebrow">THE ROYAL COLLECTION</span><h2>{labels[active]}</h2></header><EmpressCollection key={active} label={tabs.find(t => t.id === active)?.label || active} items={collections[active as keyof typeof collections]} /></> : active === 'streaks' ? <><header className="ge-section-heading"><span className="ge-eyebrow">A RITUAL, EVERY DAY</span><h2>Devotion & distinction</h2></header><EmpressStreak data={data} /><div className="ge-achievements">{(data.canViewHistory ? data.achievements ?? [] : []).map(a => <article key={a.id} data-unlocked={a.unlocked}><Crown aria-hidden="true" /><h3>{a.title}</h3><p>{a.description}</p><span>{a.unlocked ? 'Earned' : `${a.progress ?? 0} / ${a.total ?? 0}`}</span></article>)}</div></> : active === 'vault' ? <><header className="ge-section-heading"><span className="ge-eyebrow">KEPT UNDER SEAL</span><h2>The treasury</h2></header><Suspense fallback={<p role="status">Unsealing the treasury…</p>}><Vault data={data} /></Suspense></> : <EmpressEmpty>Choose a section of the court.</EmpressEmpty>}
    </div><footer className="ge-page-footer"><span>@{data.owner.username || 'wanderer'}</span><EmpressSigil /><span>TATAKAI</span></footer></div></div>
  </main>;
}

