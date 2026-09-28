import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { useFollowAlongRail } from '@/hooks/ui/useFollowAlongRail';
import type { PresenceUser } from '@/hooks/community/useCommunityPresence';
import { MembersShowcaseWidget } from './MembersShowcaseWidget';
import { WatchTogetherWidget } from './WatchTogetherWidget';
import { AiringWidget } from './AiringWidget';
import { SocialWidget } from './SocialWidget';
import { TierListWidget } from './TierListWidget';
import { PlaylistWidget } from './PlaylistWidget';
import { MyPlaylistsWidget } from './MyPlaylistsWidget';
import { TrendingRail } from './TrendingRail';
import { HashtagsWidget } from './HashtagsWidget';
import { LeaderboardCard } from '@/components/community/LeaderboardCard';
import { cn } from '@/lib/utils';

interface ShowcaseMember {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export interface CommunityRightRailProps {
  /** Live presence set (green dots + online-first ordering). */
  onlineUserIds: Set<string>;
  /** Global feed mode: presence list seeds the members showcase. */
  onlineUsers?: PresenceUser[];
  /**
   * Community mode: the roster of THIS community. When supplied, the members
   * showcase switches to community-scoped mode instead of global online users.
   */
  members?: ShowcaseMember[];
  /** Opens the leaderboard sheet (page owns the sheet state). */
  onOpenLeaderboard: () => void;
  /** Space-specific widgets rendered above the shared stack (Info/Staff). */
  header?: ReactNode;
  className?: string;
}

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 15 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, delay, ease: 'easeOut' as const },
});

/**
 * X/Twitter-style follow-along right rail shared by the community feed
 * (`/community`) and community spaces (`/community/c/:slug`). Scrolls with the
 * feed, then pins its bottom once taller than the viewport. All widgets are
 * self-contained (react-query cached); only presence, roster, and the
 * leaderboard-open handler are passed in.
 */
export function CommunityRightRail({
  onlineUserIds,
  onlineUsers,
  members,
  onOpenLeaderboard,
  header,
  className,
}: CommunityRightRailProps) {
  const { ref: railRef, style: railStyle } = useFollowAlongRail();
  const scoped = Array.isArray(members);

  return (
    <aside className={cn('hidden w-[380px] shrink-0 self-stretch 2xl:w-[420px] xl:block', className)}>
      <div ref={railRef} style={railStyle} className="sticky flex w-full flex-col gap-6">
        {header}

        <motion.div {...fade(0)}>
          <MembersShowcaseWidget
            onlineUsers={onlineUsers}
            onlineUserIds={onlineUserIds}
            members={scoped ? members : undefined}
            title={scoped ? 'Community' : 'Members'}
            limit={scoped ? 24 : 20}
            className="w-full"
          />
        </motion.div>

        <motion.div {...fade(0.03)}>
          <WatchTogetherWidget className="w-full" />
        </motion.div>

        <motion.div {...fade(0.05)}>
          <AiringWidget className="w-full" />
        </motion.div>

        <motion.div {...fade(0.1)}>
          <SocialWidget onlineUserIds={onlineUserIds} className="w-full" />
        </motion.div>

        <motion.div {...fade(0.15)}>
          <TierListWidget className="w-full" />
        </motion.div>

        <motion.div {...fade(0.2)}>
          <PlaylistWidget className="w-full" />
        </motion.div>

        <motion.div {...fade(0.22)}>
          <MyPlaylistsWidget className="w-full" />
        </motion.div>

        <motion.div {...fade(0.25)}>
          <LeaderboardCard onOpen={onOpenLeaderboard} className="w-full" />
        </motion.div>

        <motion.div {...fade(0.3)}>
          <TrendingRail className="w-full" />
        </motion.div>

        <motion.div {...fade(0.35)}>
          <HashtagsWidget className="w-full" />
        </motion.div>
      </div>
    </aside>
  );
}
