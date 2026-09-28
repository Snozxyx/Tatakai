import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Music2, Plus, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getProxiedImageUrl } from '@/lib/api';
import { usePlaylists } from '@/hooks/user/usePlaylist';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

export interface MyPlaylistsWidgetProps {
  className?: string;
}

/** Batch the first few posters for each visible playlist in one query. */
function useMyPlaylistCovers(ids: string[]) {
  return useQuery({
    queryKey: ['my-playlist-covers', ids],
    queryFn: async () => {
      const map: Record<string, string[]> = {};
      if (!ids.length) return map;
      const { data } = await supabase
        .from('playlist_items')
        .select('playlist_id, anime_poster, position')
        .in('playlist_id', ids)
        .order('position', { ascending: true });
      (data || []).forEach((r: any) => {
        if (!r.anime_poster) return;
        const arr = map[r.playlist_id] || (map[r.playlist_id] = []);
        if (arr.length < 4) arr.push(r.anime_poster);
      });
      return map;
    },
    enabled: ids.length > 0,
  });
}

/** The current viewer's own playlists, in the ambient right-rail design. */
export function MyPlaylistsWidget({ className }: MyPlaylistsWidgetProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: playlists = [], isLoading } = usePlaylists();
  const visible = playlists.slice(0, 4);
  const { data: coverMap = {} } = useMyPlaylistCovers(visible.map((p) => p.id));

  if (!user) return null;

  return (
    <div
      className={cn(
        'group relative flex w-full flex-col overflow-hidden rounded-[24px] border border-white/[0.08] bg-[#08090b] shadow-[0_20px_60px_rgba(0,0,0,0.4)] transition-all hover:border-white/[0.12]',
        className
      )}
    >
      {/* Ambient background glows */}
      <div className="pointer-events-none absolute -left-16 -top-10 h-56 w-56 rounded-full bg-violet-500/10 blur-[90px] transition-all group-hover:bg-violet-500/20" />
      <div className="pointer-events-none absolute -bottom-16 -right-16 h-56 w-56 rounded-full bg-primary/10 blur-[90px] transition-all group-hover:bg-primary/20" />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between p-5 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-violet-500/20 bg-violet-500/10">
            <Music2 className="h-3.5 w-3.5 text-violet-400" />
          </div>
          <span className="text-[11px] font-bold uppercase tracking-widest text-violet-400">
            My Playlists
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="relative z-10 flex flex-col gap-1 px-3 pb-3">
        {isLoading ? (
          [...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-2xl px-2 py-2 animate-pulse">
              <div className="h-12 w-12 shrink-0 rounded-xl bg-white/5" />
              <div className="flex-1 space-y-2 py-1">
                <div className="h-3 w-28 rounded-full bg-white/5" />
                <div className="h-2.5 w-16 rounded-full bg-white/5" />
              </div>
            </div>
          ))
        ) : visible.length === 0 ? (
          <button
            type="button"
            onClick={() => navigate('/playlists')}
            className="m-2 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center transition-colors hover:border-violet-500/40 hover:bg-white/[0.03]"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-500/10 text-violet-400">
              <Plus className="h-4 w-4" />
            </span>
            <span className="text-[13px] font-semibold text-zinc-200">Create your first playlist</span>
            <span className="text-[11px] text-zinc-500">Curate anime into shareable collections.</span>
          </button>
        ) : (
          visible.map((p) => {
            const covers = coverMap[p.id] || (p.cover_image ? [p.cover_image] : []);
            return (
              <Link
                key={p.id}
                to={`/playlist/${p.id}`}
                className="group/row flex items-center gap-3 rounded-2xl px-2 py-2 transition-all hover:bg-white/[0.04]"
              >
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-white/[0.06] bg-zinc-900">
                  {covers.length > 0 ? (
                    <div className={cn('grid h-full w-full gap-px', covers.length >= 2 ? 'grid-cols-2' : 'grid-cols-1')}>
                      {covers.slice(0, 4).map((img, idx) => (
                        <img key={idx} src={getProxiedImageUrl(img)} alt="" className="h-full w-full object-cover" />
                      ))}
                    </div>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Music2 className="h-5 w-5 text-zinc-600" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-zinc-100 transition-colors group-hover/row:text-white">
                    {p.name}
                  </p>
                  <p className="truncate text-[11px] font-medium text-zinc-500 tabular-nums">
                    {p.items_count} {p.items_count === 1 ? 'anime' : 'anime'}
                  </p>
                </div>
              </Link>
            );
          })
        )}
      </div>

      {/* Bottom glass CTA */}
      {visible.length > 0 && (
        <div className="relative z-10 p-3 pt-0">
          <Link
            to="/playlists"
            className="flex items-center justify-center gap-1.5 rounded-2xl border border-white/[0.08] bg-black/40 py-2.5 text-[12px] font-bold text-zinc-300 backdrop-blur-xl transition-all hover:border-violet-500/30 hover:text-white"
          >
            View all playlists <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
    </div>
  );
}
