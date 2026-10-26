import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ImageIcon, Lock } from 'lucide-react';
import { CosmeticAvatar, CosmeticName } from '@/components/profile/IdentityCosmetics';
import { AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cachedProfileImageUrl } from '@/lib/profileImage';
import type { ThemeMediaItem } from '../types';

export function EmpressSigil() {
  return <svg viewBox="0 0 80 80" fill="none" aria-hidden="true"><path d="M7 40Q40 8 73 40Q40 72 7 40Z" stroke="currentColor" /><circle cx="40" cy="40" r="13" stroke="currentColor" /><path d="M40 19V3M40 61v16M19 24 8 13M61 24l11-11M19 56 8 67M61 56l11 11M40 28l5 12-5 12-5-12Z" fill="currentColor" /></svg>;
}
export function EmpressPortrait({ userId, avatar, name }: { userId?: string; avatar?: string | null; name: string }) {
  return <div className="ge-portrait"><svg className="ge-thorn-crest" viewBox="0 0 160 160" aria-hidden="true"><path d="m80 4 9 29 13-14-1 24 39-17-18 31 32-3-22 21 24 13-31 6 16 30-34-12 1 26-19-19-9 30-11-30-19 19 1-26-34 12 16-30-31-6 24-13L6 54l32 3-18-31 39 17-1-24 13 14Z" fill="currentColor"/><path d="m80 17 13 32 35-6-17 34 21 23-37 3-15 32-15-32-37-3 21-23-17-34 35 6Z" fill="none" stroke="currentColor"/></svg><CosmeticAvatar userId={userId} className="ge-avatar"><AvatarImage src={avatar} alt={`${name}'s avatar`} /><AvatarFallback className="ge-avatar-fallback">{name.slice(0, 1).toUpperCase()}</AvatarFallback></CosmeticAvatar><span className="ge-portrait-diamond" /></div>;
}
export function EmpressName({ userId, name }: { userId?: string; name: string }) { return <CosmeticName userId={userId}>{name}</CosmeticName>; }
export function EmpressEmpty({ private: locked = false, children }: { private?: boolean; children: React.ReactNode }) {
  return <div className="ge-empty">{locked ? <Lock aria-hidden="true" /> : <EmpressSigil />}<p>{children}</p></div>;
}
export function EmpressImage({ src, alt = '' }: { src: string; alt?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return src && !failed ? <img src={cachedProfileImageUrl(src)} alt={alt} loading="lazy" onError={() => setFailed(true)} /> : <span className="ge-image-fallback"><ImageIcon aria-hidden="true" /></span>;
}
export function EmpressCollection({ items, label }: { items: ThemeMediaItem[]; label: string }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const statuses = [...new Set(items.flatMap(item => item.status ? [item.status] : []))];
  const filtered = items.filter(item => item.title.toLowerCase().includes(search.trim().toLowerCase()) && (status === 'all' || item.status === status));
  return <section className="ge-collection" aria-label={label}>
    <div className="ge-collection-tools"><label>Search {label}<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a story in the archives…" /></label>{statuses.length > 0 && <label>Status<select value={status} onChange={e => setStatus(e.target.value)}><option value="all">All statuses</option>{statuses.map(s => <option value={s} key={s}>{s.replace(/_/g, ' ')}</option>)}</select></label>}<span aria-live="polite">{filtered.length} stories</span></div>
    {filtered.length ? <div className="ge-story-grid">{filtered.map((item, i) => <Link to={item.href} className="ge-story" key={`${item.id}-${i}`}><div className="ge-story-art"><EmpressImage src={item.image} /><span className="ge-story-index">{String(i + 1).padStart(2, '0')}</span><ArrowUpRight aria-hidden="true" /></div><h3>{item.title}</h3><p>{(item.detail || item.status || 'In the collection').replace(/_/g, ' ')}</p></Link>)}</div> : <EmpressEmpty>{search || status !== 'all' ? 'No stories match your search.' : 'The archives await their first story.'}</EmpressEmpty>}
  </section>;
}
