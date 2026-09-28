import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { MessageCircle, Repeat2, Heart, Bookmark, Share, MoreHorizontal, Users, Play, Globe, Lock, Tv2 } from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getProxiedImageUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { WatchRoom } from '@/hooks/media/useWatchRoom';

/**
 * Compact "Watch Together · LOBBY" card embedded inside a post-style feed item.
 * Features a cinematic backdrop, glowing progress bar, and premium badges.
 */
export function WatchroomLobbyCard({ room }: { room: WatchRoom }) {
  const navigate = useNavigate();
  const seats = room.max_participants || 0;
  const filled = room.participant_count || 0;
  const pct = seats > 0 ? Math.min(100, Math.round((filled / seats) * 100)) : 0;
  const AccessIcon = room.access_type === 'password' ? Lock : Globe;

  return (
    <div
      className="group relative cursor-pointer overflow-hidden rounded-2xl border border-white/[0.08] bg-black/40 transition-all duration-300 hover:border-primary/50 "
      onClick={() => navigate(`/isshoni/room/${room.id}`)}
    >
      {/* Cinematic Backdrop */}
      <div className="absolute inset-0 z-0">
        {room.anime_poster ? (
          <img src={getProxiedImageUrl(room.anime_poster)} alt="" className="h-full w-full object-cover opacity-50 transition-transform duration-700 group-hover:scale-105" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-primary/20 to-secondary/20" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/80 to-background/10" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/50 to-transparent" />
      </div>

      {/* Live Badge */}
      {room.is_playing && (
        <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-md border border-rose-500/30 bg-rose-500/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-rose-400 backdrop-blur-md">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.8)]" />
          Live
        </div>
      )}

      {/* Content */}
      <div className="relative z-10 p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-2">
          <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/80">
            <Tv2 className="h-3.5 w-3.5" /> Watch Together
          </span>
          <span className="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
            <AccessIcon className="h-2.5 w-2.5" />
            Lobby
          </span>
        </div>

        <h4 className="font-display text-lg sm:text-xl font-bold tracking-tight text-white transition-colors group-hover:text-primary">
          {room.name}
        </h4>

        {room.anime_title && (
          <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-white/70">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/20">
              <Play className="h-2 w-2 text-primary" fill="currentColor" />
            </span>
            <span className="truncate">
              {room.anime_title}
              {room.episode_number ? <span className="text-white/40"> • EP {room.episode_number}</span> : ''}
            </span>
          </p>
        )}

        <div className="mt-4 flex items-end justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 pr-2">
              <span className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                {filled}/{seats} Joined
              </span>
              <span>{pct}%</span>
            </div>
            
            {/* Glowing Progress Bar */}
            <div className="h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-white/10 shadow-inner">
              <div 
                className="h-full rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary)/0.6)] transition-all duration-700 ease-out" 
                style={{ width: `${pct}%` }} 
              />
            </div>
          </div>
          
          <Button
            size="sm"
            className="h-8 flex-shrink-0 rounded-full px-6 text-xs font-bold shadow-lg transition-transform active:scale-95 group-hover:bg-primary group-hover:text-primary-foreground group-hover:shadow-[0_0_16px_hsl(var(--primary)/0.4)]"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/isshoni/room/${room.id}`);
            }}
          >
            Join Room
          </Button>
        </div>
      </div>
    </div>
  );
}

function FeedAction({ icon: Icon, count, active, activeClass, hoverClass, label, onClick }: {
  icon: any; count?: number; active?: boolean; activeClass?: string; hoverClass: string; label: string; onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        'group flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition-all duration-200 ease-out',
        hoverClass,
        active && activeClass
      )}
    >
      <Icon className={cn(
        'h-[18px] w-[18px] transition-transform duration-200 group-active:scale-90', 
        active ? 'fill-current' : 'group-hover:scale-110'
      )} />
      {count !== undefined && count > 0 && <span className="tabular-nums">{count}</span>}
    </button>
  );
}

/** A watchroom rendered as a host-attributed feed post. */
export function WatchroomFeedItem({ room }: { room: WatchRoom }) {
  const host = room.host_profile;
  const hostName = host?.display_name || host?.username || 'Someone';
  const [liked, setLiked] = useState(false);
  const [reposted, setReposted] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);

  const share = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}/isshoni/room/${room.id}`;
    navigator.clipboard?.writeText(url).then(
      () => toast.success('Lobby link copied'),
      () => toast.error('Could not copy link'),
    );
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      {/* Matches PostCard container style */}
      <GlassPanel className="p-4 sm:p-5 transition-all duration-300 border border-white/5 hover:border-white/15 hover:shadow-[0_4px_24px_-8px_rgba(0,0,0,0.5)]">
        
        <div className="flex gap-3">
          <Link to={host?.username ? `/@${host.username}` : '#'} onClick={(e) => e.stopPropagation()} className="shrink-0 mt-0.5">
            <Avatar className="h-11 w-11 ring-1 ring-white/10 transition-transform hover:scale-105">
              <AvatarImage src={host?.avatar_url || undefined} className="object-cover" />
              <AvatarFallback>{hostName[0]?.toUpperCase() || 'U'}</AvatarFallback>
            </Avatar>
          </Link>

          <div className="min-w-0 flex-1">
            {/* Header */}
            <div className="flex items-center gap-1.5 text-sm">
              <Link
                to={host?.username ? `/@${host.username}` : '#'}
                onClick={(e) => e.stopPropagation()}
                className="truncate font-bold text-[15px] text-foreground hover:underline decoration-white/30 underline-offset-2"
              >
                {hostName}
              </Link>
              {host?.username && <span className="truncate text-muted-foreground/70 hidden sm:inline-block">@{host.username}</span>}
              <span className="text-muted-foreground/50">·</span>
              <span className="whitespace-nowrap text-[13px] text-muted-foreground/80 hover:underline cursor-pointer">
                {formatDistanceToNow(new Date(room.created_at), { addSuffix: true })}
              </span>
              <button type="button" aria-label="More" className="ml-auto rounded-full p-2 text-muted-foreground hover:bg-white/10  transition-colors mt-[-8px] mr-[-8px]">
                <MoreHorizontal className="h-5 w-5" />
              </button>
            </div>

            <p className="mt-0.5 text-[15px] text-foreground/90 leading-relaxed">
              Started a new Watch Together lobby.
            </p>

            {/* Embedded Lobby Card */}
            <div className="mt-3.5 mb-1">
              <WatchroomLobbyCard room={room} />
            </div>

            {/* Action Bar (Matches PostCard) */}
            <div className="mt-2 flex items-center justify-between border-t border-white/[0.06] pt-3 -mx-2 pr-2">
              <div className="flex items-center gap-1 sm:gap-4">
                <FeedAction 
                  icon={Heart} 
                  count={liked ? 1 : 0} 
                  active={liked} 
                  activeClass="text-rose-500" 
                  hoverClass="hover:text-rose-500 hover:bg-rose-500/10" 
                  label="Like" 
                  onClick={(e) => { e.stopPropagation(); setLiked((v) => !v); }} 
                />
                <FeedAction 
                  icon={MessageCircle} 
                  count={0} 
                  hoverClass="hover:text-blue-400 hover:bg-blue-400/10" 
                  label="Comment" 
                  onClick={(e) => e.stopPropagation()} 
                />
                <FeedAction 
                  icon={Repeat2} 
                  count={reposted ? 1 : 0} 
                  active={reposted} 
                  activeClass="text-emerald-500" 
                  hoverClass="hover:text-emerald-500 hover:bg-emerald-500/10" 
                  label="Repost" 
                  onClick={(e) => { e.stopPropagation(); setReposted((v) => !v); }} 
                />
              </div>
              
              <div className="flex items-center gap-1">
                <FeedAction 
                  icon={Bookmark} 
                  active={bookmarked} 
                  activeClass="text-primary" 
                  hoverClass="hover:text-primary hover:bg-primary/10" 
                  label="Bookmark" 
                  onClick={(e) => { e.stopPropagation(); setBookmarked((v) => !v); }} 
                />
                <FeedAction 
                  icon={Share} 
                  hoverClass="hover:text-sky-400 hover:bg-sky-400/10" 
                  label="Share" 
                  onClick={share} 
                />
              </div>
            </div>

          </div>
        </div>
      </GlassPanel>
    </motion.div>
  );
}