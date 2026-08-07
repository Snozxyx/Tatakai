type EventCallback<T = any> = (data: T) => void;

export enum PlayerEvents {
  TIME_UPDATE = 'timeupdate',
  DURATION_CHANGE = 'durationchange',
  PLAY = 'play',
  PAUSE = 'pause',
  BUFFERING = 'buffering',
  LOADED = 'loaded',
  ERROR = 'error',
  ENDED = 'ended',
  VOLUME_CHANGE = 'volumechange',
  QUALITY_CHANGE = 'qualitychange',
  SOURCE_SWITCH = 'sourceswitch',
  AUDIO_TRACKS = 'audio_tracks',
  SUBTITLE_TRACKS = 'subtitle_tracks',
}

export class PlaybackEventBus {
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private static instance: PlaybackEventBus;

  private constructor() {}

  public static getInstance(): PlaybackEventBus {
    if (!PlaybackEventBus.instance) {
      PlaybackEventBus.instance = new PlaybackEventBus();
    }
    return PlaybackEventBus.instance;
  }

  public on<T = any>(event: string | PlayerEvents, callback: EventCallback<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    return () => this.off(event, callback);
  }

  public off(event: string | PlayerEvents, callback: EventCallback): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(callback);
    }
  }

  public emit<T = any>(event: string | PlayerEvents, data?: T): void {
    const set = this.listeners.get(event);
    if (set) {
      set.forEach(callback => {
        try {
          callback(data);
        } catch (err) {
          console.error(`[PlaybackEventBus] Error in listener for ${event}:`, err);
        }
      });
    }
  }

  public clear(): void {
    this.listeners.clear();
  }
}

export const playbackEventBus = PlaybackEventBus.getInstance();
