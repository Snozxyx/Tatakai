import { useState, useCallback, type ImgHTMLAttributes } from 'react';
import { Blurhash } from 'react-blurhash';
import { isBlurhashValid } from 'blurhash';
import { cn } from '@/lib/utils';

interface BlurhashImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'placeholder'> {
  /** The BlurHash string to display while the image loads. */
  blurhash?: string | null;
  /** Width of the BlurHash canvas (default: 32). */
  hashWidth?: number;
  /** Height of the BlurHash canvas (default: 32). */
  hashHeight?: number;
  /** Optional extra classes applied directly to the real `<img />`. */
  imgClassName?: string;
}

/**
 * Image component with BlurHash placeholder support.
 *
 * When a valid `blurhash` prop is provided the component renders the
 * blurred placeholder first, then fades in the real image once loaded.
 * Falls back to a plain <img> if no hash is given.
 *
 * ```tsx
 * <BlurhashImage
 *   src="/poster.webp"
 *   blurhash="LEHV6nWB2yk8pyo0adR*.7kCMdnj"
 *   alt="My Hero Academia"
 *   className="rounded-lg"
 * />
 * ```
 */
export function BlurhashImage({
  blurhash,
  hashWidth = 32,
  hashHeight = 32,
  imgClassName,
  className,
  style,
  onLoad,
  ...imgProps
}: BlurhashImageProps) {
  const [loaded, setLoaded] = useState(false);
  const hasValidHash = !!blurhash && isBlurhashValid(blurhash).result;

  const handleLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      setLoaded(true);
      onLoad?.(e);
    },
    [onLoad],
  );

  return (
    <div className={cn('relative overflow-hidden', className)} style={style}>
      {/* BlurHash placeholder */}
      {hasValidHash && !loaded && (
        <Blurhash
          hash={blurhash}
          width="100%"
          height="100%"
          resolutionX={hashWidth}
          resolutionY={hashHeight}
          punch={1}
          className="absolute inset-0"
          style={{ display: 'block' }}
        />
      )}

      {/* Real image */}
      <img
        {...imgProps}
        onLoad={handleLoad}
        className={cn(
          'h-full w-full object-cover transition-opacity duration-300',
          imgClassName,
          hasValidHash ? (!loaded ? 'opacity-0' : 'opacity-100') : undefined,
        )}
      />
    </div>
  );
}
