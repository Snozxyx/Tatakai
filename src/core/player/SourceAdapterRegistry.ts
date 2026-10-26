import { PlaybackMode, PlaybackSource } from './player-core';
import { playbackEventBus, PlayerEvents } from './PlaybackEventBus';

export interface AdapterLoadOptions {
  source: PlaybackSource;
  videoElement: HTMLVideoElement;
  startTime?: number;
  autoPlay?: boolean;
  signal?: AbortSignal;
}

export abstract class AbstractSourceAdapter {
  protected videoElement: HTMLVideoElement | null = null;
  protected currentSource: PlaybackSource | null = null;

  abstract readonly mode: PlaybackMode;

  async load(options: AdapterLoadOptions): Promise<void> {
    this.videoElement = options.videoElement;
    this.currentSource = options.source;
    playbackEventBus.emit(PlayerEvents.SOURCE_SWITCH, options.source);
  }

  abstract unload(): Promise<void>;
  
  abstract play(): Promise<void>;
  abstract pause(): void;
  abstract seek(time: number): void;
  abstract setVolume(volume: number): void;

  // Optional: adapters may implement audio/subtitle track selection
  setAudioTrack(index: number): void {
    // noop by default
  }

  setSubtitleTrack(index: number): void {
    // noop by default
  }
}

export class SourceAdapterRegistry {
  private adapters: Map<PlaybackMode, AbstractSourceAdapter> = new Map();
  private loaders = new Map<PlaybackMode, () => Promise<AbstractSourceAdapter>>();
  private currentAdapter: AbstractSourceAdapter | null = null;
  private generation = 0;
  private controller: AbortController | null = null;
  private pending: Promise<void> = Promise.resolve();
  private static instance: SourceAdapterRegistry;

  private constructor() {}

  public static getInstance(): SourceAdapterRegistry {
    if (!SourceAdapterRegistry.instance) {
      SourceAdapterRegistry.instance = new SourceAdapterRegistry();
    }
    return SourceAdapterRegistry.instance;
  }

  register(mode: PlaybackMode, adapter: AbstractSourceAdapter) {
    this.adapters.set(mode, adapter);
  }

  registerLazy(mode: PlaybackMode, load: () => Promise<AbstractSourceAdapter>) {
    this.loaders.set(mode, load);
  }

  getAdapter(mode: PlaybackMode): AbstractSourceAdapter | undefined {
    return this.adapters.get(mode);
  }

  async switchTo(options: AdapterLoadOptions): Promise<void> {
    const generation = ++this.generation;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const abort = () => controller.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) controller.abort();
    const operation = this.pending.catch(() => {}).then(async () => {
      if (controller.signal.aborted || generation !== this.generation) return;
      let adapter = this.adapters.get(options.source.mode);
      const load = this.loaders.get(options.source.mode);
      if (!adapter && load) {
        adapter = await load();
        this.adapters.set(options.source.mode, adapter);
      }
      if (controller.signal.aborted || generation !== this.generation) return;
      if (!adapter) throw new Error(`No adapter registered for mode: ${options.source.mode}`);
      await this.currentAdapter?.unload();
      this.currentAdapter = null;
      if (controller.signal.aborted || generation !== this.generation) return;
      try {
        await adapter.load({ ...options, signal: controller.signal });
        if (controller.signal.aborted || generation !== this.generation) {
          await adapter.unload();
          return;
        }
        this.currentAdapter = adapter;
      } catch (error) {
        await adapter.unload();
        if (!controller.signal.aborted) throw error;
      }
    }).finally(() => options.signal?.removeEventListener('abort', abort));
    this.pending = operation;
    await operation;
  }

  async unload(): Promise<void> {
    ++this.generation;
    this.controller?.abort();
    const operation = this.pending.catch(() => {}).then(async () => {
      await this.currentAdapter?.unload();
      this.currentAdapter = null;
    });
    this.pending = operation;
    await operation;
  }

  getCurrentAdapter() {
    return this.currentAdapter;
  }
}

export const sourceAdapterRegistry = SourceAdapterRegistry.getInstance();
