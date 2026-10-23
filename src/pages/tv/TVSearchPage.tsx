import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { searchCompatibility } from '@/core/extensions/compatibility/content';
import { Mic, Search } from "lucide-react";
import { TVLoadMore } from "@/components/tv/TVLoadMore";
import { TVContentCard } from "@/components/tv/TVContentCard";
import { useTVCatalogue } from "@/core/tv/catalogue";
import { TVRail } from "./TVHomePage";
import { devicePlugin } from "@/core/tv/device";
import { useQuery } from "@tanstack/react-query";
import { searchManga } from "@/core/content/manga-client";
import { searchNovels } from "@/core/content/novel-client";
import { db } from "@/core/db/tatakai-db";
import { useContentSafetySettings } from "@/hooks/user/useContentSafetySettings";
export default function TVSearchPage({ format }: { format?: "tv" | "movie" }) {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") || ""),
    [debounced, setDebounced] = useState(query),
    [error, setError] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 350);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    if (params.has("q")) setQuery(params.get("q")!);
  }, [params]);
  const { settings } = useContentSafetySettings();
  const result = useTVCatalogue(debounced, format, settings.showAdultEverywhere);
  const animeItems = result.data?.pages.flatMap((page) => page.animes) || [];
  const extensionSearch = useQuery({ queryKey: ['compatibility', 'tv-search', debounced], enabled: debounced.trim().length > 1,
    queryFn: ({ signal }) => searchCompatibility(debounced, undefined, signal), retry: false });

  const extra = useQuery({
    queryKey: ["tv-search-everywhere", debounced, settings.showAdultEverywhere],
    enabled: !format && debounced.trim().length > 1,
    queryFn: async () => {
      const [manga, novels, channels] = await Promise.allSettled([
        searchManga(debounced, 1, 8),
        searchNovels(debounced, 1, 8),
        db.iptvChannels
          .filter((channel) =>
            channel.name.toLowerCase().includes(debounced.toLowerCase())
          )
          .limit(12)
          .toArray(),
      ]);
      return {
        manga:
          manga.status === "fulfilled"
            ? manga.value.results
                .filter((item) => settings.showAdultEverywhere || !item.adult)
                .map((item) => ({
                  id: String(item.id || item.anilistId),
                  name: item.canonicalTitle,
                  poster: item.poster || "",
                  href: `/manga/${item.id || item.anilistId}`,
                }))
            : [],
        novels:
          novels.status === "fulfilled"
            ? novels.value.results
                .filter((item) => settings.showAdultEverywhere || !item.adult)
                .map((item) => ({
                  id: String(item.id || item.anilistId),
                  name: item.canonicalTitle,
                  poster: item.poster || "",
                  href: `/novel/${item.id || item.anilistId}`,
                }))
            : [],
        channels:
          channels.status === "fulfilled"
            ? channels.value.map((item) => ({
                id: item.id,
                name: item.name,
                poster: item.logo,
                href: `/tv/iptv?channel=${encodeURIComponent(item.id)}`,
              }))
            : [],
      };
    },
  });
  const keys = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split("");
  return (
    <div className="tv-search">
      <h1>
        {format === "movie"
          ? "Movies"
          : format
          ? "Shows"
          : "Find your next obsession"}
      </h1>
      <div className="tv-search-input">
        <Search />
        <input
          value={query}
          placeholder="Search titles"
          onChange={(e) => {
            setQuery(e.target.value);
            setParams({ q: e.target.value }, { replace: true });
          }}
        />
        <button
          aria-label="Voice search"
          onClick={() =>
            void devicePlugin
              .voiceSearch()
              .then((result) => setQuery(result.query))
              .catch((e) => setError(e.message))
          }
        >
          <Mic />
        </button>
      </div>
      <div className="tv-keyboard">
        {keys.map((key) => (
          <button key={key} onClick={() => setQuery((value) => value + key)}>
            {key}
          </button>
        ))}
        <button onClick={() => setQuery((value) => value + " ")}>Space</button>
        <button onClick={() => setQuery((value) => value.slice(0, -1))}>
          Delete
        </button>
        <button onClick={() => setQuery("")}>Clear</button>
      </div>
      {error && <p role="alert">{error}</p>}
      {(result.isFetching || extra.isFetching) && (
        <p role="status">Searching…</p>
      )}
      {result.error && <p role="alert">Search could not load. Try again.</p>}
      <section>
        <h2>Anime</h2>
        <div className="tv-search-results">
          {animeItems.map((item) => (
            <TVContentCard key={item.id} item={item} />
          ))}
        </div>
      </section>
      <TVRail title="Manga" items={extra.data?.manga || []} />
      <TVRail title="Novels" items={extra.data?.novels || []} />
      <TVRail title="IPTV channels" items={extra.data?.channels || []} />
      {!!extensionSearch.data?.length && <section><h2>Extension sources</h2><div className="tv-search-results">{extensionSearch.data.map(item => <Link key={item.route} to={item.route} data-tv-key={`compat-result-${item.sourceId}-${item.id}`}><strong>{item.title}</strong><p>{item.providerName}</p></Link>)}</div></section>}
      <TVLoadMore
        hasMore={result.hasNextPage && !result.error}
        busy={result.isFetchingNextPage}
        load={() => result.fetchNextPage()}
      />
      {result.data &&
        !animeItems.length &&
        !extra.data?.manga.length &&
        !extra.data?.novels.length &&
        !extra.data?.channels.length && !extensionSearch.data?.length && !extensionSearch.isFetching && (
          <p>No titles found. Try another search.</p>
        )}
    </div>
  );
}
