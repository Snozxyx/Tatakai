import {
  useMobileDownload,
  useOfflineLibrary,
} from "@/hooks/media/useMobileDownload";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/core/db/tatakai-db";
import { Play, RotateCcw, X } from "lucide-react";
export default function TVDownloadsPage() {
  const queue = useMobileDownload(),
    offline = useOfflineLibrary(),
    navigate = useNavigate();
  const books = useQuery({
    queryKey: ["tv-downloaded-books"],
    queryFn: async () => ({
      manga: await db.offlineChapters.toArray(),
      novels: await db.offlineNovels.toArray(),
    }),
  });
  return (
    <div className="tv-page">
      <h1>Downloads</h1>
      <p>Your stories, even without a connection.</p>
      {queue.queue.length > 0 && (
        <>
          <h2>Download queue</h2>
          <div className="tv-download-list">
            {queue.queue.map((item) => (
              <article key={item.id}>
                {item.posterUrl && <img src={item.posterUrl} alt="" />}
                <div>
                  <h2>{item.animeTitle || item.title}</h2>
                  <p>
                    {item.subtitle} · {item.status}
                  </p>
                  <progress max={100} value={item.progress || 0} />
                  <p>{item.error}</p>
                </div>
                <div className="tv-actions">
                  {["queued", "downloading"].includes(item.status) ? (
                    <button onClick={() => queue.cancelDownload(item.id)}>
                      <X />
                      Cancel
                    </button>
                  ) : (
                    item.status === "failed" && (
                      <button onClick={() => queue.retryDownload(item.id)}>
                        <RotateCcw />
                        Retry
                      </button>
                    )
                  )}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
      <h2>Ready to watch</h2>
      {offline.loading && <p role="status">Opening your offline library…</p>}
      {offline.error && <p role="alert">{String(offline.error)}</p>}
      <div className="tv-download-list">
        {offline.episodes.map((item) => (
          <article key={item.episodeId}>
            {item.poster && <img src={item.poster} alt="" />}
            <div>
              <h2>{item.animeTitle}</h2>
              <p>Episode {item.episode}</p>
            </div>
            <button
              className="tv-primary"
              onClick={() => {
                const params = new URLSearchParams({
                  offline: "true",
                  mobilePath: item.localPath,
                  title: item.animeTitle,
                  animeId: item.animeId,
                });
                navigate(
                  `/watch/${encodeURIComponent(item.episodeId)}?${params}`
                );
              }}
            >
              <Play />
              Play offline
            </button>
          </article>
        ))}
      </div>
      {!offline.loading && !offline.episodes.length && (
        <p>
          No downloaded episodes yet. Choose a source on a watch page to
          download.
        </p>
      )}
      <h2>Offline reading · Experimental</h2>
      <div className="tv-chapter-grid">
        {books.data?.manga.map((item) => (
          <button
            key={item.id}
            onClick={() =>
              navigate(
                `/manga/read/${item.anilistId}?chapterKey=${encodeURIComponent(
                  item.chapterKey
                )}&offline=true`
              )
            }
          >
            {item.title || "Manga"} · {item.chapterKey}
          </button>
        ))}
        {books.data?.novels.map((item) => (
          <button
            key={item.id}
            onClick={() =>
              navigate(
                `/novel/read/${encodeURIComponent(
                  item.novelId || String(item.anilistId)
                )}?chapterKey=${encodeURIComponent(
                  item.chapterKey
                )}&offline=true`
              )
            }
          >
            {item.title || "Novel"} · {item.chapterKey}
          </button>
        ))}
      </div>
    </div>
  );
}
