  import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Users, Check, Plus, BadgeCheck, ArrowUpRight } from 'lucide-react';
import { getProxiedImageUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useCommunities, useToggleCommunityMembership } from '@/hooks/community/useCommunities';
import { useAuth } from '@/contexts/AuthContext';

export function CommunitiesShowcase({ onOpen }: { onOpen?: (communityId: string) => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: communities = [], isLoading } = useCommunities();
  const toggle = useToggleCommunityMembership();

  if (!isLoading && communities.length === 0) return null;

  return (
    <div className="w-full">
      {/* Section Header */}
      <div className="mb-4 flex items-center gap-2 px-1">
        <Users className="h-4 w-4 text-zinc-400" />
        <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">
          Discover Communities
        </p>
      </div>

      {/* Stable-size cards keep the row readable while scrolling; expanding cards
          made every neighbouring community jump on hover. */}
      <div className="flex gap-4 overflow-x-auto pb-4 pt-1 no-scrollbar snap-x scroll-smooth">
        {isLoading
          ? [...Array(5)].map((_, i) => (
              <div
                key={i}
                className="h-[224px] w-[220px] flex-shrink-0 animate-pulse snap-start rounded-[24px] border border-white/[0.05] bg-white/[0.02] sm:w-[248px]"
              />
            ))
          : communities.map((c, i) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.2) }}
                onClick={() => (onOpen ? onOpen(c.id) : navigate(`/community/c/${c.slug}`))}
                role="link"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onOpen ? onOpen(c.id) : navigate(`/community/c/${c.slug}`);
                  }
                }}
                className="community-card community-card-hover group relative flex h-[224px] w-[220px] flex-shrink-0 cursor-pointer snap-start flex-col sm:w-[248px]"
              >
                {/* Background Image Layer */}
                <div className="absolute inset-0 bg-muted">
                  {c.banner_url || c.icon_url ? (
                    <img
                      src={getProxiedImageUrl((c.banner_url || c.icon_url)!)}
                      alt={c.name}
                      className="h-full w-full object-cover opacity-75 transition-opacity duration-300 ease-out group-hover:opacity-100"
                    />
                  ) : (
                    <div className="h-full w-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20" />
                  )}
                  
                  <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-transparent" />
                </div>

                {/* Content Layer */}
                <div className="relative z-10 flex h-full flex-col justify-end p-4">
                  <div className="mb-auto flex items-center justify-end">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/30 text-white/70 backdrop-blur-md transition-colors group-hover:border-primary/40 group-hover:text-white">
                      <ArrowUpRight className="h-4 w-4" />
                    </span>
                  </div>
                  <div className="flex items-end justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1 text-base font-bold leading-tight text-zinc-100 drop-shadow-md transition-colors group-hover:text-white">
                        <span className="truncate">{c.name}</span>
                        {c.is_verified && (
                          <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-sky-400" aria-label="Verified community" />
                        )}
                      </p>
                      
                      {c.description && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-300/85">{c.description}</p>}
                      <div className="mt-2 flex items-center gap-1.5 text-[10px] font-medium text-zinc-300 drop-shadow-md">
                        <span>{(c.member_count || 0).toLocaleString()} members</span>
                        <span className="h-1 w-1 shrink-0 rounded-full bg-zinc-400" />
                        <span className="flex shrink-0 items-center gap-1">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          </span>
                          {Math.floor((c.member_count || 10) * 0.1)}
                        </span>
                      </div>
                    </div>

                    {/* Join / Joined Action Button */}
                    {user && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggle.mutate({ communityId: c.id, isMember: c.is_member });
                        }}
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-[background-color,border-color,color,transform] duration-200 active:scale-95",
                          c.is_member
                            ? "bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.3)]"
                            : "border border-white/[0.15] bg-black/40 text-white backdrop-blur-md hover:bg-white/10"
                        )}
                      >
                        {c.is_member ? (
                          <Check className="h-4 w-4 stroke-[2.5px]" />
                        ) : (
                          <Plus className="h-4 w-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
                
                <div className="pointer-events-none absolute inset-0 rounded-[24px] ring-1 ring-inset ring-white/10" />
              </motion.div>
            ))}
      </div>
    </div>
  );
}
