import { useMemo } from 'react';
import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CommentAttachment } from '@/lib/commentMedia';
import { useGifBookmarks, useToggleGifBookmark } from '@/hooks/community/useGifBookmarks';
import { useLightbox } from '@/components/media/ImageLightbox';
import type { GiphyGif } from '@/lib/giphy';

/** Map a stored comment attachment onto the GiphyGif shape the bookmark hook expects. */
function toGiphy(a: CommentAttachment): GiphyGif {
  return {
    id: a.url,
    url: a.url,
    preview: a.preview ?? a.url,
    title: a.title ?? '',
    width: a.width,
    height: a.height,
  };
}

/**
 * A single attachment's aspect ratio, clamped so extreme panoramas / very tall
 * images don't blow out the comment. Falls back to a 4:3 box when the source
 * didn't record dimensions (older uploads, or an upload where decode failed).
 */
function aspectRatioFor(a: CommentAttachment): number {
  if (a.width && a.height && a.width > 0 && a.height > 0) {
    const r = a.width / a.height;
    // clamp to [0.5 (tall 1:2), 2.5 (wide 5:2)]
    return Math.min(2.5, Math.max(0.5, r));
  }
  return 4 / 3;
}

/**
 * Renders the image/GIF cards attached to a comment. URLs are already
 * constrained to http(s) by `sanitizeAttachments`, so they are safe to use as
 * `src` directly. A broken/removed asset hides itself rather than leaving a
 * broken-image icon. Clicking a card opens it in the app-level lightbox; the
 * overlay heart button favorites (bookmarks) the image/GIF — a filled heart
 * marks a saved item.
 */
export function CommentAttachments({
  attachments,
  className,
}: {
  attachments: CommentAttachment[] | undefined;
  className?: string;
}) {
  const { data: saved = [] } = useGifBookmarks();
  const toggle = useToggleGifBookmark();
  const savedUrls = useMemo(() => new Set(saved.map((s) => s.gif_url)), [saved]);
  const { open } = useLightbox();

  if (!attachments || attachments.length === 0) return null;

  const single = attachments.length === 1;
  const lightboxImages = attachments.map((a) => ({ url: a.url, alt: a.title ?? undefined }));

  return (
    <div
      className={cn(
        'mt-2 grid gap-2',
        single ? 'grid-cols-1' : 'grid-cols-2',
        className,
      )}
    >
      {attachments.map((a, i) => {
        const isSaved = savedUrls.has(a.url);
        return (
          <div
            key={`${a.url}-${i}`}
            role="button"
            tabIndex={0}
            onClick={() => open(lightboxImages, i)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(lightboxImages, i); }
            }}
            className={cn(
              'group relative block cursor-zoom-in overflow-hidden rounded-lg border border-border/30 bg-muted/30 text-left',
              // A single image can grow to its natural size (capped); a grid of
              // several stays compact and uniform.
              single ? 'max-w-sm' : 'w-full',
            )}
            style={{ aspectRatio: String(aspectRatioFor(a)) }}
          >
            <img
              src={a.url}
              alt={a.title || (a.type === 'gif' ? 'GIF' : 'image')}
              loading="lazy"
              // object-contain preserves the whole image (no crop); the wrapper's
              // aspect-ratio (from stored width/height) gives it the right shape.
              className="h-full w-full object-contain transition-transform group-hover:scale-[1.02]"
              onError={(e) => {
                (e.currentTarget.parentElement as HTMLElement).style.display = 'none';
              }}
            />
            {/* Favorite toggle: always shown once saved, on hover otherwise. Stops
                propagation so it doesn't also open the lightbox. */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toggle.mutate({ gif: toGiphy(a), bookmarked: isSaved }); }}
              disabled={toggle.isPending}
              title={isSaved ? 'Remove from favorites' : 'Save to favorites'}
              aria-pressed={isSaved}
              className={cn(
                'absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm transition-opacity hover:bg-black/80',
                isSaved ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
              )}
            >
              <Heart className={cn('h-3.5 w-3.5', isSaved ? 'fill-rose-500 text-rose-500' : 'text-white')} />
            </button>
            {a.type === 'gif' && (
              <span className="absolute bottom-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">
                GIF
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
