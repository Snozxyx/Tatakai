import { getBadge, type BadgeDef, type BadgeMetricKey } from '@/lib/badges';
import { UserBadges } from '@/components/ui/UserBadges';

/** Theme data stays small; the canonical registry supplies full badge information. */
export function ProfileBadges({ badges, size = 26, max, grid = false, interactive = true, className, featuredKey, userStats }: {
  badges: readonly { key: string }[];
  size?: number;
  max?: number;
  grid?: boolean;
  interactive?: boolean;
  className?: string;
  featuredKey?: string | null;
  userStats?: Partial<Record<BadgeMetricKey, number>>;
}) {
  const resolved = badges.map(badge => getBadge(badge.key)).filter((badge): badge is BadgeDef => !!badge);
  return <UserBadges badges={resolved} size={size} max={max ?? resolved.length} layout={grid ? 'grid' : 'row'} appearance="plain" showLabels={grid} interactive={interactive} featuredKey={featuredKey ?? ''} userStats={userStats} className={className} />;
}
