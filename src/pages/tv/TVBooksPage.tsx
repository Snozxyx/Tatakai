import { TVLoadMore } from "@/components/tv/TVLoadMore";
import { useState } from "react";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { BookOpen } from "lucide-react";
import {
  searchManga,
  getMangaDetail,
  getMangaChapters,
} from "@/core/content/manga-client";
import {
  searchNovels,
  getNovelDetail,
  getNovelChapters,
} from "@/core/content/novel-client";
import { useContentSafetySettings } from "@/hooks/user/useContentSafetySettings";
import { TVContentCard } from "@/components/tv/TVContentCard";

export default function TVBooksPage({
  kind,
  id,
}: {
  kind: "manga" | "novel";
  id?: string;
}) {
  const [query, setQuery] = useState(""),
    [chapterPage, setChapterPage] = useState(0);
  const { settings } = useContentSafetySettings();
  const navigate = useNavigate();
  const catalog = useInfiniteQuery({
    queryKey: ["tv-books-infinite", kind, query],
    enabled: !id,
    initialPageParam: 1,
    queryFn: async ({
      pageParam,
    }): Promise<
      | Awaited<ReturnType<typeof searchManga>>
      | Awaited<ReturnType<typeof searchNovels>>
    > =>
      kind === "manga"
        ? searchManga(query, pageParam, 24)
        : searchNovels(query, pageParam, 24),
    getNextPageParam: (last, pages) =>
      last.hasNextPage ? pages.length + 1 : undefined,
  });
  const detailQuery = useQuery<
    | Awaited<ReturnType<typeof getMangaDetail>>
    | Awaited<ReturnType<typeof getNovelDetail>>
  >({
    queryKey: ["tv-book-detail", kind, id],
    enabled: !!id,
    queryFn: () =>
      kind === "manga" ? getMangaDetail(id!) : getNovelDetail(id!),
  });
  const detail = detailQuery.data?.detail;
  const chapters = useQuery<
    | Awaited<ReturnType<typeof getMangaChapters>>
    | Awaited<ReturnType<typeof getNovelChapters>>
  >({
    queryKey: ["tv-book-chapters", kind, id, detail?.canonicalTitle],
    enabled: !!id && !!detail,
    queryFn: () =>
      kind === "manga"
        ? getMangaChapters(id!)
        : getNovelChapters(id!, detail?.canonicalTitle),
  });
  function openChapter(chapter: {
    chapterNumber: number | null;
    chapterTitle: string | null;
    sources: Array<{
      chapterKey: string;
      provider: string;
      providerChapterId: string;
    }>;
  }) {
    const source = chapter.sources[0];
    if (!source) return;
    const params = new URLSearchParams({
      chapterKey: source.chapterKey,
      provider: source.provider,
      providerChapterId: source.providerChapterId,
      ...(chapter.chapterNumber != null
        ? { chapterNumber: String(chapter.chapterNumber) }
        : {}),
      ...(chapter.chapterTitle ? { chapterTitle: chapter.chapterTitle } : {}),
    });
    navigate(`/${kind}/read/${id}?${params}`, {
      state: { sources: chapter.sources },
    });
  }
  const list = chapters.data?.mappedChapters || [];
  if (id)
    return (
      <div className="tv-page">
        <p className="tv-experimental">
          Experimental TV {kind === "manga" ? "manga" : "novel"} reader
        </p>
        {detailQuery.isLoading ? (
          <p role="status">Loading title…</p>
        ) : detailQuery.error || !detail ? (
          <button onClick={() => void detailQuery.refetch()}>
            Retry title
          </button>
        ) : (
          <>
            <section className="tv-book-detail">
              <img src={detail.coverImage || ""} alt="" />
              <div>
                <h1>{detail.canonicalTitle}</h1>
                <p className="tv-meta">{detail.genres?.join(" · ")}</p>
                <p className="tv-synopsis">
                  {detail.synopsis?.replace(/<[^>]*>/g, "")}
                </p>
                <div className="tv-actions">
                  <button
                    className="tv-primary"
                    disabled={!list[0]?.sources.length}
                    onClick={() => list[0] && openChapter(list[0])}
                  >
                    <BookOpen />
                    Start reading
                  </button>
                  <button onClick={() => navigate("/extensions")}>
                    Manage sources
                  </button>
                </div>
              </div>
            </section>
            <div className="tv-section-heading">
              <h2>
                Chapters <span>{list.length}</span>
              </h2>
              <div className="tv-actions">
                <button
                  disabled={chapterPage === 0}
                  onClick={() => setChapterPage((value) => value - 1)}
                >
                  Previous
                </button>
                <button
                  disabled={(chapterPage + 1) * 30 >= list.length}
                  onClick={() => setChapterPage((value) => value + 1)}
                >
                  Next
                </button>
              </div>
            </div>
            {chapters.isLoading && (
              <p role="status">Finding chapters from your sources…</p>
            )}
            {chapters.error && (
              <button onClick={() => void chapters.refetch()}>
                Retry chapters
              </button>
            )}
            <div className="tv-chapter-grid">
              {list
                .slice(chapterPage * 30, (chapterPage + 1) * 30)
                .map((chapter, index) => (
                  <button
                    key={`${chapter.chapterNumber}-${index}`}
                    disabled={!chapter.sources.length}
                    onClick={() => openChapter(chapter)}
                  >
                    <strong>
                      Chapter {chapter.chapterNumber ?? index + 1}
                    </strong>
                    <span>
                      {chapter.chapterTitle ||
                        `${chapter.sources.length} source${
                          chapter.sources.length === 1 ? "" : "s"
                        }`}
                    </span>
                  </button>
                ))}
            </div>
            {!chapters.isLoading && !list.length && (
              <p>No chapters found. Install a reading extension and retry.</p>
            )}
          </>
        )}
      </div>
    );
  return (
    <div className="tv-page">
      <div className="tv-page-heading">
        <div>
          <h1>{kind === "manga" ? "Manga" : "Novels"}</h1>
          <p>
            Another way to get lost in a story.{" "}
            <span className="tv-label">Experimental</span>
          </p>
        </div>
        <input
          aria-label={`Search ${kind}`}
          placeholder="Find a title"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
      </div>
      <div className="tv-filter-tabs">
        <button
          aria-pressed={!query}
          onClick={() => {
            setQuery("");
          }}
        >
          Discover
        </button>
        <button onClick={() => navigate("/downloads")}>Offline library</button>
        <button onClick={() => navigate("/extensions")}>Reading sources</button>
      </div>
      {catalog.isLoading && <p role="status">Loading stories…</p>}
      {catalog.error && (
        <button onClick={() => void catalog.refetch()}>Retry catalog</button>
      )}
      <div className="tv-poster-grid">
        {catalog.data?.pages
          .flatMap<
            | Awaited<ReturnType<typeof searchManga>>["results"][number]
            | Awaited<ReturnType<typeof searchNovels>>["results"][number]
          >((page) => page.results)
          .filter((item) => settings.showAdultEverywhere || !item.adult)
          .map((item, index) => (
            <TVContentCard
              key={item.id || item.anilistId || index}
              item={{
                id: String(item.id || item.anilistId),
                name: item.canonicalTitle,
                poster: item.poster || "",
                banner: item.banner,
                description: item.description,
                type: item.mediaType,
                status: item.status,
                rating: item.score ? (item.score / 10).toFixed(1) : undefined,
                year: item.year || undefined,
                chapters: item.chapters || undefined,
                isAdult: item.adult,
                href: `/${kind}/${encodeURIComponent(
                  String(item.id || item.anilistId)
                )}`,
                subtitle: [item.year, item.status].filter(Boolean).join(" · "),
              }}
            />
          ))}
      </div>
      <TVLoadMore
        hasMore={catalog.hasNextPage && !catalog.error}
        busy={catalog.isFetchingNextPage}
        load={() => catalog.fetchNextPage()}
        label="More stories"
      />
    </div>
  );
}
