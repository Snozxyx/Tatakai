import type { Anime4KMode } from '@/lib/video/anime4k/Anime4KRenderer';

export type UpscalerEngine = 'off' | 'anime4k' | 'realesrgan' | 'manga';
export type EnhancementQuality = 'light' | 'balanced' | 'high';
export type UpscalerStatus = {
  installing: boolean; stage: string; error: string; realesrgan: boolean; manga: boolean;
  setupEngine?: 'realesrgan' | 'manga'; downloadBytes?: number; downloadTotal?: number;
  cacheBytes?: number; modelBytes?: number; queued?: number; loadedEngine?: string;
};
export type UpscaleOptions = { quality?: EnhancementQuality; priority?: number; onProgress?: (progress: number) => void; preview?: boolean };
export interface UpscalerBridge {
  status(): Promise<UpscalerStatus>;
  install(engine: 'realesrgan' | 'manga'): Promise<{ started: boolean }>;
  enhance(payload: { id?: string; engine: 'realesrgan' | 'manga'; scale: 2 | 4; quality?: EnhancementQuality; priority?: number; bytes: Uint8Array }): Promise<Uint8Array>;
  cancel?(id: string): Promise<{ cancelled: boolean }>;
  cancelSetup?(): Promise<{ cancelled: boolean }>;
  clearCache?(): Promise<{ cleared: boolean }>;
  onProgress?(callback: (event: { id: string; progress: number }) => void): () => void;
}
export const UPSCALERS = [
  { value: 'off', label: 'Off', description: 'Show the original pages.' },
  { value: 'anime4k', label: 'Anime4K', description: 'Fast GPU enhancement for line art. Runs on this device.' },
  { value: 'realesrgan', label: 'Real-ESRGAN', description: 'AI restoration for anime illustrations and color pages. Desktop app required.' },
  { value: 'manga', label: 'Manga Upscaler', description: 'MangaJaNai model for black-and-white pages and fine ink lines. Desktop app required.' },
] as const;

/** One page at a time avoids retaining multiple GPU pass chains in long chapters. */
let gpuQueue: Promise<unknown> = Promise.resolve();
export function upscaleImage(blob: Blob, engine: Exclude<UpscalerEngine, 'off'>, preset: Anime4KMode, scale: 2 | 4, signal?: AbortSignal, options: UpscaleOptions = {}): Promise<Blob> {
  const execute = async () => {
    signal?.throwIfAborted();
    if (engine !== 'anime4k') {
      const bridge = window.electron?.upscaler;
      if (!bridge) throw new Error('AI upscaling is available in the Tatakai desktop app. Choose Anime4K on this device.');
      const id = crypto.randomUUID();
      const data = new Uint8Array(await blob.arrayBuffer());
      signal?.throwIfAborted();
      const unsubscribe = bridge.onProgress?.(event => { if (event.id === id && !signal?.aborted) options.onProgress?.(event.progress); });
      const cancel = () => { void bridge.cancel?.(id).catch(() => {}); };
      signal?.addEventListener('abort', cancel, { once: true });
      try {
        const bytes = await bridge.enhance({ id, engine, scale, bytes: data, quality: options.quality || 'balanced', priority: options.preview ? 100 : options.priority || 50 });
        signal?.throwIfAborted();
        return new Blob([new Uint8Array(bytes)], { type: 'image/png' });
      } finally { unsubscribe?.(); signal?.removeEventListener('abort', cancel); }
    }
    const { Anime4KRenderer } = await import('@/lib/video/anime4k/Anime4KRenderer');
    if (!Anime4KRenderer.isSupported()) throw new Error('Anime4K needs WebGL 2 and floating-point GPU support on this device.');
    const url = URL.createObjectURL(blob);
    const image = new Image();
    let renderer: InstanceType<typeof Anime4KRenderer> | undefined;
    try {
      image.src = url;
      await image.decode();
      signal?.throwIfAborted();
      if (image.naturalWidth * image.naturalHeight > 4_000_000) throw new Error('This page is too large for Anime4K. The original page is still available.');
      const canvas = document.createElement('canvas');
      renderer = new Anime4KRenderer(image, canvas);
      renderer.setMode(preset === 'off' ? 'standard' : preset);
      renderer.renderStill();
      return await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('Could not save the enhanced preview.')), 'image/png'));
    } finally { renderer?.destroy(); URL.revokeObjectURL(url); }
  };
  // Native work is prioritized and cancelled by the desktop queue; serialize only GL.
  const task = engine === 'anime4k' ? gpuQueue.then(execute) : execute();
  if (engine === 'anime4k') gpuQueue = task.catch(() => {});
  return task;
}

/** Capture a small, real sample; previews never process an entire chapter. */
export async function captureUpscaleSample(file?: File): Promise<Blob> {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image preview is unavailable.');
  let source: CanvasImageSource;
  let width: number, height: number;
  let owned: string | undefined;
  const video = document.querySelector<HTMLVideoElement>('video');
  const page = Array.from(document.querySelectorAll<HTMLImageElement>('img[data-image-original]')).find(image => {
    const rect = image.getBoundingClientRect();
    return image.complete && image.naturalWidth > 0 && rect.bottom > 0 && rect.top < innerHeight;
  });
  try {
    if (!file && video && video.readyState >= 2) {
      source = video; width = video.videoWidth; height = video.videoHeight;
    } else {
      const image = new Image();
      if (file) {
        if (file.size > 20 * 1024 * 1024) throw new Error('Choose an image smaller than 20 MB.');
        owned = URL.createObjectURL(file); image.src = owned;
      } else {
        image.crossOrigin = 'anonymous';
        image.src = page?.dataset.originalSrc || page?.src || '/assets/tv/wallpapers/6.png';
      }
      await image.decode();
      source = image; width = image.naturalWidth; height = image.naturalHeight;
    }
    const ratio = Math.min(1, 480 / Math.max(width, height));
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('Could not capture this image. Choose an image to preview instead.')), 'image/png'));
  } catch (err) {
    if (err instanceof DOMException && err.name === 'SecurityError') throw new Error('This source blocks frame capture. Choose an image to preview instead.');
    throw err;
  } finally { if (owned) URL.revokeObjectURL(owned); }
}
