import { randomUUID } from '../../lib/uuid';
import { db } from "@/core/db/tatakai-db";
import { secretStorage } from "@/core/tv/secretStorage";
import { parseM3U } from "./m3uParser";
import { fetchIPTVText, xtreamRequest, streamIPTVText } from "./xtreamClient";
import type {
  IPTVChannel,
  IPTVPlaylist,
  IPTVProgram,
  IPTVStream,
  XtreamCredentials,
} from "./types";

export type PlaylistSource =
  | { kind: "m3u"; url: string; epgUrl?: string }
  | ({ kind: "xtream" } & XtreamCredentials);
export async function savePlaylist(
  name: string,
  source: PlaylistSource,
  existing?: IPTVPlaylist,
  signal?: AbortSignal
) {
  const id = existing?.id || randomUUID();
  const streams: Array<{
    name: string;
    tvgId?: string;
    logo?: string;
    group: string;
    url: string;
    headers: Record<string, string>;
    kind?: IPTVChannel["kind"];
    seriesId?: number;
  }> = [];
  if (source.kind === "m3u")
    streams.push(
      ...parseM3U(await fetchIPTVText(source.url, signal), source.url)
    );
  else {
    const auth = await xtreamRequest<{
      user_info?: { auth?: number | string };
    }>(source, undefined, undefined, signal);
    if (String(auth.user_info?.auth) !== "1")
      throw new Error("Xtream login failed. Check the server and credentials.");
    for (const [kind, action, categoryAction] of [
      ["live", "get_live_streams", "get_live_categories"],
      ["vod", "get_vod_streams", "get_vod_categories"],
      ["series", "get_series", "get_series_categories"],
    ] as const) {
      const [items, groups] = await Promise.all([
        xtreamRequest<any[]>(source, action, undefined, signal),
        xtreamRequest<any[]>(source, categoryAction, undefined, signal),
      ]);
      const categories = new Map(
        groups.map((g) => [String(g.category_id), String(g.category_name)])
      );
      for (const item of items) {
        const streamId = kind === "series" ? item.series_id : item.stream_id;
        streams.push({
          name: item.name || "Unnamed",
          logo: item.stream_icon || item.cover,
          tvgId: item.epg_channel_id,
          group: categories.get(String(item.category_id)) || "Other",
          headers: {},
          kind,
          seriesId: kind === "series" ? Number(streamId) : undefined,
          url:
            kind === "series"
              ? ""
              : `${source.server.replace(/\/$/, "")}/${
                  kind === "vod" ? "movie" : "live"
                }/${encodeURIComponent(source.username)}/${encodeURIComponent(
                  source.password
                )}/${streamId}.${
                  kind === "vod" ? item.container_extension || "mp4" : "ts"
                }`,
        });
      }
    }
  }
  if (!streams.length)
    throw new Error(
      "No channels found. Check that this is a channel playlist. Your cached playlist is unchanged."
    );
  if (streams.length > 50000)
    throw new Error(
      "Playlist exceeds 50,000 channels. Split it into smaller playlists."
    );
  const channels: IPTVChannel[] = [];
  // Stage a new encrypted generation; old data remains usable if an import fails.
  const generation = randomUUID(),
    staged: string[] = [];
  const credentialRef = `iptv:source:${id}:${generation}`;
  try {
    for (let i = 0; i < streams.length; i++) {
      if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      const stream = streams[i],
        streamRef = `iptv:${id}:${generation}:${i}`;
      await secretStorage.set(
        streamRef,
        JSON.stringify({ url: stream.url, headers: stream.headers })
      );
      staged.push(streamRef);
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          `${stream.kind || "live"}:${stream.seriesId || stream.url}`
        )
      );
      const stableId = Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 24);
      channels.push({
        id: `${id}:${stableId}`,
        playlistId: id,
        name: stream.name,
        tvgId: stream.tvgId,
        logo: stream.logo,
        group: stream.group,
        streamRef,
        kind: stream.kind || "live",
        seriesId: stream.seriesId,
      });
    }
    const old = await db.iptvChannels.where("playlistId").equals(id).toArray();
    await secretStorage.set(credentialRef, JSON.stringify(source));
    staged.push(credentialRef);
    const playlist: IPTVPlaylist = {
      id,
      name: name.trim() || "My playlist",
      kind: source.kind,
      credentialRef,
      updatedAt: Date.now(),
    };
    await db.transaction("rw", db.iptvPlaylists, db.iptvChannels, async () => {
      await db.iptvChannels.where("playlistId").equals(id).delete();
      await db.iptvChannels.bulkPut(channels);
      await db.iptvPlaylists.put(playlist);
    });
    staged.length = 0; // The database now owns these references.
    await Promise.all(
      old.map((c) => secretStorage.remove(c.streamRef).catch(() => undefined))
    );
    if (existing?.credentialRef)
      await secretStorage.remove(existing.credentialRef).catch(() => undefined);
    return playlist;
  } catch (error) {
    await Promise.all(staged.map((key) => secretStorage.remove(key)));
    throw error;
  }
}
export async function readStream(channel: IPTVChannel): Promise<IPTVStream> {
  const value = await secretStorage.get(channel.streamRef);
  if (!value)
    throw new Error("Channel credentials are missing. Refresh this playlist.");
  return JSON.parse(value);
}
export async function refreshPlaylist(
  playlist: IPTVPlaylist,
  signal?: AbortSignal
) {
  const value = await secretStorage.get(playlist.credentialRef);
  if (!value) throw new Error("Re-enter this playlist’s credentials.");
  return savePlaylist(playlist.name, JSON.parse(value), playlist, signal);
}
export async function importEPG(
  url: string,
  playlistId: string,
  signal?: AbortSignal
) {
  const worker = new Worker(new URL("./epg.worker.ts", import.meta.url), {
    type: "module",
  });
  const programs: IPTVProgram[] = [];
  let id = 0;
  const parse = (text: string) =>
    new Promise<void>((resolve, reject) => {
      const cancel = () => reject(new DOMException("Cancelled", "AbortError"));
      signal?.addEventListener("abort", cancel, { once: true });
      worker.onmessage = (event) => {
        signal?.removeEventListener("abort", cancel);
        if (event.data.error) reject(new Error(event.data.error));
        else {
          programs.push(...event.data.programs);
          resolve();
        }
      };
      worker.onerror = () => reject(new Error("Unable to parse the guide."));
      worker.postMessage({ id: id++, text, playlistId });
    });
  try {
    let buffer = "",
      tail = "";
    for await (const chunk of streamIPTVText(url, signal)) {
      if (/<!DOCTYPE|<!ENTITY/i.test(tail + chunk))
        throw new Error("Guide contains unsupported XML entities.");
      tail = chunk.slice(-32);
      buffer += chunk;
      const boundary = buffer.lastIndexOf("</programme>");
      if (boundary >= 0) {
        await parse(buffer.slice(0, boundary + 12));
        buffer = buffer.slice(boundary + 12);
      }
      if (buffer.length > 512 * 1024)
        throw new Error("A guide entry is too large or malformed.");
      if (programs.length > 200000)
        throw new Error("Guide exceeds 200,000 programs.");
    }
    if (/<programme\b/i.test(buffer))
      throw new Error("Guide ended before the last program was complete.");
    if (!programs.length)
      throw new Error(
        "No guide programs found. Your cached guide is unchanged."
      );
    await db.transaction("rw", db.iptvPrograms, async () => {
      await db.iptvPrograms.where("playlistId").equals(playlistId).delete();
      await db.iptvPrograms.bulkPut(
        programs.filter((p) => p.expiresAt > Date.now())
      );
    });
    await db.iptvPrograms.where("expiresAt").below(Date.now()).delete();
  } finally {
    worker.terminate();
  }
}
