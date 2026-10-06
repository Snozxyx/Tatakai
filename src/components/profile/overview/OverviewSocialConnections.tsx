import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, ChevronRight } from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { UserBadges } from '@/components/ui/UserBadges';
import { useFollowList } from '@/hooks/community/useFollow';
import { useBatchUserBadges } from '@/hooks/community/useUserBadges';
import { getProxiedImageUrl } from '@/lib/api';
import { AnimatedCounter } from './AnimatedCounter';
import { cn } from '@/lib/utils';

export interface OverviewSocialConnectionsProps {
  userId?: string;
  username?: string | null;
  followersCount?: number;
  followingCount?: number;
}

type SocialTab = 'followers' | 'following';

export function OverviewSocialConnections({
  userId,
  username,
  followersCount = 0,
  followingCount = 0,
}: OverviewSocialConnectionsProps) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<SocialTab>('followers');

  const { data: userList = [], isLoading } = useFollowList(userId, activeTab);
  const preview = userList.slice(0, 4);
  const { data: badgeMap } = useBatchUserBadges(preview.map((u) => u.user_id));

  return (
    <GlassPanel
      className="
        relative overflow-hidden
        p-4
        flex flex-col
        border-white/[0.04]
        bg-background/40
        backdrop-blur-2xl
        rounded-2xl
      "
    >
      {/* Ambient glow */}
      <div
        className="absolute -bottom-10 -left-10 w-40 h-40 bg-indigo-500/10 blur-[60px] rounded-full pointer-events-none"
        aria-hidden="true"
      />

      <div className="relative z-10 flex flex-col gap-3.5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Users className="w-3.5 h-3.5" />
            </div>
            <h4 className="font-display font-bold text-sm text-foreground tracking-tight">
              Social Connections
            </h4>
          </div>

          <Link
            to={username ? `/social/${username}?tab=${activeTab}` : '#'}
            className="flex items-center gap-0.5 text-[11px] font-medium text-indigo-400 hover:text-indigo-300 transition-colors group shrink-0 focus-visible:outline-none focus-visible:underline"
            aria-label="View all social connections"
          >
            <span>View All</span>
            <ChevronRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        {/* Followers / Following toggle */}
        <div
          role="tablist"
          aria-label="Social connections filter"
          className="flex items-center gap-1 bg-black/20 p-1 rounded-xl border border-white/[0.03]"
        >
          <button
            role="tab"
            aria-selected={activeTab === 'followers'}
            onClick={() => setActiveTab('followers')}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50',
              activeTab === 'followers'
                ? 'bg-white/10 shadow-sm'
                : 'text-muted-foreground/60 hover:text-foreground hover:bg-white/[0.02]',
            )}
          >
            <span className="font-display font-bold text-sm text-foreground tabular-nums">
              <AnimatedCounter value={followersCount} />
            </span>
            <span className="text-[10px] font-semibold text-muted-foreground/80">Followers</span>
          </button>

          <div className="w-px h-4 bg-white/[0.06] shrink-0" />

          <button
            role="tab"
            aria-selected={activeTab === 'following'}
            onClick={() => setActiveTab('following')}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50',
              activeTab === 'following'
                ? 'bg-white/10 shadow-sm'
                : 'text-muted-foreground/60 hover:text-foreground hover:bg-white/[0.02]',
            )}
          >
            <span className="font-display font-bold text-sm text-foreground tabular-nums">
              <AnimatedCounter value={followingCount} />
            </span>
            <span className="text-[10px] font-semibold text-muted-foreground/80">Following</span>
          </button>
        </div>

        {/* User preview — single column, banner-as-card */}
        <div>
          <AnimatePresence mode="wait">
            {isLoading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col gap-2"
              >
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="relative overflow-hidden rounded-xl border border-white/[0.05]"
                  >
                    <div className="absolute inset-0 animate-pulse bg-white/[0.03]" />
                    <div className="relative flex items-center gap-2.5 p-2.5">
                      <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-white/10" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-2.5 w-20 animate-pulse rounded-full bg-white/8" />
                        <div className="h-2 w-14 animate-pulse rounded-full bg-white/5" />
                      </div>
                    </div>
                  </div>
                ))}
              </motion.div>
            ) : preview.length > 0 ? (
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col gap-2"
              >
                {preview.map((u, idx) => {
                  const name = u.display_name || u.username || 'Anonymous';
                  const goToProfile = () =>
                    navigate(u.username ? `/@${u.username}` : '#');

                  return (
                    <motion.button
                      key={u.user_id}
                      onClick={goToProfile}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.15, delay: idx * 0.04 }}
                      className="group/card relative overflow-hidden rounded-xl border border-white/[0.07] text-left transition-all duration-200 hover:border-white/[0.14]"
                      aria-label={`View ${name}'s profile`}
                    >
                      {/* Banner fills the whole card */}
                      {u.banner_url ? (
                        <img
                          src={getProxiedImageUrl(u.banner_url)}
                          alt=""
                          aria-hidden="true"
                          className="absolute inset-0 h-full w-full object-cover opacity-40 transition-transform duration-500 group-hover/card:scale-105"
                        />
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/15 via-primary/8 to-transparent" />
                      )}
                      {/* Scrim */}
                      <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/70 to-background/40" />

                      {/* Content */}
                      <div className="relative flex items-center gap-2.5 p-2.5">
                        <Avatar className="h-9 w-9 shrink-0 ring-2 ring-white/10 transition-transform duration-200 group-hover/card:scale-105">
                          <AvatarImage src={u.avatar_url || ''} className="object-cover" />
                          <AvatarFallback className="bg-zinc-800 text-xs font-bold">
                            {name[0]?.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            <p className="truncate text-xs font-semibold text-foreground/90">
                              {name}
                            </p>
                            <UserBadges
                              badges={badgeMap?.[u.user_id]}
                              size={14}
                              max={3}
                              // Card itself is a button — badges render static
                              // (no nested <button>s).
                              interactive={false}
                            />
                          </div>
                          {u.username && (
                            <p className="truncate text-[10px] text-muted-foreground/60">
                              @{u.username}
                            </p>
                          )}
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="py-6 text-center border border-dashed border-white/[0.06] rounded-xl bg-white/[0.005]"
              >
                <Users className="w-5 h-5 mx-auto text-muted-foreground/30 mb-1.5" />
                <p className="text-xs text-muted-foreground/60">
                  No {activeTab} found yet
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </GlassPanel>
  );
}
