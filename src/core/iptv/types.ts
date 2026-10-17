export type StreamHeaders = Record<string, string>;
export interface IPTVPlaylist {
  id: string;
  name: string;
  kind: "m3u" | "xtream";
  credentialRef: string;
  updatedAt: number;
  epgRef?: string;
}
export interface IPTVChannel {
  id: string;
  playlistId: string;
  name: string;
  tvgId?: string;
  logo?: string;
  group: string;
  streamRef: string;
  kind: "live" | "vod" | "series";
  seriesId?: number;
}
export interface IPTVProgram {
  id: string;
  playlistId: string;
  channelId: string;
  title: string;
  description?: string;
  start: number;
  stop: number;
  expiresAt: number;
}
export interface IPTVFavorite {
  id: string;
  channelId: string;
}
export interface XtreamCredentials {
  server: string;
  username: string;
  password: string;
}
export interface IPTVStream {
  url: string;
  headers: StreamHeaders;
}
