import { ThemedSelect } from '@/components/ui/themed-select';
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useSearchParams } from "react-router-dom";
import { nativeMediaMime } from "@/core/player/mobile/mediaMime";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { db } from "@/core/db/tatakai-db";
import {
  readStream,
  refreshPlaylist,
  savePlaylist,
  importEPG,
} from "@/core/iptv/iptvStorage";
import { xtreamRequest } from "@/core/iptv/xtreamClient";
import { secretStorage } from "@/core/tv/secretStorage";
import {
  openNativePlayer,
  onNativePlayerEvent,
} from "@/core/player/mobile/nativePlayerBridge";
import {
  registerNativeSource,
  ensureNativeProxy,
} from "@/core/mobile/localProxyNative";
import type { IPTVChannel, IPTVPlaylist, IPTVProgram } from "@/core/iptv/types";

export default function TVIPTVPage() {
  const client = useQueryClient(),
    [params, setParams] = useSearchParams();
  const [group, setGroup] = useState("All"),
    [kind, setKind] = useState("live"),
    [favorites, setFavorites] = useState(false);
  const [adding, setAdding] = useState(false),
    [name, setName] = useState(""),
    [url, setUrl] = useState(""),
    [epgURL, setEPGURL] = useState(""),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [sourceKind, setSourceKind] = useState("m3u");
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [programs, setPrograms] = useState<IPTVProgram[]>([]),
    [clock, setClock] = useState(Date.now());
  const [series, setSeries] = useState<
    Array<{ id: string; title: string; url: string }>
  >([]);
  const abort = useRef<AbortController>(),
    scroll = useRef<HTMLDivElement>(null),
    lastRefresh = useRef(new Set<string>()),
    registrations = useRef<string[]>([]);
  const playlists = useQuery({
    queryKey: ["iptv-playlists"],
    queryFn: () => db.iptvPlaylists.toArray(),
  });
  const channels = useQuery({
    queryKey: ["iptv-channels"],
    queryFn: () => db.iptvChannels.toArray(),
  });
  const saved = useQuery({
    queryKey: ["iptv-favorites"],
    queryFn: () => db.iptvFavorites.toArray(),
  });
  const all = channels.data || [];
  const filtered = all.filter(
    (c) =>
      c.kind === kind &&
      (group === "All" || c.group === group) &&
      (!favorites || saved.data?.some((f) => f.channelId === c.id))
  );
  const virtual = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scroll.current,
    estimateSize: () => 100,
    overscan: 5,
  });
  const invalidate = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ["iptv-playlists"] }),
      client.invalidateQueries({ queryKey: ["iptv-channels"] }),
      client.invalidateQueries({ queryKey: ["tv-home-live"] }),
    ]);
  async function run(action: (signal: AbortSignal) => Promise<void>) {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setMessage("Working…");
    try {
      await action(controller.signal);
      setMessage("Updated.");
      await invalidate();
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Unable to update. Your cached data is still available."
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 60000);
    return () => {
      clearInterval(timer);
      abort.current?.abort();
    };
  }, []);
  useEffect(() => {
    void db.iptvPrograms
      .where("stop")
      .above(clock)
      .limit(10000)
      .toArray()
      .then(setPrograms);
  }, [clock, busy]);
  useEffect(() => {
    const stale = playlists.data?.find(
      (p) =>
        Date.now() - p.updatedAt > 86400000 && !lastRefresh.current.has(p.id)
    );
    if (stale && !busy) {
      lastRefresh.current.add(stale.id);
      void run(async (signal) => {
        await refreshPlaylist(stale, signal);
      });
    }
  }, [playlists.data, busy]); // eslint-disable-line react-hooks/exhaustive-deps
  async function resolve(channel: IPTVChannel) {
    const source = await readStream(channel);
    const mimeType = nativeMediaMime(source.url);
    if (source.url.startsWith("rtsp:")) return { url: source.url, mimeType };
    await ensureNativeProxy();
    const registered = await registerNativeSource(source.url, source.headers);
    if (!registered) {
      if (Object.keys(source.headers).length)
        throw new Error("The local proxy is unavailable. Retry this channel.");
      return { url: source.url, mimeType };
    }
    registrations.current.push(registered);
    return { url: registered, mimeType };
  }
  async function play(channel: IPTVChannel) {
    setMessage(`Opening ${channel.name}…`);
    try {
      if (channel.kind === "series") {
        const playlist = playlists.data?.find(
          (p) => p.id === channel.playlistId
        );
        if (!playlist) throw new Error("Playlist missing");
        const credentials = JSON.parse(
          (await secretStorage.get(playlist.credentialRef)) || "{}"
        );
        const data = await xtreamRequest<{ episodes: Record<string, any[]> }>(
          credentials,
          "get_series_info",
          { series_id: String(channel.seriesId) }
        );
        setSeries(
          Object.values(data.episodes || {})
            .flat()
            .map((e) => ({
              id: String(e.id),
              title: e.title || `Episode ${e.episode_num}`,
              url: `${credentials.server.replace(
                /\/$/,
                ""
              )}/series/${encodeURIComponent(
                credentials.username
              )}/${encodeURIComponent(credentials.password)}/${e.id}.${
                e.container_extension || "mp4"
              }`,
            }))
        );
        return;
      }
      const index = filtered.findIndex((c) => c.id === channel.id);
      const adjacent =
        channel.kind === "live"
          ? filtered.slice(Math.max(0, index - 3), index + 4)
          : [channel];
      const queue = [];
      for (const item of adjacent) {
        try {
          queue.push({
            id: item.id,
            title: item.name,
            ...await resolve(item),
          });
        } catch (e) {
          if (item.id === channel.id) throw e;
        }
      }
      const selected = queue.find((item) => item.id === channel.id)!;
      const result = await openNativePlayer({
        url: selected.url,
        mimeType: selected.mimeType,
        title: channel.name,
        mediaId: channel.id,
        live: channel.kind === "live",
        queue,
      });
      if (!result.success)
        throw new Error(
          result.error || "Native playback is unavailable in browser preview."
        );
      setMessage("");
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Unable to play this channel"
      );
    }
  }
  useEffect(
    () =>
      onNativePlayerEvent((event) => {
        if (event.type === "playerItemChanged")
          setMessage(
            `Playing ${
              all.find((c) => c.id === event.mediaId)?.name || "channel"
            }`
          );
        if (event.type === "playerError")
          setMessage(
            event.message || "Playback failed. Choose another channel."
          );
        if (event.type === "playerClosed") {
          const urls = registrations.current.splice(0);
          void import("@/core/mobile/localProxyNative").then((module) =>
            Promise.all(urls.map((url) => module.unregisterNativeSource(url)))
          );
        }
      }),
    [channels.data]
  ); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const target = params.get("channel");
    const channel = all.find((c) => c.id === target);
    if (channel) {
      setParams({}, { replace: true });
      void play(channel);
    }
  }, [channels.data]); // eslint-disable-line react-hooks/exhaustive-deps
  async function toggle(channel: IPTVChannel) {
    const exists = saved.data?.find((f) => f.channelId === channel.id);
    if (exists) await db.iptvFavorites.delete(exists.id);
    else await db.iptvFavorites.put({ id: channel.id, channelId: channel.id });
    await client.invalidateQueries({ queryKey: ["iptv-favorites"] });
  }
  return (
    <>
      <h1>Live TV &amp; IPTV</h1>
      <div className="tv-iptv-controls">
        <button onClick={() => setAdding(true)}>Add playlist</button>
        {(["live", "vod", "series"] as const).map((value) => (
          <button
            key={value}
            aria-pressed={kind === value}
            onClick={() => {
              setKind(value);
              setGroup("All");
            }}
          >
            {value === "live" ? "Live" : value === "vod" ? "Movies" : "Series"}
          </button>
        ))}
        <button
          aria-pressed={favorites}
          onClick={() => setFavorites((value) => !value)}
        >
          Favorites
        </button>
        {playlists.data?.map((p) => (
          <button
            key={p.id}
            disabled={busy}
            onClick={() =>
              void run(async (signal) => {
                await refreshPlaylist(p, signal);
              })
            }
          >
            Refresh {p.name}
          </button>
        ))}
      </div>
      <p role="status">{message}</p>
      {busy && (
        <button onClick={() => abort.current?.abort()}>Cancel import</button>
      )}
      {!all.length && (
        <p>
          Add your M3U playlist or Xtream account to watch channels and browse
          the guide.
        </p>
      )}
      <div className="tv-iptv-grid">
        <aside>
          <button onClick={() => setGroup("All")}>All categories</button>
          {[
            ...new Set(all.filter((c) => c.kind === kind).map((c) => c.group)),
          ].map((category) => (
            <button
              key={category}
              aria-pressed={group === category}
              onClick={() => {
                setGroup(category);
                virtual.scrollToIndex(0);
              }}
            >
              {category}
            </button>
          ))}
        </aside>
        <div>
          <p>
            {new Date(clock).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            · Now and next
          </p>
          <div ref={scroll} style={{ height: "60vh", overflow: "auto" }}>
            <div
              style={{ height: virtual.getTotalSize(), position: "relative" }}
            >
              {virtual.getVirtualItems().map((row) => {
                const channel = filtered[row.index];
                const guide = programs
                  .filter(
                    (p) =>
                      p.playlistId === channel.playlistId &&
                      p.channelId === channel.tvgId
                  )
                  .sort((a, b) => a.start - b.start)
                  .slice(0, 3);
                return (
                  <div
                    key={channel.id}
                    className="tv-guide-row"
                    style={{
                      position: "absolute",
                      top: row.start,
                      width: "100%",
                    }}
                    onKeyDown={(event) => {
                      if (
                        event.key === "ArrowDown" &&
                        row.index === virtual.getVirtualItems().at(-1)?.index &&
                        row.index + 1 < filtered.length
                      )
                        virtual.scrollToIndex(row.index + 1);
                    }}
                  >
                    <button
                      onClick={() => void play(channel)}
                      data-tv-key={channel.id}
                    >
                      {channel.name}
                    </button>
                    <div className="tv-programs">
                      <button
                        aria-label={`Favorite ${channel.name}`}
                        aria-pressed={
                          !!saved.data?.some((f) => f.channelId === channel.id)
                        }
                        onClick={() => void toggle(channel)}
                      >
                        ★
                      </button>
                      {guide.length ? (
                        guide.map((p) => (
                          <div
                            key={p.id}
                            className="tv-program"
                            style={{
                              flexGrow: Math.max(1, (p.stop - p.start) / 60000),
                            }}
                          >
                            <small>
                              {new Date(p.start).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </small>
                            {p.title}
                          </div>
                        ))
                      ) : (
                        <div className="tv-program">No guide information</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="tv-dialog">
          <DialogHeader>
            <DialogTitle>Add IPTV playlist</DialogTitle>
          </DialogHeader>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Type
            <ThemedSelect
              value={sourceKind}
              onChange={(e) => setSourceKind(e.target.value)}
            >
              <option value="m3u">M3U</option>
              <option value="xtream">Xtream Codes</option>
            </ThemedSelect>
          </label>
          <label>
            {sourceKind === "m3u" ? "Playlist URL" : "Server URL"}
            <input value={url} onChange={(e) => setUrl(e.target.value)} />
          </label>
          {sourceKind === "xtream" && (
            <>
              <label>
                Username
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
            </>
          )}
          <label>
            XMLTV guide URL (optional)
            <input value={epgURL} onChange={(e) => setEPGURL(e.target.value)} />
          </label>
          <button
            disabled={busy || !url}
            onClick={() =>
              void run(async (signal) => {
                const playlist = await savePlaylist(
                  name,
                  sourceKind === "m3u"
                    ? {
                        kind: "m3u",
                        url,
                        ...(epgURL ? { epgUrl: epgURL } : {}),
                      }
                    : { kind: "xtream", server: url, username, password },
                  undefined,
                  signal
                );
                if (epgURL) await importEPG(epgURL, playlist.id, signal);
                setAdding(false);
                setPassword("");
              })
            }
          >
            Import
          </button>
          <p role="status">{message}</p>
        </DialogContent>
      </Dialog>
      <Dialog
        open={series.length > 0}
        onOpenChange={(open) => {
          if (!open) setSeries([]);
        }}
      >
        <DialogContent className="tv-dialog">
          <DialogHeader>
            <DialogTitle>Series episodes</DialogTitle>
          </DialogHeader>
          <div style={{ maxHeight: "65vh", overflow: "auto" }}>
            {series.map((item) => (
              <button
                key={item.id}
                onClick={() =>
                  void openNativePlayer({
                    url: item.url,
                    title: item.title,
                    mediaId: item.id,
                  })
                }
              >
                {item.title}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
