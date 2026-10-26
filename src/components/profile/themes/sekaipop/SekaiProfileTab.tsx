import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Flame, ImageIcon, Star } from 'lucide-react';
import { useUserForumPosts } from '@/hooks/community/useForum';
import { useUserPlaylists } from '@/hooks/user/usePlaylist';
import { useUserTierLists } from '@/hooks/user/useTierLists';
import { useUserCommentsDetailed } from '@/hooks/user/useUserCommentsDetailed';
import { cachedProfileImageUrl } from '@/lib/profileImage';
import type { ProfileThemeData, ThemeMediaItem } from '../types';
import { SekaiSelect } from './SekaiSelect';
import { sekaiMascotUrl } from '@/lib/profileThemes';

function Collection({ items, label }: { items: ThemeMediaItem[]; label: string }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const statuses = [...new Set(items.map(item => item.status).filter((s): s is string => Boolean(s)))];
  const filtered = items.filter(item => item.title.toLowerCase().includes(search.trim().toLowerCase()) && (status === 'all' || item.status === status));
  return <section className="sp-collection"><div className="sp-collection-tools"><label>Search {label}<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a story…" /></label>{statuses.length > 0 && <SekaiSelect label="Filter by status" value={status} onChange={setStatus} options={[{ value: 'all', label: 'All statuses' }, ...statuses.map(value => ({ value, label: value.replace(/_/g, ' ') }))]} />}<span>{filtered.length} stories</span></div>
    {filtered.length ? <div className="sp-story-grid">{filtered.map((item, index) => <Link className="sp-story-card" key={`${item.id}-${index}`} to={item.href}><div className="sp-story-poster">{item.image ? <img src={cachedProfileImageUrl(item.image)} alt="" loading="lazy" onError={e => { e.currentTarget.style.display = 'none'; }} /> : <ImageIcon size={30} />}{item.status && <b>{item.status.replace(/_/g, ' ')}</b>}</div><h3>{item.title}</h3>{item.detail && <p>{item.detail}</p>}</Link>)}</div> : <div className="sp-empty"><img className="sp-empty-mascot" src={sekaiMascotUrl('sleepy')} alt="" /><p>{search || status !== 'all' ? 'No stories match these filters.' : `No ${label.toLowerCase()} to show yet.`}</p></div>}
  </section>;
}

function Vault({ data }: { data: ProfileThemeData }) {
  const posts = useUserForumPosts(data.owner.user_id);
  const playlists = useUserPlaylists(data.owner.user_id);
  const tiers = useUserTierLists(data.owner.user_id);
  const comments = useUserCommentsDetailed(data.owner.user_id);
  if (posts.isLoading || playlists.isLoading || tiers.isLoading || comments.isLoading) return <p className="sp-empty" role="status">Opening the vault…</p>;
  const visiblePosts = (posts.data ?? []).filter(p => data.isOwner || p.is_approved !== false);
  const visibleLists = (playlists.data ?? []).filter(p => data.isOwner || p.is_public);
  const visibleTiers = (tiers.data ?? []).filter(t => data.isOwner || t.is_public);
  return <div className="sp-vault-sections">
    <section className="sp-section-card"><h3>Posts</h3>{visiblePosts.length ? visiblePosts.map(post => <Link className="sp-vault-entry" to={`/community/forum/${post.id}`} key={post.id}><strong>{post.title}</strong><span>{post.content?.replace(/<[^>]*>/g, '').slice(0, 180)}</span></Link>) : <p className="sp-empty">No shared posts yet.</p>}</section>
    <section className="sp-section-card"><h3>Comments</h3>{comments.comments.length ? comments.comments.map(comment => <Link className="sp-vault-entry" to={comment.target} key={comment.id}><strong>{comment.title}</strong><span>{comment.is_spoiler ? 'Spoiler · Open to read' : comment.content.replace(/<[^>]*>/g, '').slice(0, 180)}</span></Link>) : <p className="sp-empty">No comments yet.</p>}</section>
    <section className="sp-section-card"><h3>Playlists</h3>{visibleLists.map(list => <Link className="sp-vault-entry" to={`/playlist/${list.id}`} key={list.id}><strong>{list.name}</strong><span>{list.items_count} stories · {list.is_public ? 'Public' : 'Private'}</span></Link>)}{!visibleLists.length && <p className="sp-empty">No shared playlists yet.</p>}</section>
    <section className="sp-section-card"><h3>Tier lists</h3>{visibleTiers.map(tier => <Link className="sp-vault-entry" to={`/tierlist/${tier.id}`} key={tier.id}><strong>{tier.title || tier.name}</strong><span>{tier.description}</span></Link>)}{!visibleTiers.length && <p className="sp-empty">No shared tier lists yet.</p>}</section>
  </div>;
}

export default function SekaiProfileTab({ data, tab }: { data: ProfileThemeData; tab: string }) {
  if (tab === 'watchlist') return <Collection key={tab} label="Watchlist" items={data.canViewLibrary ? data.sections?.watchlist ?? [] : []} />;
  if (tab === 'manga-readlist') return <Collection key={tab} label="Manga readlist" items={data.canViewLibrary ? data.sections?.manga ?? [] : []} />;
  if (tab === 'novel-readlist') return <Collection key={tab} label="Novel readlist" items={data.isOwner ? data.sections?.novels ?? [] : []} />;
  if (tab === 'history') return <Collection key={tab} label="History" items={data.canViewHistory ? [...data.activity, ...(data.sections?.readingHistory ?? [])] : []} />;
  if (tab === 'vault') return <Vault data={data} />;
  if (tab === 'streaks') return <div className="sp-streaks-page"><div className="sp-section-card"><Flame size={42} /><h3>{data.stats.streak} day streak</h3><p>Longest run: {data.stats.longestStreak} days</p></div><div className="sp-achievements">{data.achievements?.map(achievement => <article className="sp-section-card" key={achievement.id}><Star size={25} /><h3>{achievement.title}</h3><p>{achievement.description}</p><b>{achievement.unlocked ? 'Unlocked' : `${achievement.progress ?? 0} / ${achievement.total ?? 0}`}</b></article>)}</div></div>;
  return <div className="sp-overview-page">
    <section className="sp-section-card"><h3>About {data.owner.display_name || data.owner.username}</h3><p className="sp-bio">{data.owner.bio || 'Every story starts somewhere.'}</p></section>
    <div className="sp-overview-stats">{[[data.canViewLibrary ? data.stats.anime : '—', 'Anime'], [data.canViewLibrary ? data.stats.manga : '—', 'Reading'], [data.canViewHistory ? data.stats.episodes : '—', 'Episodes'], [data.canViewHistory ? `${data.stats.hours}h` : '—', 'Watch time'], [data.canViewLibrary ? data.stats.completed : '—', 'Completed'], [data.followers, 'Followers']].map(([value, label]) => <div className="sp-section-card" key={label}><BookOpen size={20} /><strong>{value}</strong><span>{label}</span></div>)}</div>
    <section className="sp-section-card"><h3>Favorite characters</h3><Collection label="Favorites" items={data.favorites} /></section>
    <section className="sp-section-card"><h3>Badge collection</h3><div className="sp-badges">{data.badges.map(badge => <figure key={badge.key}><img src={badge.image} alt="" /><figcaption>{badge.label}</figcaption></figure>)}</div></section>
    {data.canViewHistory && <section className="sp-section-card"><h3>Recent activity</h3><Collection label="Recent activity" items={data.activity.slice(0, 12)} /></section>}
  </div>;
}
