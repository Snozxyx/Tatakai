import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { useUserForumPosts } from '@/hooks/community/useForum';
import { useUserPlaylists } from '@/hooks/user/usePlaylist';
import { useUserTierLists } from '@/hooks/user/useTierLists';
import { useUserCommentsDetailed } from '@/hooks/user/useUserCommentsDetailed';
import { FrostedCard, LofiEmpty } from './MidnightLofiComponents';
import type { ProfileThemeData } from '../types';

export default function MidnightLofiVault({ data }: { data: ProfileThemeData }) {
  const posts = useUserForumPosts(data.owner.user_id);
  const playlists = useUserPlaylists(data.owner.user_id);
  const tiers = useUserTierLists(data.owner.user_id);
  const comments = useUserCommentsDetailed(data.owner.user_id);

  if (posts.isLoading || playlists.isLoading || tiers.isLoading || comments.isLoading) {
    return <p className="text-center py-12 text-slate-400" role="status">Unlocking the vault…</p>;
  }

  if (posts.isError || playlists.isError || tiers.isError) {
    return <p className="text-center py-12 text-red-400" role="alert">The vault could not be loaded. Please try again later.</p>;
  }

  const groups = [
    {
      title: 'Community Posts',
      items: (posts.data ?? [])
        .filter(p => data.isOwner || p.is_approved !== false)
        .map(p => ({
          id: p.id,
          title: p.title,
          detail: 'Forum Discussion',
          href: `/community/forum/${p.id}`,
        })),
    },
    {
      title: 'Comments & Thoughts',
      items: comments.comments.map(c => ({
        id: c.id,
        title: c.title,
        detail: c.is_spoiler ? 'Spoiler · Open to view' : c.content.replace(/<[^>]*>/g, '').slice(0, 150),
        href: c.target,
      })),
    },
    {
      title: 'Playlists',
      items: (playlists.data ?? [])
        .filter(p => data.isOwner || p.is_public)
        .map(p => ({
          id: p.id,
          title: p.name,
          detail: `${p.items_count} titles`,
          href: `/playlist/${p.id}`,
        })),
    },
    {
      title: 'Tier Lists',
      items: (tiers.data ?? [])
        .filter(t => data.isOwner || t.is_public)
        .map(t => ({
          id: t.id,
          title: t.title || t.name,
          detail: t.description || 'Custom Tier List',
          href: `/tierlist/${t.id}`,
        })),
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {groups.map(group => (
        <FrostedCard key={group.title} className="p-6">
          <h3 className="text-sm font-bold uppercase tracking-wider text-amber-300/90 mb-4 flex items-center justify-between">
            <span>{group.title}</span>
            <span className="text-xs text-slate-400 font-normal">({group.items.length})</span>
          </h3>
          {group.items.length ? (
            <div className="flex flex-col divide-y divide-white/10">
              {group.items.slice(0, 5).map(item => (
                <Link
                  key={item.id}
                  to={item.href}
                  className="group flex items-center justify-between py-3 transition-colors hover:text-white"
                >
                  <div className="min-w-0 pr-4">
                    <p className="line-clamp-1 text-sm font-semibold text-slate-200 group-hover:text-white">
                      {item.title}
                    </p>
                    <span className="line-clamp-1 text-xs text-slate-400">
                      {item.detail}
                    </span>
                  </div>
                  <span className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-slate-300 group-hover:bg-amber-400 group-hover:text-slate-950 transition-all">
                    <ArrowUpRight size={14} />
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <LofiEmpty>No public entries available.</LofiEmpty>
          )}
        </FrostedCard>
      ))}
    </div>
  );
}
