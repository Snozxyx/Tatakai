import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { MessageSquare, Clapperboard, AlertCircle, Library, ListMusic, Trophy, FileText, MessageCircle } from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { TAB_PANEL_CLASS } from './statusLabels';
import { useUserForumPosts } from '@/hooks/community/useForum';
import { useUserPlaylists } from '@/hooks/user/usePlaylist';
import { useUserTierLists } from '@/hooks/user/useTierLists';
import { useUserCommentsDetailed } from '@/hooks/user/useUserCommentsDetailed';
import { PlaylistCard } from '@/components/playlist/PlaylistCard';
import { TierListCard } from '@/components/tierlist/TierListCard';
import { PostCard } from '@/components/community/feed/PostCard';
import { CommentContent } from '@/components/comments/CommentContent';
import type { FeedPost } from '@/hooks/community/useFeed';

interface VaultTabProps {
  userId?: string;
  isViewingOther?: boolean;
  onNavigate?: (path: string) => void;
}

/** Map a stored forum row to the FeedPost shape the community PostCard expects.
 *  Embeds live in metadata (images / gif / quote / watchroom); social counts
 *  default to 0 — PostCard fetches its own live reaction state. */
function toFeedPost(p: any): FeedPost {
  const metadata = (p.metadata || {}) as Record<string, any>;
  const images =
    Array.isArray(metadata.images) && metadata.images.length
      ? metadata.images
      : p.image_url
        ? [p.image_url]
        : null;
  return {
    ...p,
    poll: null,
    gif_url: metadata.gif_url || null,
    images,
    watch_room_id: metadata.watch_room_id || null,
    quoted_post_id: metadata.quoted_post_id || null,
    media_type: metadata.media_type || (p.anime_id ? 'anime' : null),
    repost_count: 0,
    reposted: false,
    bookmarked: false,
    badges: [],
    author_rank_score: 0,
    author_is_official: false,
    news_source: (metadata.source as string) || null,
  } as FeedPost;
}
/** Overview-style section header: accent icon tile + title/subtitle + count,
 *  mirroring the cards on the profile Overview tab (see OverviewReviews). */
function SectionHeader({
  icon,
  label,
  subtitle,
  count,
}: {
  icon: React.ReactNode;
  label: string;
  subtitle?: string;
  count: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 mb-5">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="p-1.5 rounded-lg border border-white/[0.05] bg-primary/10 text-primary shrink-0">{icon}</div>
        <div className="min-w-0">
          <h4 className="font-display font-bold text-base text-foreground tracking-tight leading-tight">{label}</h4>
          {subtitle && <p className="text-xs text-muted-foreground/70 font-medium truncate">{subtitle}</p>}
        </div>
      </div>
      <span className="shrink-0 px-2.5 py-1 rounded-full bg-white/[0.04] text-[11px] font-bold tabular-nums text-muted-foreground border border-white/[0.05]">
        {count}
      </span>
    </div>
  );
}

function StatChip({ icon, label, count }: { icon: React.ReactNode; label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-white/[0.05] bg-white/[0.02] px-3.5 py-2">
      <span className="text-primary/80">{icon}</span>
      <span className="text-lg font-black tabular-nums text-foreground leading-none">{count}</span>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
  );
}
export function VaultTab({ userId, isViewingOther, onNavigate }: VaultTabProps) {
  const { data: posts = [], isLoading: loadingPosts } = useUserForumPosts(userId);
  const { comments, isLoading: loadingComments } = useUserCommentsDetailed(userId);
  const { data: playlists = [], isLoading: loadingPlaylists } = useUserPlaylists(userId);
  const { data: tierLists = [], isLoading: loadingTierLists } = useUserTierLists(userId);

  const publicTierLists = (tierLists || []).filter((t) => t.is_public);
  const loading = loadingPosts || loadingComments || loadingPlaylists || loadingTierLists;
  const isEmpty =
    posts.length === 0 && comments.length === 0 && playlists.length === 0 && publicTierLists.length === 0;

  return (
    <GlassPanel className={TAB_PANEL_CLASS}>
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-[hsl(var(--profile-accent)/0.10)] blur-[70px] rounded-full pointer-events-none" />

      <div className="relative z-10">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-2">
            <Library className="w-4 h-4 text-primary/80" />
            <h3 className="font-display font-bold text-base sm:text-lg text-foreground tracking-tight">
              {isViewingOther ? "User's Vault" : 'My Vault'}
            </h3>
          </div>
          {!loading && !isEmpty && (
            <div className="flex flex-wrap gap-2">
              {posts.length > 0 && <StatChip icon={<FileText className="w-4 h-4" />} label="Posts" count={posts.length} />}
              {comments.length > 0 && (
                <StatChip icon={<MessageCircle className="w-4 h-4" />} label="Comments" count={comments.length} />
              )}
              {playlists.length > 0 && (
                <StatChip icon={<ListMusic className="w-4 h-4" />} label="Playlists" count={playlists.length} />
              )}
              {publicTierLists.length > 0 && (
                <StatChip icon={<Trophy className="w-4 h-4" />} label="Tiers" count={publicTierLists.length} />
              )}
            </div>
          )}
        </div>
        {loading ? (
          <div className="text-center py-16 text-muted-foreground font-medium">Loading vault…</div>
        ) : isEmpty ? (
          <div className="text-center py-20 border border-dashed border-white/10 bg-white/[0.01] rounded-[2rem]">
            <Library className="w-16 h-16 mx-auto text-muted-foreground/30 mb-6" />
            <h3 className="text-xl font-bold mb-2">Nothing in the vault yet</h3>
            <p className="text-muted-foreground">
              {isViewingOther
                ? "This user hasn't shared posts, comments, playlists or tier lists yet."
                : 'Your posts, comments, playlists and tier lists will collect here.'}
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {/* ---- Posts: 2-column masonry reusing the community PostCard ---- */}
            {posts.length > 0 && (
              <section>
                <SectionHeader
                  icon={<FileText className="w-4 h-4" />}
                  label="Posts"
                  subtitle={isViewingOther ? 'Shared threads' : "Threads you've shared"}
                  count={posts.length}
                />
                <div className="columns-1 lg:columns-2 gap-4 [column-fill:_balance]">
                  {posts.map((post: any) => {
                    const pending = post.is_approved === false;
                    return (
                      <div key={post.id} className="mb-4 break-inside-avoid">
                        {pending && !isViewingOther && (
                          <Badge
                            variant="secondary"
                            className="mb-2 gap-1.5 text-[10px] font-black tracking-wider uppercase bg-amber-500/10 text-amber-500 border-amber-500/20 rounded-full"
                          >
                            <AlertCircle className="w-3 h-3" />
                            Pending review
                          </Badge>
                        )}
                        <PostCard post={toFeedPost(post)} />
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
            {/* ---- Comments: overview-style rows, body via reused CommentContent ---- */}
            {comments.length > 0 && (
              <section>
                <SectionHeader
                  icon={<MessageSquare className="w-4 h-4" />}
                  label="Comments"
                  subtitle="Where you've joined the conversation"
                  count={comments.length}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {comments.map((c, idx) => {
                    const disabled = c.target === '#';
                    const go = () => !disabled && onNavigate?.(c.target);
                    return (
                      <motion.div
                        key={c.id}
                        initial={{ opacity: 0, y: 8 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: '-40px' }}
                        transition={{ duration: 0.25, delay: Math.min(idx * 0.03, 0.3) }}
                        role={disabled ? undefined : 'link'}
                        tabIndex={disabled ? undefined : 0}
                        onClick={go}
                        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && go()}
                        className={cn(
                          'group p-4 rounded-xl border border-white/[0.04] bg-white/[0.02] transition-all duration-200',
                          disabled
                            ? 'opacity-90'
                            : 'cursor-pointer hover:bg-white/[0.05] hover:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/40',
                        )}
                      >
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-primary/80 line-clamp-1">
                            on {c.title}
                          </span>
                          {c.hasEpisode && (
                            <Badge
                              variant="secondary"
                              className="gap-1 text-[9px] font-black tracking-wider uppercase bg-sky-500/10 text-sky-300 border-sky-500/20 rounded-full py-0"
                            >
                              <Clapperboard className="w-2.5 h-2.5" />
                              Episode
                            </Badge>
                          )}
                          {c.is_spoiler && (
                            <Badge
                              variant="secondary"
                              className="text-[9px] font-black tracking-wider uppercase bg-rose-500/10 text-rose-300 border-rose-500/20 rounded-full py-0"
                            >
                              Spoiler
                            </Badge>
                          )}
                          <span className="ml-auto uppercase tracking-widest text-[10px] font-semibold text-muted-foreground/60 whitespace-nowrap">
                            {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                          </span>
                        </div>
                        <div className={cn(c.is_spoiler && 'blur-[5px] group-hover:blur-none transition-all select-none')}>
                          <CommentContent
                            content={c.content}
                            className="text-sm text-foreground/80 leading-relaxed line-clamp-3 group-hover:text-foreground transition-colors"
                          />
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </section>
            )}
            {/* ---- Public playlists ---- */}
            {playlists.length > 0 && (
              <section>
                <SectionHeader
                  icon={<ListMusic className="w-4 h-4" />}
                  label="Playlists"
                  subtitle="Public playlists"
                  count={playlists.length}
                />
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {playlists.map((p) => (
                    <PlaylistCard key={p.id} playlist={p} showActions={false} />
                  ))}
                </div>
              </section>
            )}

            {/* ---- Public tier lists ---- */}
            {publicTierLists.length > 0 && (
              <section>
                <SectionHeader
                  icon={<Trophy className="w-4 h-4" />}
                  label="Tier Lists"
                  subtitle="Public tier lists"
                  count={publicTierLists.length}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {publicTierLists.map((t) => (
                    <TierListCard key={t.id} tierList={t} showAuthor={false} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </GlassPanel>
  );
}

