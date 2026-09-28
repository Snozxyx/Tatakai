import { Link } from 'react-router-dom';
import { Hash } from 'lucide-react';
import { useAllHashtags } from '@/hooks/community/useTrending';
import { cn } from '@/lib/utils';

/** All community hashtags with their usage counts (item 8). Scrolls when long. */
export function HashtagsWidget({ className }: { className?: string }) {
  const { data: tags = [], isLoading } = useAllHashtags(100);
  if (!isLoading && tags.length === 0) return null;

  const total = tags.reduce((sum, t) => sum + t.count, 0);

  return (
    <div
      className={cn(
        'group relative flex w-full flex-col overflow-hidden rounded-[24px] border border-white/[0.08] bg-[#08090b] shadow-[0_20px_60px_rgba(0,0,0,0.4)] transition-all hover:border-white/[0.12]',
        className,
      )}
    >
      {/* Ambient background glows */}
      <div className="pointer-events-none absolute -right-12 -top-12 h-56 w-56 rounded-full bg-violet-500/10 blur-[90px] transition-all group-hover:bg-violet-500/20" />
      <div className="pointer-events-none absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-primary/10 blur-[90px] transition-all group-hover:bg-primary/20" />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between p-5 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-violet-500/20 bg-violet-500/10">
            <Hash className="h-3.5 w-3.5 text-violet-400" />
          </div>
          <span className="text-[11px] font-bold uppercase tracking-widest text-violet-400">
            All Hashtags
          </span>
        </div>
        <span className="text-[10px] font-medium tabular-nums text-zinc-600">
          {tags.length} · {total}
        </span>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="relative z-10 flex flex-col gap-1 px-3 pb-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center justify-between rounded-2xl px-2 py-2.5 animate-pulse">
              <div className="h-3 w-28 rounded-full bg-white/5" />
              <div className="h-4 w-10 rounded-full bg-white/5" />
            </div>
          ))}
        </div>
      ) : (
        <div className="relative z-10 max-h-80 space-y-1 overflow-y-auto px-3 pb-4 no-scrollbar">
          {tags.map(({ tag, count }) => (
            <Link
              key={tag}
              to={`/community?tag=${encodeURIComponent(tag)}`}
              className="group/row flex items-center gap-3 rounded-2xl px-2 py-2 transition-all duration-300 hover:bg-white/[0.04]"
            >
              <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] font-semibold text-zinc-100 transition-colors group-hover/row:text-white">
                <Hash className="h-3.5 w-3.5 shrink-0 text-violet-400/70" />
                <span className="truncate">{tag}</span>
              </span>
              <span className="shrink-0 rounded-full border border-white/[0.06] bg-white/[0.03] px-2 py-0.5 text-[10px] font-bold tabular-nums text-zinc-500 transition-colors group-hover/row:text-zinc-300">
                {count}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
