import { useState } from 'react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useLeaderboard, LeaderboardType, useUserRank } from '@/hooks/useLeaderboard';
import { useAuth } from '@/contexts/AuthContext';
import { Trophy, Medal, Award, Users, Star, MessageSquare, TrendingUp, UserPlus } from 'lucide-react';
import { Link } from 'react-router-dom';

const LEADERBOARD_TYPES: Array<{ value: LeaderboardType; label: string; icon: any }> = [
  { value: 'watched', label: 'Most Watched', icon: Trophy },
  { value: 'rated', label: 'Most Rated', icon: Star },
  { value: 'comments', label: 'Most Comments', icon: MessageSquare },
  { value: 'active', label: 'Most Active', icon: TrendingUp },
  { value: 'followers', label: 'Most Followers', icon: UserPlus },
];

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="w-8 h-8 rounded-full bg-yellow-500 flex items-center justify-center text-white font-bold">
        <Trophy className="w-5 h-5" />
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="w-8 h-8 rounded-full bg-gray-400 flex items-center justify-center text-white font-bold">
        <Medal className="w-5 h-5" />
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="w-8 h-8 rounded-full bg-orange-600 flex items-center justify-center text-white font-bold">
        <Award className="w-5 h-5" />
      </div>
    );
  }
  return (
    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-bold">
      {rank}
    </div>
  );
}

function LeaderboardEntry({
  entry,
  currentUserId,
}: {
  entry: any;
  currentUserId?: string;
}) {
  const isCurrentUser = entry.user_id === currentUserId;

  return (
    <Link to={`/user/${entry.username || entry.user_id}`}>
      <GlassPanel
        hoverEffect
        className={`p-4 flex items-center gap-4 cursor-pointer transition-all ${isCurrentUser ? 'ring-2 ring-primary' : ''
          }`}
      >
        <RankBadge rank={entry.rank} />
        <Avatar className="w-12 h-12">
          <AvatarImage src={entry.avatar_url || ''} />
          <AvatarFallback>
            {entry.display_name?.[0] || entry.username?.[0] || 'U'}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-bold truncate">
              {entry.display_name || (entry.username && entry.username !== 'null' ? entry.username : 'Anonymous')}
            </p>
            {isCurrentUser && (
              <span className="px-2 py-0.5 bg-primary/20 text-primary text-xs rounded-full">
                You
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground truncate">
            @{entry.username && entry.username !== 'null' ? entry.username : 'user'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold">{entry.score.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">points</p>
        </div>
      </GlassPanel>
    </Link>
  );
}

export function Leaderboard() {
  const { user } = useAuth();
  const [type, setType] = useState<LeaderboardType>('watched');
  const { data: leaderboard, isLoading } = useLeaderboard(type, 100);
  const { data: userRank } = useUserRank(type, user?.id);

  const Icon = LEADERBOARD_TYPES.find((t) => t.value === type)?.icon || Trophy;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/20 rounded-lg">
            <Icon className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Leaderboard</h2>
            <p className="text-sm text-muted-foreground">
              Top community members
            </p>
          </div>
        </div>
      </div>

      {/* Type Selector */}
      <div className="flex flex-wrap gap-2">
        {LEADERBOARD_TYPES.map(({ value, label, icon: Icon }) => (
          <Button
            key={value}
            variant={type === value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setType(value)}
            className="gap-2"
          >
            <Icon className="w-4 h-4" />
            {label}
          </Button>
        ))}
      </div>

      {/* User Rank */}
      {userRank && (
        <GlassPanel className="p-4 bg-primary/10 border-primary/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Your Rank</p>
              <p className="text-2xl font-bold">
                #{userRank.rank} of {userRank.totalUsers.toLocaleString()}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Your Score</p>
              <p className="text-2xl font-bold">{userRank.score.toLocaleString()}</p>
            </div>
          </div>
        </GlassPanel>
      )}

      {/* Leaderboard List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <GlassPanel key={i} className="p-4">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 bg-muted rounded-full animate-pulse" />
                <div className="w-12 h-12 bg-muted rounded-full animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-1/3 animate-pulse" />
                  <div className="h-3 bg-muted rounded w-1/4 animate-pulse" />
                </div>
                <div className="h-6 bg-muted rounded w-16 animate-pulse" />
              </div>
            </GlassPanel>
          ))}
        </div>
      ) : leaderboard && leaderboard.length > 0 ? (
        <div className="space-y-3">
          {leaderboard.map((entry) => (
            <LeaderboardEntry
              key={entry.user_id}
              entry={entry}
              currentUserId={user?.id}
            />
          ))}
        </div>
      ) : (
        <GlassPanel className="p-8 text-center">
          <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">No leaderboard data available</p>
        </GlassPanel>
      )}
    </div>
  );
}
