export type PlaybackMode = 'hls' | 'direct' | 'torrent' | 'offline' | 'debrid';

export interface PlaybackSource {
  id: string;
  url: string;
  mode: PlaybackMode;
  quality?: string;
}

export interface PlayerCoreState {
  mode: PlaybackMode;
  currentSource: PlaybackSource | null;
  playing: boolean;
  muted: boolean;
  volume: number;
  positionSec: number;
  durationSec: number;
}

export type PlayerCoreEvent =
  | { type: 'set-source'; source: PlaybackSource }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'seek'; positionSec: number }
  | { type: 'set-duration'; durationSec: number }
  | { type: 'set-volume'; volume: number }
  | { type: 'set-muted'; muted: boolean };

export const initialPlayerCoreState: PlayerCoreState = {
  mode: 'hls',
  currentSource: null,
  playing: false,
  muted: false,
  volume: 1,
  positionSec: 0,
  durationSec: 0,
};

export function reducePlayerCore(state: PlayerCoreState, event: PlayerCoreEvent): PlayerCoreState {
  switch (event.type) {
    case 'set-source':
      return { ...state, currentSource: event.source, mode: event.source.mode, positionSec: 0, durationSec: 0 };
    case 'play':
      return { ...state, playing: true };
    case 'pause':
      return { ...state, playing: false };
    case 'seek':
      return { ...state, positionSec: Math.max(0, event.positionSec) };
    case 'set-duration':
      return { ...state, durationSec: Math.max(0, event.durationSec) };
    case 'set-volume':
      return { ...state, volume: Math.min(1, Math.max(0, event.volume)) };
    case 'set-muted':
      return { ...state, muted: event.muted };
    default:
      return state;
  }
}

