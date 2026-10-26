import type { ImgHTMLAttributes } from 'react';

export function CachedProfileImage(props: ImgHTMLAttributes<HTMLImageElement>) {
  // The shared JSX runtime handles caching and the direct retry for all <img>s.
  return <img {...props} />;
}
