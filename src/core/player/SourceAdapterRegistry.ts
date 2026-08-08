import { PlaybackMode, PlaybackSource } from './player-core';
import { playbackEventBus, PlayerEvents } from './PlaybackEventBus';

export interface AdapterLoadOptions {
  source: PlaybackSource;
  videoElement: HTMLVideoElement;
  startTime?: number;
  autoPlay?: boolean;
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
  private currentAdapter: AbstractSourceAdapter | null = null;
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

  getAdapter(mode: PlaybackMode): AbstractSourceAdapter | undefined {
    return this.adapters.get(mode);
  }

  async switchTo(options: AdapterLoadOptions): Promise<void> {
    if (this.currentAdapter) {
      await this.currentAdapter.unload();
    }

    const adapter = this.adapters.get(options.source.mode);
    if (!adapter) {
      throw new Error(`No adapter registered for mode: ${options.source.mode}`);
    }

    this.currentAdapter = adapter;
    await adapter.load(options);
  }

  getCurrentAdapter() {
    return this.currentAdapter;
  }
}

export const sourceAdapterRegistry = SourceAdapterRegistry.getInstance();
