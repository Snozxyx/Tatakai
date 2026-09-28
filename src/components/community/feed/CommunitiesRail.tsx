import { Link } from 'react-router-dom';
import { Layers, Music2, Radio, Trophy, Bookmark, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RailItem {
  key: string;
  to?: string;
  onClick?: () => void;
  label: string;
  hint: string;
  icon: React.ElementType;
  accentText: string;
  glowColor: string;
  iconBadge: string;
}

export function CommunitiesRail({ onLeaderboard }: { onLeaderboard?: () => void }) {
  const items: RailItem[] = [
    {
      key: 'tierlists',
      to: '/tierlists',
      label: 'Tier Lists',
      hint: 'Rank your favorites',
      icon: Layers,
      accentText: 'group-hover:text-indigo-400',
      glowColor: 'bg-indigo-500/10 group-hover:bg-indigo-500/20',
      iconBadge: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400',
    },
    {
      key: 'playlists',
      to: '/playlists',
      label: 'Playlists',
      hint: 'Curated collections',
      icon: Music2,
      accentText: 'group-hover:text-violet-400',
      glowColor: 'bg-violet-500/10 group-hover:bg-violet-500/20',
      iconBadge: 'bg-violet-500/10 border-violet-500/20 text-violet-400',
    },
    {
      key: 'isshoni',
      to: '/isshoni',
      label: 'Watch2Together',
      hint: 'Watch in sync',
      icon: Radio,
      accentText: 'group-hover:text-rose-400',
      glowColor: 'bg-rose-500/10 group-hover:bg-rose-500/20',
      iconBadge: 'bg-rose-500/10 border-rose-500/20 text-rose-400',
    },
    {
      key: 'bookmarks',
      to: '/community/bookmarks',
      label: 'Bookmarks',
      hint: 'Your saved posts',
      icon: Bookmark,
      accentText: 'group-hover:text-emerald-400',
      glowColor: 'bg-emerald-500/10 group-hover:bg-emerald-500/20',
      iconBadge: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
    },
    {
      key: 'leaderboard',
      onClick: onLeaderboard,
      label: 'Leaderboard',
      hint: 'Top members',
      icon: Trophy,
      accentText: 'group-hover:text-amber-400',
      glowColor: 'bg-amber-500/10 group-hover:bg-amber-500/20',
      iconBadge: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
    },
  ];

  return (
    <div className="flex gap-3.5 overflow-x-auto pb-2 pt-1 no-scrollbar scroll-smooth">
      {items.map(({ key, to, onClick, label, hint, icon: Icon, accentText, glowColor, iconBadge }) => {
        const cardContent = (
          <>
            {/* Ambient background glow */}
            <div className={cn("pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full blur-[40px] transition-all duration-500", glowColor)} />

            {/* Top Row: Icon Badge + Hover Arrow */}
            <div className="relative z-10 flex items-center justify-between">
              <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl border backdrop-blur-md transition-transform duration-300 group-hover:scale-110", iconBadge)}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/0 text-zinc-500 opacity-0 transition-all duration-300 group-hover:bg-white/10 group-hover:text-white group-hover:opacity-100">
                <ArrowUpRight className="h-3.5 w-3.5" />
              </div>
            </div>

            {/* Bottom Row: Text Labels */}
            <div className="relative z-10 mt-6">
              <p className={cn("font-display text-sm font-bold tracking-tight text-white transition-colors", accentText)}>
                {label}
              </p>
              <p className="mt-0.5 text-[11px] font-medium text-zinc-400 transition-colors group-hover:text-zinc-300">
                {hint}
              </p>
            </div>
          </>
        );

        const cardClasses = cn(
          "group relative flex min-w-[170px] flex-1 flex-col justify-between overflow-hidden rounded-[20px] border border-white/[0.08] bg-[#08090b] p-4 text-left shadow-lg backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-white/[0.15] hover:shadow-[0_12px_30px_rgba(0,0,0,0.5)] active:translate-y-0"
        );

        if (to) {
          return (
            <Link key={key} to={to} className={cardClasses}>
              {cardContent}
            </Link>
          );
        }

        return (
          <button key={key} type="button" onClick={onClick} className={cardClasses}>
            {cardContent}
          </button>
        );
      })}
    </div>
  );
}