import { useEffect, useState, type CSSProperties } from 'react';
import { Check, Lock, ShieldCheck } from 'lucide-react';
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
  const tier = earned && userStats && (badge.tiers?.length ?? 0) > 1 ? currentTier(badge, userStats) : -1;
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
      {level ? <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
        <div className="flex flex-wrap justify-between gap-2 text-muted-foreground">
          <span>{uiI18n.t('badgeUi.currentLevel')}</span>
          <span className="tabular-nums">{uiI18n.t('badgeUi.levelCount', { level: tier + 1, total: badge.tiers?.length })}</span>
        </div>
        <p className="mt-2 text-sm font-semibold">{level.name}</p>
        <p className="mt-1 leading-relaxed text-muted-foreground">{level.description}</p>
        {next && value != null ? <>
          <p className="mt-3 flex flex-wrap justify-between gap-2 text-muted-foreground"><span>{uiI18n.t('badgeUi.nextLevel', { name: next.name })}</span><span className="tabular-nums">{value}/{next.threshold}</span></p>
          <Progress aria-label={uiI18n.t('badgeUi.nextLevel', { name: next.name })} className="mt-2 h-1.5 bg-muted" value={Math.max(0, Math.min(100, (value - level.threshold) / (next.threshold - level.threshold) * 100))} />
        </> : !next && <p className="mt-3 flex items-center gap-1.5 font-medium"><Check aria-hidden="true" className="size-3.5 shrink-0" />{uiI18n.t('badgeUi.maxLevel')}</p>}
      </div> : <p className="text-xs leading-relaxed text-muted-foreground">{badge.description}</p>}
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
  const tier = visible && info.earned !== false && info.userStats ? currentTier(visible, info.userStats) : -1;
  const levelsKnown = info.earned === false || tier >= 0;
  return <Dialog open={!!badge} onOpenChange={open => { if (!open) onClose(); }}>
    {visible && <DialogContent style={style} overlayClassName="badge-widget-overlay z-[150]" aria-describedby={undefined} className="badge-widget-dialog z-[160] max-h-[85dvh] w-[calc(100vw-2rem)] max-w-sm overflow-y-auto rounded-2xl border-border bg-popover p-0 text-popover-foreground">
      <DialogHeader className="sr-only"><DialogTitle>{visible.label}</DialogTitle></DialogHeader>
      <div className="pt-8"><BadgeInfoCard badge={visible} {...info} /></div>
      {visible.tiers && visible.tiers.length > 1 && <section className="border-t border-border p-4">
        <p className="mb-3 text-xs font-medium">{uiI18n.t('badgeUi.levels')}</p>
        <div className="grid grid-cols-2 gap-2">{visible.tiers.map((level, index) => {
          const current = index === tier;
          const unlocked = index <= tier;
          const state = levelsKnown ? current ? 'current' : unlocked ? 'unlocked' : 'locked' : undefined;
          return <div key={level.name} aria-current={current ? 'step' : undefined} data-badge-level={state}
            className={cn('min-w-0 rounded-lg border p-3', current ? 'border-primary bg-primary/10' : unlocked ? 'border-border bg-muted/25' : 'border-border bg-background/50')}>
            <div className="flex items-start justify-between gap-2">
              <p className={cn('text-xs font-medium', state === 'locked' && 'text-muted-foreground')}>{level.name}</p>
              {levelsKnown && (unlocked ? <Check aria-hidden="true" className="size-3.5 shrink-0" /> : <Lock aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{level.description}</p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs">
              <span className="tabular-nums text-muted-foreground">{level.threshold} {uiI18n.t('app.required_1a77d416')}</span>
              {state && <span className={cn('font-medium', state === 'locked' && 'text-muted-foreground')}>{uiI18n.t(`badgeUi.${state}`)}</span>}
            </div>
          </div>;
        })}</div>
      </section>}
    </DialogContent>}
  </Dialog>;
}
