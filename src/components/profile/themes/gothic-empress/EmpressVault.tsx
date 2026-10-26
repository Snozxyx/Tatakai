import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { useUserForumPosts } from '@/hooks/community/useForum';
import { useUserPlaylists } from '@/hooks/user/usePlaylist';
import { useUserTierLists } from '@/hooks/user/useTierLists';
import { useUserCommentsDetailed } from '@/hooks/user/useUserCommentsDetailed';
import { EmpressEmpty } from './EmpressComponents';
import type { ProfileThemeData } from '../types';

export default function EmpressVault({ data }: { data: ProfileThemeData }) {
  const posts = useUserForumPosts(data.owner.user_id);
  const playlists = useUserPlaylists(data.owner.user_id);
  const tiers = useUserTierLists(data.owner.user_id);
  const comments = useUserCommentsDetailed(data.owner.user_id);
  if (posts.isLoading || playlists.isLoading || tiers.isLoading || comments.isLoading) return <p className="ge-empty" role="status">Unsealing the treasury…</p>;
  if (posts.isError || playlists.isError || tiers.isError) return <p role="alert">The treasury could not be loaded. Please try again later.</p>;
  const groups = [
    { title: 'Correspondence', items: (posts.data ?? []).filter(p => data.isOwner || p.is_approved !== false).map(p => ({ id: p.id, title: p.title, detail: 'Community post', href: `/community/forum/${p.id}` })) },
    { title: 'Whispers', items: comments.comments.map(c => ({ id: c.id, title: c.title, detail: c.is_spoiler ? 'Spoiler · Open to read' : c.content.replace(/<[^>]*>/g, '').slice(0, 150), href: c.target })) },
    { title: 'Curated volumes', items: (playlists.data ?? []).filter(p => data.isOwner || p.is_public).map(p => ({ id: p.id, title: p.name, detail: `${p.items_count} stories`, href: `/playlist/${p.id}` })) },
    { title: 'Royal rankings', items: (tiers.data ?? []).filter(t => data.isOwner || t.is_public).map(t => ({ id: t.id, title: t.title || t.name, detail: t.description, href: `/tierlist/${t.id}` })) },
  ];
  return <div className="ge-treasury">{groups.map((group, i) => <section key={group.title}><header><span className="ge-eyebrow">0{i + 1} / TREASURY</span><h3>{group.title}</h3></header>{group.items.length ? group.items.map(item => <Link to={item.href} key={item.id}><div><strong>{item.title}</strong><p>{item.detail}</p></div><ArrowUpRight aria-hidden="true" /></Link>) : <EmpressEmpty>No entries have been shared yet.</EmpressEmpty>}</section>)}</div>;
}
