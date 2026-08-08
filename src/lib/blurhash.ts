/**
 * src/lib/blurhash.ts
 * BlurHash encoding/decoding utilities for Tatakai.
 *
 * BlurHash is a compact representation of a placeholder for an image.
 * We use it to show a blurred preview while the real image loads,
 * eliminating layout shift and improving perceived performance.
 *
 * Encoding is done server-side (or in a build script).
 * Decoding is done client-side to render the placeholder.
 */

import { decode, isBlurhashValid } from 'blurhash';

/** Default placeholder dimensions (small — it's a blur, no need for detail) */
const DEFAULT_WIDTH = 32;
const DEFAULT_HEIGHT = 32;

/**
 * Decode a BlurHash string into pixel data that can be rendered to a canvas.
 * Returns an ImageData-compatible object, or null if the hash is invalid.
 */
export function decodeBlurhash(
  hash: string,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  punch = 1,
): Uint8ClampedArray | null {
  if (!hash || !isBlurhashValid(hash).result) return null;
  try {
    return decode(hash, width, height, punch);
  } catch {
    return null;
  }
}

/**
 * Convert a BlurHash to a data: URI that can be used as an <img> src
 * or CSS background-image. Useful when you don't want to mount a canvas.
 */
export function blurhashToDataURL(
  hash: string,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
): string | null {
  const pixels = decodeBlurhash(hash, width, height);
  if (!pixels) return null;

  // Build a tiny canvas, draw the pixels, export as data URL
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const imageData = ctx.createImageData(width, height);
  imageData.data.set(pixels);
  ctx.putImageData(imageData, 0, 0);

  return canvas.toDataURL();
}

export { isBlurhashValid } from 'blurhash';
