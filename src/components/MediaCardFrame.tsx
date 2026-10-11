import type { HTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useMediaCardStyle, type MediaCardStyle } from '@/hooks/ui/useMediaCardStyle';

interface MediaCardFrameProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  href?: string | null;
  poster: ReactNode;
  metadata?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
  variant?: MediaCardStyle;
}

/** Shared geometry and interaction treatment; media-specific behavior stays with callers. */
export function MediaCardFrame({ title, href, poster, metadata, badges, actions, variant, className, ...props }: MediaCardFrameProps) {
  const { style } = useMediaCardStyle();
  const linkClass = 'media-card-link absolute inset-0 z-30 rounded-2xl';
  return <div {...props} data-mobile-poster-card data-card-style={variant || style}
    className={cn('media-card group relative min-w-0 w-full', className)}>
    <div data-mobile-poster-image className="media-card-poster relative aspect-[2/3] overflow-hidden rounded-2xl border border-border bg-muted">
      {poster}
      {badges}
      <div className="media-card-shade pointer-events-none absolute inset-0" />
    </div>
    <div className="media-card-details pointer-events-none">
      <h3 data-mobile-poster-title className="media-card-title font-display text-sm font-semibold leading-5">{title}</h3>
      <div className="media-card-meta mt-1 text-xs leading-5 text-muted-foreground">{metadata}</div>
    </div>
    {href && (/^https?:\/\//i.test(href)
      ? <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass} aria-label={title} />
      : <Link to={href} className={linkClass} aria-label={title} />)}
    {actions}
  </div>;
}
