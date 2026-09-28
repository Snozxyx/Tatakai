import { cn } from '@/lib/utils';
import { Check, BarChart2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { getProxiedImageUrl } from '@/lib/api';
import type { PollResult } from '@/hooks/community/usePostPolls';

interface PollProps {
  question?: string;
  results: PollResult[];
  votesCount: number;
  userVote: number | null;
  endsAt?: string | null;
  isClosed?: boolean;
  onVote?: (optionIndex: number) => void;
  disabled?: boolean;
}

export function Poll({
  question,
  results,
  votesCount,
  userVote,
  endsAt,
  isClosed = false,
  onVote,
  disabled = false,
}: PollProps) {
  const hasVoted = userVote !== null;
  const showResults = hasVoted || isClosed;
  const locked = disabled || isClosed;

  const endsLabel = endsAt
    ? isClosed
      ? 'Final results'
      : `Ends ${formatDistanceToNow(new Date(endsAt), { addSuffix: true })}`
    : null;

  return (
    <div className="flex flex-col gap-3.5 w-full">
      {question && (
        <h4 className="text-base sm:text-[17px] font-semibold tracking-tight text-foreground leading-snug">
          {question}
        </h4>
      )}

      <div className="flex flex-col gap-2.5">
        {results.map((result, index) => {
          const isChoice = userVote === index;
          
          return (
            <button
              key={index}
              type="button"
              disabled={locked || showResults}
              onClick={() => onVote?.(index)}
              className={cn(
                'group relative w-full overflow-hidden rounded-xl border text-left transition-all duration-300',
                showResults
                  ? isChoice
                    ? 'border-primary/40 bg-primary/[0.03] ring-1 ring-primary/20 cursor-default shadow-sm'
                    : 'border-white/[0.08] bg-white/[0.02] cursor-default'
                  : 'border-white/10 bg-white/[0.03] hover:border-primary/50 hover:bg-white/[0.06] hover:shadow-md cursor-pointer'
              )}
            >
              {/* Progress Bar Fill */}
              {showResults && (
                <div
                  className={cn(
                    'absolute inset-y-0 left-0 transition-all duration-700 ease-out',
                    isChoice ? 'bg-primary/20' : 'bg-white/[0.06]'
                  )}
                  style={{ width: `${result.percent}%` }}
                />
              )}

              {/* Content Wrapper */}
              <div className="relative flex items-center justify-between gap-3 p-3 sm:p-4 min-h-[4rem]">
                <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                  
                  {/* Larger Image */}
                  {result.image && (
                    <div className="shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/20 shadow-sm transition-transform duration-300 group-hover:scale-105">
                      <img 
                        src={getProxiedImageUrl(result.image)} 
                        alt="" 
                        className="h-12 w-12 sm:h-16 sm:w-16 object-cover" 
                      />
                    </div>
                  )}

                  {/* Text & Badges */}
                  <div className="flex flex-col justify-center min-w-0 py-0.5">
                    <span className={cn(
                      "text-sm sm:text-[15px] font-medium leading-snug break-words",
                      showResults && isChoice ? "text-foreground" : "text-foreground/90"
                    )}>
                      {result.option}
                    </span>
                    
                    {/* Explicit "Your Vote" Indicator underneath text */}
                    {showResults && isChoice && (
                      <span className="flex items-center gap-1 mt-1 text-[11px] font-bold uppercase tracking-wider text-primary">
                        <Check className="h-3.5 w-3.5 stroke-[3]" /> Your Vote
                      </span>
                    )}
                  </div>
                </div>

                {/* Percentage Display */}
                {showResults && (
                  <div className="flex flex-col items-end shrink-0 pl-3">
                    <span className={cn(
                      "text-lg sm:text-xl font-bold tabular-nums tracking-tight",
                      isChoice ? "text-primary" : "text-foreground/90"
                    )}>
                      {result.percent}%
                    </span>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer Info */}
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground/70 px-1 pt-0.5">
        <span className="flex items-center gap-1.5 tabular-nums">
          <BarChart2 className="h-3.5 w-3.5" />
          {votesCount.toLocaleString()} {votesCount === 1 ? 'vote' : 'votes'}
        </span>
        {endsLabel && (
          <>
            <span className="text-white/20">•</span>
            <span>{endsLabel}</span>
          </>
        )}
      </div>
    </div>
  );
}