import type { VideoEnhancementQuality } from './enhancement-settings';

export type RtxCapability = { available: boolean; reason: string; adapter?: string; maxOutputHeight: number; restartRequired?: boolean; dedicatedGpuRequested?: boolean };
export type RtxConfiguration = { quality: VideoEnhancementQuality; maxOutputHeight: number; purpose?: 'playback' | 'preview' };
export type RtxFrame = { session: string; generation: number; timestamp: number; width: number; height: number; bytes: Uint8Array };
export type RtxFrameResult = { generation: number; timestamp: number; width: number; height: number; processingMs: number; gpuMemoryBytes?: number };
export interface RtxVideoBridge {
  capability(): Promise<RtxCapability>;
  start(config: RtxConfiguration): Promise<{ session: string }>;
  configure(session: string, config: RtxConfiguration): Promise<void>;
  frame(frame: RtxFrame): Promise<RtxFrameResult>;
  captureFrame?(frame: { session: string; generation: number; timestamp: number }): Promise<RtxFrameResult>;
  stop(session: string): Promise<void>;
  restartWithGpuPreference(enabled: boolean): Promise<{ restarting: boolean }>;
  setTarget(target: { id: string | null; session: string; generation: number } | null): void;
  onStatus(callback: (event: { session?: string; state: string; message: string }) => void): () => void;
}

/** Pure performance policy, also used in hardware-independent regression tests. */
export class RtxFrameBudget {
  quality: VideoEnhancementQuality;
  private slow = 0;
  constructor(quality: VideoEnhancementQuality) { this.quality = quality; }
  record(elapsedMs: number, frameIntervalMs: number): 'keep' | 'lower' | 'disable' {
    this.slow = elapsedMs > frameIntervalMs ? this.slow + 1 : Math.max(0, this.slow - 1);
    if (this.slow < 30) return 'keep';
    this.slow = 0;
    if (this.quality === 'light') return 'disable';
    this.quality = this.quality === 'high' ? 'balanced' : 'light';
    return 'lower';
  }
}

/** A still preview uses the same native VSR engine as playback. */
export async function enhanceRtxSample(blob: Blob, quality: VideoEnhancementQuality, signal?: AbortSignal): Promise<Blob> {
  const bridge = window.electron?.rtxVideo;
  if (!bridge) throw new Error('RTX Video requires the Windows desktop app.');
  signal?.throwIfAborted();
  const bitmap = await createImageBitmap(blob);
  const input = document.createElement('canvas'); input.width = bitmap.width; input.height = bitmap.height;
  const context = input.getContext('2d', { willReadFrequently: true });
  if (!context) { bitmap.close(); throw new Error('Could not prepare the preview.'); }
  context.drawImage(bitmap, 0, 0); bitmap.close();
  const bytes = new Uint8Array(context.getImageData(0, 0, input.width, input.height).data);
  for (let offset = 0; offset < bytes.length; offset += 4) { const red = bytes[offset]; bytes[offset] = bytes[offset + 2]; bytes[offset + 2] = red; }
  const output = document.createElement('canvas'); output.id = `rtx-preview-${crypto.randomUUID()}`; output.hidden = true; document.body.append(output);
  let session: string | undefined;
  const abort = () => { if (session) { bridge.setTarget({ id: null, session, generation: 0 }); void bridge.stop(session).catch(() => {}); } };
  try {
    session = (await bridge.start({ quality, maxOutputHeight: 1080, purpose: 'preview' })).session;
    signal?.throwIfAborted(); signal?.addEventListener('abort', abort, { once: true });
    bridge.setTarget({ id: output.id, session, generation: 0 });
    await bridge.frame({ session, generation: 0, timestamp: 0, width: input.width, height: input.height, bytes });
    signal?.throwIfAborted();
    return await new Promise<Blob>((resolve, reject) => output.toBlob(result => result ? resolve(result) : reject(new Error('Could not save the RTX preview.')), 'image/png'));
  } finally {
    signal?.removeEventListener('abort', abort);
    if (session) { bridge.setTarget({ id: null, session, generation: 0 }); await bridge.stop(session).catch(() => {}); }
    output.width = output.height = 1; output.remove();
  }
}
