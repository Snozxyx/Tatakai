import { getRankTier, getRankImageUrl } from '@/lib/rankUtils';
import { cn } from '@/lib/utils';

interface RankBadgeProps {
  episodeCount: number;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showImage?: boolean;
  showName?: boolean;
  className?: string;
}

// Maps rank number → CSS animation class defined in index.css
function getRankClass(rank: number): string {
  if (rank === 1)  return 'rn-gray';
  if (rank === 2)  return 'rn-gray2';
  if (rank <= 4)   return 'rn-nature';
  if (rank <= 6)   return 'rn-frost';
  if (rank <= 8)   return 'rn-spectral';
  if (rank <= 10)  return 'rn-electric';
  if (rank === 11) return 'rn-demon';
  if (rank <= 13)  return 'rn-sakura';
  if (rank === 14) return 'rn-fire';
  if (rank === 15) return 'rn-saiyan';
  return 'rn-onepunch';
}

const SIZE_CONFIG = {
  xs: { img: 'w-4 h-4',   text: 'text-[10px]', gap: 'gap-1' },
  sm: { img: 'w-5 h-5',   text: 'text-xs',     gap: 'gap-1' },
  md: { img: 'w-8 h-8',   text: 'text-sm',     gap: 'gap-1.5' },
  lg: { img: 'w-12 h-12', text: 'text-base',   gap: 'gap-2' },
};

export function RankBadge({
  episodeCount,
  size = 'sm',
  showImage = true,
  showName = true,
  className,
}: RankBadgeProps) {
  const tier = getRankTier(episodeCount);
  const { img, text, gap } = SIZE_CONFIG[size];
  const rankClass = getRankClass(tier.rank);

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
