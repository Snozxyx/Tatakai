import { motion } from 'framer-motion';
import { Users, MessageSquare, FileText, ThumbsUp, UserPlus, Trophy, Award } from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import type { ReputationTerm } from '@/core/profile/reputation';

export interface OverviewCommunityAnalyticsProps {
  commentCount?: number;
  forumPostCount?: number;
  forumUpvotes?: number;
  followersCount?: number;
  followingCount?: number;
  reputationScore?: number;
  reputationBreakdown?: ReputationTerm[];
  leaderboardRank?: number | null;
  totalRankedUsers?: number | null;
}

export function OverviewCommunityAnalytics({
  commentCount = 0,
  forumPostCount = 0,
  forumUpvotes = 0,
  followersCount = 0,
  followingCount = 0,
  reputationScore,
  reputationBreakdown = [],
  leaderboardRank = null,
  totalRankedUsers = null,
}: OverviewCommunityAnalyticsProps) {
  const tiles = [
    { label: 'Comments', value: commentCount, icon: MessageSquare, color: 'text-sky-400' },
    { label: 'Forum Posts', value: forumPostCount, icon: FileText, color: 'text-indigo-400' },
    { label: 'Upvotes', value: forumUpvotes, icon: ThumbsUp, color: 'text-emerald-400' },
    { label: 'Followers', value: followersCount, icon: UserPlus, color: 'text-rose-400' },
  ];

  return (
    <GlassPanel className="relative overflow-hidden p-5 sm:p-7 flex flex-col justify-between border-white/[0.04] bg-background/40 backdrop-blur-2xl rounded-2xl">
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-[hsl(var(--profile-accent)/0.10)] blur-[70px] rounded-full pointer-events-none" />

      <div className="relative z-10 flex items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-primary/80" />
            <h3 className="font-display font-bold text-base sm:text-lg text-foreground tracking-tight">
              Community Analytics
            </h3>
          </div>
          <p className="text-xs text-muted-foreground/70">Your presence across the community</p>
        </div>
        {leaderboardRank != null ? (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 shrink-0">
            <Trophy className="w-3.5 h-3.5" />
            <span className="font-bold font-display tabular-nums">#{leaderboardRank}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.05] text-muted-foreground/60 shrink-0">
            <Trophy className="w-3.5 h-3.5" />
            <span className="text-[11px] font-semibold">Unranked</span>
          </div>
        )}
      </div>

      <div className="relative z-10 space-y-5">
        {/* Metric tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {tiles.map((t) => {
            const Icon = t.icon;
            return (
              <div
                key={t.label}
                className="flex flex-col gap-1.5 p-3 rounded-xl bg-white/[0.015] border border-white/[0.03]"
              >
                <Icon className={`w-4 h-4 ${t.color}`} />
                <span className="font-display font-bold text-lg text-foreground tabular-nums">{t.value}</span>
                <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wide">
                  {t.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Reputation breakdown */}
        {reputationScore != null && (
          <div className="pt-4 border-t border-white/[0.04]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-muted-foreground/60" />
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                  Reputation
                </span>
              </div>
              <span className="font-display font-bold text-foreground tabular-nums">
                {reputationScore}
                <span className="text-xs text-muted-foreground/50">/100</span>
              </span>
            </div>

            {reputationBreakdown.length > 0 && (
              <div className="space-y-2">
                {reputationBreakdown.map((term) => (
                  <div key={term.key} className="flex items-center gap-3">
                    <span className="text-[11px] text-muted-foreground/70 w-24 shrink-0 truncate">
                      {term.label}
                    </span>
                    <div className="flex-1 h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary"
                        initial={{ width: 0 }}
                        whileInView={{ width: `${(term.value / term.weight) * 100}%` }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground/50 w-12 text-right tabular-nums">
                      {term.value}/{term.weight}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {leaderboardRank != null && totalRankedUsers ? (
              <p className="text-[10px] text-muted-foreground/50 mt-3">
                Ranked #{leaderboardRank} of {totalRankedUsers} active members
              </p>
            ) : null}
          </div>
        )}
      </div>
    </GlassPanel>
  );
}
