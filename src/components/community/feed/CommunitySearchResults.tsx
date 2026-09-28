import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, Music2, Layers, MessageSquare } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { UserBadges } from '@/components/ui/UserBadges';
import { getProxiedImageUrl } from '@/lib/api';
import { useCommunitySearch } from '@/hooks/community/useCommunitySearch';
import { useBatchUserBadges } from '@/hooks/community/useUserBadges';
import { FeedList } from './FeedList';

const TAKEOVER_LIMIT = 12;

function SectionHeader({ icon: Icon, label, count }: { icon: any; label: string; count?: number }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <div className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-primary">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
      {count ? <span className="text-[11px] font-bold tabular-nums text-muted-foreground/60">· {count}</span> : null}
    </div>
  );
}

/**
 * Full-width, sectioned search takeover for `/community` (Item 2). Users render
 * as banner + badge cards (shared row language with "Who to Follow"), playlists
 * / tier lists as cards, and posts as full `PostCard`s via `FeedList` with a
 * `search` filter so the whole feed enrichment (badges, polls, embeds) is
 * reused. Rendered by the page only while `query.trim().length >= 2`.
 */
export function CommunitySearchResults({ query }: { query: string }) {
  const navigate = useNavigate();
  const term = query.trim();
  const { data } = useCommunitySearch(query, TAKEOVER_LIMIT);
  const users = data?.users ?? [];
  const playlists = data?.playlists ?? [];
  const tierlists = data?.tierlists ?? [];
  const { data: badgeMap } = useBatchUserBadges(users.map((u) => u.user_id));

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="mx-auto max-w-3xl space-y-10 pb-16"
    >
      <p className="text-sm text-muted-foreground">
        Results for <span className="font-bold text-white">“{term}”</span>
      </p>

      {/* People */}
      {users.length > 0 && (
        <section>
          <SectionHeader icon={Users} label="People" count={users.length} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {users.map((u) => {
              const name = u.display_name || u.username || 'Anonymous';
              const go = () => u.username && navigate(`/user/${u.username}`);
              return (
                <button
                  key={u.user_id}
                  onClick={go}
                  className="group/row overflow-hidden rounded-2xl border border-white/[0.05] bg-white/[0.015] text-left transition-all duration-300 hover:border-white/[0.12] hover:bg-white/[0.03]"
                >
                  <div className="relative h-14 w-full overflow-hidden">
                    {u.banner_url ? (
                      <img
                        src={getProxiedImageUrl(u.banner_url)}
                        alt=""
                        className="h-full w-full object-cover opacity-80 transition-transform duration-500 group-hover/row:scale-105"
                      />
                    ) : (
                      <div className="h-full w-full bg-gradient-to-br from-sky-500/20 via-primary/10 to-transparent" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
                  </div>
                  <div className="px-3 pb-3">
                    <Avatar className="-mt-6 h-12 w-12 ring-4 ring-background transition-transform duration-300 group-hover/row:scale-105">
                      <AvatarImage src={u.avatar_url || ''} className="object-cover" />
                      <AvatarFallback className="bg-zinc-800 text-sm font-bold text-zinc-400">
                        {name[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="mt-2 flex items-center gap-1.5">
                      <p className="truncate text-[13px] font-semibold text-foreground/90 transition-colors group-hover/row:text-primary">
                        {name}
                      </p>
                      <UserBadges badges={badgeMap?.[u.user_id]} size={13} max={2} />
                    </div>
                    {u.username && <p className="truncate text-[11px] font-medium text-muted-foreground/60">@{u.username}</p>}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Playlists */}
      {playlists.length > 0 && (
        <section>
          <SectionHeader icon={Music2} label="Playlists" count={playlists.length} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {playlists.map((p) => (
              <button
                key={p.id}
                onClick={() => navigate(`/playlist/${p.id}`)}
                className="group/pl flex items-center gap-3 overflow-hidden rounded-2xl border border-white/[0.05] bg-white/[0.015] p-2.5 text-left transition-all duration-300 hover:border-white/[0.12] hover:bg-white/[0.03]"
              >
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-white/[0.06] bg-zinc-900">
                  {p.cover_image ? (
                    <img src={getProxiedImageUrl(p.cover_image)} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover/pl:scale-105" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center"><Music2 className="h-5 w-5 text-zinc-600" /></div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-foreground/90 transition-colors group-hover/pl:text-primary">{p.name}</p>
                  <p className="truncate text-[11px] tabular-nums text-muted-foreground/60">{p.items_count ?? 0} anime</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Tier lists */}
      {tierlists.length > 0 && (
        <section>
          <SectionHeader icon={Layers} label="Tier Lists" count={tierlists.length} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {tierlists.map((t) => (
              <button
                key={t.id}
                onClick={() => navigate(t.share_code ? `/tierlist/${t.share_code}` : '/tierlists')}
                className="group/tl flex items-center gap-3 overflow-hidden rounded-2xl border border-white/[0.05] bg-white/[0.015] p-2.5 text-left transition-all duration-300 hover:border-amber-500/30 hover:bg-white/[0.03]"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10">
                  <Layers className="h-5 w-5 text-amber-400" />
                </div>
                <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground/90 transition-colors group-hover/tl:text-amber-400">{t.title}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Posts — full PostCards via the shared feed enrichment */}
      <section>
        <SectionHeader icon={MessageSquare} label="Posts" />
        <FeedList tab="foryou" search={term} showComposer={false} />
      </section>
    </motion.div>
  );
}
