import './cosmetic-access.css';
import { getBadge } from '@/lib/badges';

/** Lists alternative qualifying badges, with readable labels for keyboard and touch users. */
export function CosmeticAccessBadges({ badgeKeys }: { badgeKeys: readonly string[] }) {
  if (!badgeKeys.length) return <span className="cosmetic-access-everyone">Everyone</span>;
  return <span className="cosmetic-access-badges" role="list" aria-label="Any one of these badges unlocks this item">{badgeKeys.map(key => {
    const badge = getBadge(key);
    return badge ? <span key={key} role="listitem" tabIndex={0} className="cosmetic-access-badge" aria-label={badge.label}><img src={badge.image} alt="" loading="lazy" /><span className="cosmetic-access-label">{badge.label}</span></span> : null;
  })}</span>;
}
