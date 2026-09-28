import { getRankTier, getRankImageUrl, getRankClassForRank } from '@/lib/rankUtils';
import { cn } from '@/lib/utils';

interface RankBadgeProps {
  /** Unified rank score (RP) — see computeRankScore in rankUtils. */
  score: number;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showImage?: boolean;
  showName?: boolean;
  className?: string;
}

const SIZE_CONFIG = {
  xs: { img: 'w-4 h-4',   text: 'text-[10px]', gap: 'gap-1' },
  sm: { img: 'w-5 h-5',   text: 'text-xs',     gap: 'gap-1' },
  md: { img: 'w-8 h-8',   text: 'text-sm',     gap: 'gap-1.5' },
  lg: { img: 'w-12 h-12', text: 'text-base',   gap: 'gap-2' },
};

export function RankBadge({
  score,
  size = 'sm',
  showImage = true,
  showName = true,
  className,
}: RankBadgeProps) {
  const tier = getRankTier(score);
  const { img, text, gap } = SIZE_CONFIG[size];
  const rankClass = getRankClassForRank(tier.rank);

  return (
    <span className={cn('inline-flex items-center', gap, className)}>
      {showImage && (
        <img
          src={getRankImageUrl(tier.rank)}
          alt={tier.name}
          className={cn(img, 'object-contain flex-shrink-0')}
        />
      )}
      {showName && (
        <span className={cn(text, rankClass)}>
          {tier.name}
        </span>
      )}
    </span>
  );
}
