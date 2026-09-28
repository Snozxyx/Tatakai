import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tv, ChevronRight } from 'lucide-react';
import { useAiringSchedule, type AiringEntry } from '@/hooks/api/useAiringSchedule';
import { getProxiedImageUrl } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface AiringWidgetProps {
  className?: string;
}

function formatAiring(airingAt: number): string {
  const ms = airingAt * 1000;
  const diff = ms - Date.now();
  const d = new Date(ms);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (diff < 60 * 60 * 1000) return `in ${Math.max(1, Math.round(diff / 60000))}m`;

  const today = new Date();
  const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  if (isSameDay(d, today)) return `Today · ${time}`;
  if (isSameDay(d, tomorrow)) return `Tomorrow · ${time}`;
  return `${d.toLocaleDateString([], { weekday: 'short' })} · ${time}`;
}

export function AiringWidget({ className }: AiringWidgetProps) {
  const navigate = useNavigate();

  const weekStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const { data: entries = [], isLoading } = useAiringSchedule(weekStart);

  const upcoming = useMemo(() => {
    const nowSec = Date.now() / 1000;
    return [...entries]
      .filter((e) => e.airingAt > nowSec)
      .sort((a, b) => a.airingAt - b.airingAt)
      .slice(0, 6);
  }, [entries]);

  const goTo = (entry: AiringEntry) => navigate(`/anime/${entry.mediaId}`);

  return (
    <div
      className={cn(
        'group relative flex w-full flex-col overflow-hidden rounded-[24px] border border-white/[0.08] bg-[#08090b] shadow-[0_20px_60px_rgba(0,0,0,0.4)] transition-all hover:border-white/[0.12]',
        className
      )}
    >
      {/* Ambient background glows */}
      <div className="pointer-events-none absolute -right-12 -top-12 h-56 w-56 rounded-full bg-rose-500/10 blur-[90px] transition-all group-hover:bg-rose-500/20" />
      <div className="pointer-events-none absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-violet-500/10 blur-[90px] transition-all group-hover:bg-violet-500/20" />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between p-5 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-rose-500/20 bg-rose-500/10">
            <Tv className="h-3.5 w-3.5 text-rose-400" />
          </div>
          <span className="text-[11px] font-bold uppercase tracking-widest text-rose-400">
            Airing This Week
          </span>
        </div>
      </div>

      {/* List */}
      <div className="relative z-10 flex flex-col gap-1 px-3 pb-4">
        {isLoading ? (
          [...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-2xl px-2 py-2 animate-pulse">
              <div className="h-14 w-10 shrink-0 rounded-lg bg-white/5" />
              <div className="flex-1 space-y-2 py-1">
                <div className="h-3 w-28 rounded-full bg-white/5" />
                <div className="h-2.5 w-16 rounded-full bg-white/5" />
              </div>
            </div>
          ))
        ) : upcoming.length === 0 ? (
          <p className="px-2 py-6 text-center text-[13px] text-zinc-500">Nothing airing soon.</p>
        ) : (
          upcoming.map((entry) => (
            <button
              key={entry.id}
              onClick={() => goTo(entry)}
              className="group/row flex items-center gap-3 rounded-2xl px-2 py-2 text-left transition-all duration-300 hover:bg-white/[0.04]"
            >
              <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-lg border border-white/[0.05] bg-zinc-900 shadow-md">
                {entry.coverImage ? (
                  <img
                    src={getProxiedImageUrl(entry.coverImage)}
                    alt={entry.title}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover/row:scale-110"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-zinc-800">
                    <Tv className="h-4 w-4 text-zinc-600" />
                  </div>
                )}
                <div className="absolute inset-0 rounded-lg ring-1 ring-inset ring-white/10 pointer-events-none" />
              </div>

              <div className="min-w-0 flex-1 py-0.5">
                <p className="truncate text-[13px] font-semibold text-zinc-100 transition-colors group-hover/row:text-white">
                  {entry.title}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="rounded border border-rose-500/20 bg-rose-500/10 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-rose-300">
                    EP {entry.episode}
                  </span>
                  <span className="text-[11px] font-medium text-zinc-500">
                    {formatAiring(entry.airingAt)}
                  </span>
                </div>
              </div>

              <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600 transition-all group-hover/row:translate-x-0.5 group-hover/row:text-white" />
            </button>
          ))
        )}
      </div>
    </div>
  );
}
