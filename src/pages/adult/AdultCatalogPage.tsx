import { useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AdultPageShell } from '@/components/content/AdultPageShell';
import { ThemedSelect } from '@/components/ui/themed-select';
import { HeroSection } from "@/components/anime/HeroSection";
import { UnifiedMediaCard } from "@/components/UnifiedMediaCard";
import { Button } from "@/components/ui/button";
import { useContentSafetySettings } from "@/hooks/user/useContentSafetySettings";
import {
  normalizeAdultCategories,
  selectedAdultCategories,
} from "@/lib/adultContentPolicy";
import { adultApi, type AdultMedia, type AdultPage, type AdultHome } from "@/lib/adultApi";
import { selectMediaTitle, selectReadingTitle } from "@/lib/titleLanguage";
import "@/components/layout/catalog-polish.css";
const kinds = ["anime", "manga", "novel"] as const;
const title = (m: AdultMedia) =>
  m.mediaType === "anime" ? selectMediaTitle(m) : selectReadingTitle(m);
const href = (m: AdultMedia) =>
  "/adult/" + m.mediaType + "/" + (m.anilistId || m.id);
export default function AdultCatalogPage({
  kind: fixedKind,
}: {
  kind?: "anime" | "manga" | "novel";
}) {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const { settings } = useContentSafetySettings();
  const categories = selectedAdultCategories(
    normalizeAdultCategories(settings.adultCategories)
  );
  const kind =
    fixedKind ||
    (kinds.includes(params.get("kind") as any)
      ? (params.get("kind") as (typeof kinds)[number])
      : "anime");
  const search =
    location.pathname.includes("/search") ||
    location.pathname.includes("/discover") ||
    location.pathname.includes("/genre");
  const trending = location.pathname.includes("/trending");
  const [term, setTerm] = useState(params.get("q") || "");
  const page = Math.max(1, Number(params.get("page")) || 1);
  const filterKey = categories.join(",");
  const query = useQuery({
    queryKey: [
      "adult-catalog",
      kind,
      search,
      trending,
      params.toString(),
      filterKey,
    ],
    queryFn: ({ signal }) =>
      adultApi<Partial<AdultPage & AdultHome>>(
        search ? "search" : trending ? "trending" : "home",
        {
          kind,
          q: params.get("q") || undefined,
          page: String(page),
          sort: params.get("sort") || undefined,
          genre: params.get("genre") || undefined,
          source: params.get("source") || undefined,
        },
        signal
      ),
    enabled: categories.length > 0,
  });
  const change = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    next.delete("page");
    setParams(next);
  };
  const data = query.data;
  const spotlight = data?.spotlight?.[0];
  const lane = (name: string, rows: AdultMedia[] | undefined) => (
    <section className="adult-catalog-lane">
      <h2>{name}</h2>
      <div className="adult-catalog-grid">
        {rows?.map((m) => (
          <UnifiedMediaCard
            key={m.id}
            libraryActions={Boolean(m.anilistId)}
            item={{
              id: m.id,
              name: title(m),
              poster: m.coverImageLarge || "",
              banner: m.bannerImage,
              description: m.description,
              type: m.format,
              status: m.status,
              mediaType: m.mediaType,
              href: href(m),
              anilistId: m.anilistId,
              malId: m.malId,
              year: m.startDate?.year,
              rating: m.averageScore ? m.averageScore / 10 : undefined,
              chapters: m.chapters,
              isAdult: true,
              blurAdult: search && settings.blurAdultInSearch,
            }}
          />
        ))}
      </div>
    </section>
  );
  return (
    <AdultPageShell className="catalog-page">
        {(search || trending) && (
          <form
            className="mb-6 flex flex-wrap gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              change("q", term);
            }}
          >
            <input
              aria-label="Search adult titles"
              className="rounded-lg border border-border bg-background p-3"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search adult titles…"
            />
            <ThemedSelect
              aria-label="Media type"
              className="rounded-lg border border-border bg-background p-3"
              value={kind}
              onChange={(e) => change("kind", e.target.value)}
            >
              {kinds.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </ThemedSelect>
            <ThemedSelect
              aria-label="Sort adult titles"
              className="rounded-lg border border-border bg-background p-3"
              value={params.get("sort") || "popular"}
              onChange={(e) => change("sort", e.target.value)}
            >
              <option value="popular">Popular</option>
              <option value="score">Highest rated</option>
              <option value="latest">Latest</option>
            </ThemedSelect>
            <Button>Search</Button>
          </form>
        )}
        {kind === "manga" && (
          <div className="adult-subnav">
            <Link to="/adult/search?kind=manga">All adult manga</Link>
            <Link to="/adult/search?kind=manga&source=pornhwadb">Pornhwa</Link>
          </div>
        )}
        {!categories.length ? (
          <p role="status" className="py-20 text-center">
            All adult categories are hidden. Enable one in NSFW settings.
          </p>
        ) : query.isPending ? (
          <p role="status" className="py-20 text-center">
            Loading adult catalog…
          </p>
        ) : query.error ? (
          <div role="alert" className="py-20 text-center">
            <p>{query.error.message}</p>
            <Button onClick={() => query.refetch()}>Try again</Button>
          </div>
        ) : search || trending ? (
          <>
            {lane(trending ? params.has("sort") || params.has("q") || params.has("genre") || params.has("source") ? "Adult catalog rankings" : data?.source === "db" ? "Popular adult titles" : "Adult trending" : "Search results", data?.media)}
            {!data?.media?.length && (
              <p className="py-16 text-center">
                No titles match these filters.
              </p>
            )}
            <div className="mt-6 flex gap-3">
              <Button
                disabled={page === 1}
                onClick={() => {
                  const p = new URLSearchParams(params);
                  p.set("page", String(page - 1));
                  setParams(p);
                }}
              >
                Previous
              </Button>
              <Button
                disabled={!data?.pageInfo?.hasNextPage}
                onClick={() => {
                  const p = new URLSearchParams(params);
                  p.set("page", String(page + 1));
                  setParams(p);
                }}
              >
                Next
              </Button>
            </div>
          </>
        ) : (
          <>
            {spotlight && (
              <HeroSection
                spotlight={{
                  id: spotlight.id,
                  name: title(spotlight),
                  jname: spotlight.titleNative || "",
                  poster: spotlight.coverImageLarge || "",
                  banner: spotlight.bannerImage,
                  description: spotlight.description || "",
                  rank: 1,
                  otherInfo: [spotlight.format || kind],
                  episodes: { sub: spotlight.episodes || 0, dub: 0 },
                  isAdult: true,
                }}
                getDetailsPath={() => href(spotlight)}
                hideCatalogActions
                mediaType={kind}
              />
            )}
            {lane(data?.trendingSource === "db" ? "Popular" : "Trending", data?.trending)}
            {data?.trendingNote && <p className="text-sm text-muted-foreground">{data.trendingNote}</p>}
            {kind === "manga" && data?.pornhwa?.length
              ? lane("Pornhwa", data.pornhwa)
              : null}
            {lane("Recently updated", data?.latest)}
            {lane("Highest rated", data?.top)}
            {!data?.popular?.length && (
              <p className="py-16 text-center">
                No catalog titles are available yet.
              </p>
            )}
          </>
        )}
    </AdultPageShell>
  );
}
