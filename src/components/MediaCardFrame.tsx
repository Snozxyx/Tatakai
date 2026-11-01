import {
  MediaLibraryMenu,
  LibraryMenuButton,
  type LibraryMenuItem,
} from "@/components/media/MediaLibraryMenu";
import type { HTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  useMediaCardStyle,
  type MediaCardStyle,
} from "@/hooks/ui/useMediaCardStyle";

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
  className,
  ...props
}: MediaCardFrameProps) {
  const { style } = useMediaCardStyle();
  const linkClass = "media-card-link absolute inset-0 z-30 rounded-2xl";
  const hasStatusMenu = libraryItem && libraryItem.kind !== "character";
  // Anchor every quick action to the same poster corner, independent of title height.
  const libraryButtonClass =
    "absolute right-2 top-2 z-40 grid size-11 place-items-center rounded-full border border-border bg-card text-card-foreground shadow-sm pointer-events-auto";
  return (
    <MediaLibraryMenu item={libraryItem}>
      <div
        {...props}
        onContextMenu={(event) => {
          if (hasStatusMenu && event.button === 2) return;
          props.onContextMenu?.(event);
        }}
        onPointerDown={(event) => {
          props.onPointerDown?.(event);
          if (hasStatusMenu && event.pointerType !== "mouse")
            event.stopPropagation();
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
          {href &&
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
          {libraryItem && (
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
