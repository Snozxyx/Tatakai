import type { ImgHTMLAttributes, SyntheticEvent } from 'react';
import { optimizedBackground, optimizedImageUrl } from '../media/imageUrl';

/** Used by both JSX factories; host elements remain host elements (refs still work). */
export function mediaProps(type: unknown, props: Record<string, any> | null) {
  if (typeof type !== 'string' || !props || props['data-image-original']) return props;
  let result = props;
  if (props.style) {
    for (const key of ['backgroundImage', 'background'] as const) {
      const value = props.style[key];
      if (typeof value !== 'string' || !value.includes('url(')) continue;
      const optimized = optimizedBackground(value);
      if (optimized !== value) result = { ...result, style: { ...result.style, [key]: optimized } };
    }
  }
  if (type === 'video' && props.poster) {
    result = { ...result, poster: optimizedImageUrl(props.poster) };
  }
  // Leave authored srcsets alone: their candidate URLs and sizes are already deliberate.
  if (type === 'img' && typeof props.src === 'string' && !props.srcSet) {
    const width = Number(props.width);
    const src = optimizedImageUrl(props.src, width > 0 ? width * 2 : undefined);
    let original = props.src;
    if (/^https?:\/\/wsrv\.nl(?:[/:?#]|$)/i.test(props.src)) try {
      const cached = new URL(props.src);
      if (cached.hostname === 'wsrv.nl') original = cached.searchParams.get('url') || original;
    } catch { /* Relative/offline asset. */ }
    if (src !== original) {
      result = { ...result, src, decoding: props.decoding ?? 'async',
        onError(event: SyntheticEvent<HTMLImageElement>) {
          const image = event.currentTarget;
          // One direct retry before the caller's placeholder/candidate failover.
          if (image.getAttribute('src') === src) {
            image.src = original;
            return;
          }
          (props.onError as ImgHTMLAttributes<HTMLImageElement>['onError'])?.(event);
        },
      };
    }
  }
  return result;
}
