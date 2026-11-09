import {
  MediaLibraryMenu,
  LibraryMenuButton,
  LIBRARY_BUTTON_CLASS,
  type LibraryMenuItem,
} from "@/components/media/MediaLibraryMenu";
import type { HTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  useMediaCardStyle,
  type MediaCardStyle,
} from "@/hooks/ui/useMediaCardStyle";
import { MoreHorizontal } from 'lucide-react';
import { useCardDesign } from '@/components/customization/CardDesignContext';
import { CustomCardLayout, type CardSlotContent } from '@/components/customization/CustomCardLayout';
import '@/components/customization/customization.css';

interface MediaCardFrameProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  libraryItem?: LibraryMenuItem;
  href?: string | null;
  poster: ReactNode;
  metadata?: ReactNode;
  footer?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
  variant?: MediaCardStyle;
  slotContent?: CardSlotContent;
  safetyBadges?: ReactNode;
}

/** Shared geometry and interaction treatment; media-specific behavior stays with callers. */
export function MediaCardFrame({
  libraryItem,
  title,
  href,
  poster,
  metadata,
  footer,
  badges,
  actions,
  variant,
  slotContent,
  safetyBadges,
  className,
  ...props
}: MediaCardFrameProps) {
  const { style } = useMediaCardStyle();
  const { design, readOnly } = useCardDesign();
  const linkClass = "media-card-link absolute inset-0 z-30 rounded-2xl";
  // Anchor every quick action to the same poster corner, independent of title height.
  const libraryButtonClass = LIBRARY_BUTTON_CLASS;
  if (design) return <MediaLibraryMenu item={readOnly ? undefined : libraryItem}>
    <div {...(readOnly ? {} : props)} data-mobile-poster-card className={cn('group relative min-w-0 w-full', className)}>
      <CustomCardLayout design={design} title={title} href={href} poster={poster} footer={footer} safety={safetyBadges ?? (!slotContent ? badges : undefined)} readOnly={readOnly}
        slots={{ title, ...(!slotContent && metadata ? { type: metadata } : {}), ...slotContent, ...(libraryItem ? { menu: readOnly ? <span className="media-library-glass grid size-11 place-items-center rounded-full"><MoreHorizontal className="size-5" /></span> : <LibraryMenuButton item={libraryItem} className="media-library-glass grid size-11 place-items-center rounded-full pointer-events-auto" /> } : {}) }} />
    </div>
  </MediaLibraryMenu>;
  return (
    <MediaLibraryMenu item={readOnly ? undefined : libraryItem}>
      <div
        {...(readOnly ? {} : props)}
        onContextMenu={(event) => {
          props.onContextMenu?.(event);
        }}
        onPointerDown={(event) => {
          props.onPointerDown?.(event);
        }}
        data-mobile-poster-card
        data-card-style={variant || style}
        className={cn("media-card group relative min-w-0 w-full", className)}
      >
        <div className="relative">
          <div
            data-mobile-poster-image
            className="media-card-poster relative aspect-[2/3] overflow-hidden rounded-2xl border border-border bg-muted"
          >
            {poster}
            {badges}
            <div className="media-card-shade pointer-events-none absolute inset-0" />
          </div>
          <div className="media-card-details pointer-events-none">
            <h3
              data-mobile-poster-title
              className="media-card-title font-display text-sm font-semibold leading-5"
            >
              {title}
            </h3>
            <div className="media-card-meta mt-1 text-xs leading-5 text-muted-foreground">
              {metadata}
            </div>
          </div>
          {!readOnly && href &&
            (/^https?:\/\//i.test(href) ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={linkClass}
                aria-label={title}
              />
            ) : (
              <Link to={href} className={linkClass} aria-label={title} />
            ))}
          {!readOnly && libraryItem && (
            <LibraryMenuButton
              item={libraryItem}
              className={libraryButtonClass}
            />
          )}
          {actions}
        </div>
        {footer && (
          <div
            data-media-controls
            className="relative z-40 mt-2 pointer-events-auto"
            {...(readOnly ? { inert: '', style: { pointerEvents: 'none' } } as any : {})}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            {footer}
          </div>
        )}
      </div>
    </MediaLibraryMenu>
  );
}
