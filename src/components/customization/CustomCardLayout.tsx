import { type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { CardDesign, CardSlotId, CardSlotZone } from '@/lib/customization';
import { AppearanceBackground } from '@/components/settings/BackgroundEditor';
import { CARD_SLOT_DEFAULTS_BY_BASE, SLOT_ZONES } from './CardDesignContext';
import { BookOpen, Film } from 'lucide-react';
import { readableBadgeLabel } from '@/lib/media/badgeLabel';

export type CardSlotContent = Partial<Record<CardSlotId, ReactNode>>;

function renderInfoBadge(id: 'type' | 'status', value: ReactNode) {
  const text = typeof value === 'string' ? readableBadgeLabel(value) : value;
  const Icon = id === 'type' && typeof value === 'string'
    ? /manga|manhwa|manhua|novel|comic/i.test(value) ? BookOpen : Film
    : null;
  return (
    <span className="custom-card-info-badge" data-badge-kind={id} data-status={id === 'status' && typeof value === 'string' ? value : undefined}>
      {id === 'status' ? <span aria-hidden className="custom-card-status-dot" /> : Icon && <Icon aria-hidden className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />}
      <span className="min-w-0 truncate">{text}</span>
    </span>
  );
}

export function CustomCardLayout({ design, title, href, poster, slots, safety, footer, readOnly }: {
  design: CardDesign; title: string; href?: string | null; poster: ReactNode; slots: CardSlotContent; safety?: ReactNode; footer?: ReactNode; readOnly?: boolean;
}) {
  const styling = design.style || {};
  const base = design.base === 'poster' ? 'poster' : 'overlay';
  const radius = styling.radius ?? 16;
  const groups = new Map<CardSlotZone, CardSlotId[]>();
  for (const id of Object.keys(slots) as CardSlotId[]) {
    const config = { ...CARD_SLOT_DEFAULTS_BY_BASE[base][id], ...design.slots?.[id] };
    if (!config.visible || slots[id] === undefined || slots[id] === null || slots[id] === false) continue;
    const zone = SLOT_ZONES.includes(config.zone) ? config.zone : 'below';
    groups.set(zone, [...(groups.get(zone) || []), id]);
  }
  const renderZone = (zone: CardSlotZone) => {
    const ids = groups.get(zone);
    if (!ids?.length) return null;
    ids.sort((a, b) => (design.slots?.[a]?.order ?? CARD_SLOT_DEFAULTS_BY_BASE[base][a].order) - (design.slots?.[b]?.order ?? CARD_SLOT_DEFAULTS_BY_BASE[base][b].order));
    return <div key={zone} data-card-zone={zone} className="custom-card-zone" style={{ gap: styling.gap ?? 4, color: zone === 'below' ? styling.textColor || 'hsl(var(--foreground))' : undefined }}>
      {ids.map(id => <div key={id} data-card-slot={id} className={id === 'menu' ? 'pointer-events-auto relative z-40' : 'pointer-events-none'}>
        {id === 'title' ? <h3 data-mobile-poster-title style={{ fontSize: styling.titleSize ?? 16, fontWeight: styling.titleWeight ?? 700, display: '-webkit-box', WebkitLineClamp: styling.titleLines ?? 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.3 }}>{slots[id]}</h3> : id === 'type' || id === 'status' ? renderInfoBadge(id, slots[id]) : slots[id]}
      </div>)}
    </div>;
  };
  const style: CSSProperties = { color: styling.textColor || (base === 'overlay' ? 'white' : 'hsl(var(--foreground))'), maxWidth: readOnly ? styling.width : undefined, borderRadius: radius, fontSize: styling.metadataSize ?? 12, '--custom-card-padding': `${styling.padding ?? 12}px` } as CSSProperties;
  return <div data-custom-card={design.id} className="custom-card relative w-full min-w-0" style={style}>
    <AppearanceBackground background={styling.background} />
    <div className="relative overflow-hidden bg-muted" data-mobile-poster-image style={{ aspectRatio: styling.aspectRatio === 'square' ? '1' : styling.aspectRatio === 'landscape' ? '16/9' : '2/3', borderRadius: radius, border: `${styling.borderWidth ?? 1}px solid ${styling.borderColor || 'hsl(var(--border))'}`, boxShadow: styling.shadow === 'strong' ? '0 12px 30px #0005' : styling.shadow === 'soft' ? '0 4px 12px #0003' : undefined }}>
      <div className="absolute inset-0">{poster}</div>
      {base === 'overlay' && <div className="absolute inset-0 pointer-events-none" style={{ background: `linear-gradient(to top, rgb(0 0 0 / ${styling.gradient ?? .9}), transparent 75%)` }} />}
      {safety}
      {SLOT_ZONES.filter(zone => zone !== 'below').map(renderZone)}
      {!readOnly && href && (/^https?:\/\//i.test(href) ? <a href={href} target="_blank" rel="noopener noreferrer" aria-label={title} className="absolute inset-0 z-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" /> : <Link to={href} aria-label={title} className="absolute inset-0 z-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" />)}
    </div>
    {renderZone('below')}
    {footer && <div data-media-controls className="relative z-40 mt-2" {...(readOnly ? { inert: '', style: { pointerEvents: 'none' } } as any : {})}>{footer}</div>}
  </div>;
}
