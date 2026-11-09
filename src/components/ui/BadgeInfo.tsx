import { useEffect, useState, type CSSProperties } from 'react';
import { ShieldCheck } from 'lucide-react';
import uiI18n from '@/lib/uiI18n';
import { cn } from '@/lib/utils';
import { RARITY_STYLES, currentTier, type BadgeDef, type BadgeMetricKey } from '@/lib/badges';
import { Badge } from './badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './dialog';
import { Progress } from './progress';
import './badge-widgets.css';

interface BadgeInfoProps {
  badge: BadgeDef;
  userStats?: Partial<Record<BadgeMetricKey, number>>;
  earned?: boolean;
  featured?: boolean;
}

/** One information payload for default profiles, themed profiles, and collections. */
export function BadgeInfoCard({ badge, userStats, earned = true, featured = false }: BadgeInfoProps) {
  const rarity = RARITY_STYLES[badge.rarity];
  const tier = userStats && badge.tiers ? currentTier(badge, userStats) : -1;
  const level = tier >= 0 ? badge.tiers?.[tier] : undefined;
  const next = tier >= 0 ? badge.tiers?.[tier + 1] : undefined;
  const value = badge.metricKey ? userStats?.[badge.metricKey] : undefined;
  return (
    <div className="badge-info-card flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <div className={cn('flex size-14 shrink-0 items-center justify-center rounded-xl border border-border bg-background', rarity.ring)}>
          <img src={badge.image} alt="" className="size-10 object-contain" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-tight">{badge.label}</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant="secondary" className="text-xs">{rarity.label}</Badge>
            {earned && <Badge variant="outline" className="gap-1 text-xs"><ShieldCheck className="size-3" />{uiI18n.t('badgeUi.earned')}</Badge>}
          </div>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{badge.description}</p>
      {level && <div className="rounded-lg bg-muted/50 p-3 text-xs">
        <div className="flex justify-between gap-2"><strong>{level.name}</strong><span className="text-muted-foreground">{tier + 1}/{badge.tiers?.length}</span></div>
        {next && value != null && <><p className="mt-2 flex justify-between gap-2 text-muted-foreground"><span>{next.name}</span><span className="tabular-nums">{value}/{next.threshold}</span></p><Progress className="mt-2 h-1.5" value={Math.max(0, Math.min(100, (value - level.threshold) / (next.threshold - level.threshold) * 100))} /></>}
      </div>}
      {badge.rule && <div className="border-t border-border pt-3">
        <p className="mb-1 text-xs font-medium">{uiI18n.t('app.how_to_earn_a737a7d0')}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">{badge.rule}</p>
      </div>}
      {featured && <p className="text-xs font-medium text-muted-foreground">{uiI18n.t('app.featured_badge_5a25680b')}</p>}
    </div>
  );
}

export function BadgeInfoDialog({ badge, onClose, style, ...info }: Omit<BadgeInfoProps, 'badge'> & { badge: BadgeDef | null; onClose(): void; style?: CSSProperties }) {
  const [shown, setShown] = useState<BadgeDef | null>(badge);
  useEffect(() => { if (badge) setShown(badge); }, [badge]);
  const visible = badge ?? shown;
  return <Dialog open={!!badge} onOpenChange={open => { if (!open) onClose(); }}>
    {visible && <DialogContent style={style} overlayClassName="badge-widget-overlay z-[150]" aria-describedby={undefined} className="badge-widget-dialog z-[160] max-h-[85dvh] w-[calc(100vw-2rem)] max-w-sm overflow-y-auto rounded-2xl border-border bg-popover p-0 text-popover-foreground">
      <DialogHeader className="sr-only"><DialogTitle>{visible.label}</DialogTitle></DialogHeader>
      <div className="pt-8"><BadgeInfoCard badge={visible} {...info} /></div>
      {visible.tiers && visible.tiers.length > 1 && <section className="border-t border-border p-4">
        <p className="mb-3 text-xs font-medium">{uiI18n.t('badgeUi.levels')}</p>
        <div className="grid grid-cols-2 gap-2">{visible.tiers.map(level => <div key={level.name} className="rounded-lg border border-border bg-background/50 p-3"><p className="text-xs font-medium">{level.name}</p><p className="mt-1 text-xs text-muted-foreground">{level.description}</p><p className="mt-2 text-xs tabular-nums text-muted-foreground">{level.threshold} {uiI18n.t('app.required_1a77d416')}</p></div>)}</div>
      </section>}
    </DialogContent>}
  </Dialog>;
}
