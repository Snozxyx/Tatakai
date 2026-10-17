import { useEffect } from "react";
import { registerPlugin, Capacitor } from "@capacitor/core";
import { useWatchHistory } from "@/hooks/user/useWatchHistory";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/core/db/tatakai-db";
import { liveQuery } from "dexie";
const launcher = registerPlugin<{
  sync(options: { items: unknown[] }): Promise<void>;
  syncLive(options: { items: unknown[] }): Promise<void>;
}>("TvHomeChannel");
export function publishTVSuggestions(
  items: Array<{ id: string; name: string; isAdult?: boolean }>
) {
  if (!Capacitor.isPluginAvailable("TvHomeChannel")) return;
  const search = registerPlugin<{
    publishSuggestions(options: {
      items: Array<{ title: string; uri: string }>;
    }): Promise<void>;
  }>("TvHomeChannel");
  void search
    .publishSuggestions({
      items: items
        .filter((item) => !item.isAdult)
        .slice(0, 100)
        .map((item) => ({
          title: item.name,
          uri: `tatakai://anime/${item.id}`,
        })),
    })
    .catch(() => undefined);
}
export function TVLauncherSync() {
  const { user } = useAuth();
  const history = useWatchHistory(20);
  useEffect(() => {
    if (!Capacitor.isPluginAvailable("TvHomeChannel")) return;
    void launcher
      .sync({
        items: user
          ? (history.data || [])
              .filter((i) => !i.completed && i.progress_seconds > 0)
              .map((item) => ({
                id: item.anime_id,
                title: item.anime_name,
                poster: item.anime_poster || "",
                positionMs: Math.round(item.progress_seconds * 1000),
                durationMs: Math.round((item.duration_seconds || 0) * 1000),
                updatedAt: Date.parse(item.watched_at),
                uri: `tatakai://watch/${encodeURIComponent(
                  item.episode_id
                )}?animeId=${encodeURIComponent(item.anime_id)}&ep=${
                  item.episode_number
                }`,
              }))
          : [],
      })
      .catch(() => undefined);
  }, [history.data, user]);
  useEffect(() => {
    if (!Capacitor.isPluginAvailable("TvHomeChannel")) return;
    const subscription = liveQuery(() =>
      db.iptvChannels.where("kind").equals("live").limit(12).toArray()
    ).subscribe((channels) => {
      void launcher
        .syncLive({
          items: user
            ? channels.map((item) => ({
                id: item.id,
                title: item.name,
                poster: item.logo || "",
                uri: `tatakai://tv/iptv?channel=${encodeURIComponent(item.id)}`,
              }))
            : [],
        })
        .catch(() => undefined);
    });
    return () => subscription.unsubscribe();
  }, [user]);
  return null;
}
