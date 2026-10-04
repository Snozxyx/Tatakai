/**
 * Custom-source home page (`/x/:namespace/:sourceId`).
 *
 * Reuses the app's own `UnifiedMediaCard` (the same card behind anime/manga/search)
 * so custom sources look identical to the built-in surfaces, but every card routes
 * to `/x/<ns>/<sid>/info/<id>` via a relative `href` — it NEVER touches the
 * anime/manga watchlist or readlist. Sections come from the extension's
 * `customHome`; the search box drives `customSearch`.
 */

import { useMemo, useState } from "react";
import { Search, Loader2, X, ArrowLeft, SlidersHorizontal } from "lucide-react";
import { Background } from "@/components/layout/Background";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { Header } from "@/components/layout/Header";
import { useIsNativeApp } from "@/hooks/ui/useIsNativeApp";
import { useIsMobile } from "@/hooks/ui/use-mobile";
import { cn } from "@/lib/utils";
import { UnifiedMediaCard, type UnifiedMediaCardProps } from "@/components/UnifiedMediaCard";
import { CardSkeleton } from "@/components/ui/skeleton-custom";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useNavigate, useParams } from "react-router-dom";
import { useCustomHome, useCustomSearch, useCustomSource } from "@/hooks/api/useCustomSource";
import { ExtensionSlot } from "@/core/extensions/ExtensionSlot";
import type { CustomMediaCard, CustomSearchFilters } from "@/core/extensions/sdk/types";

/** Map a source card to the shared card contract, routing to the custom info page. */
function toUnifiedCustomCard(
  card: CustomMediaCard,
  base: string,
  kind: "read" | "watch",
): UnifiedMediaCardProps["item"] {
  return {
    id: String(card.id),
    name: card.title,
    poster: card.image || "",
    mediaType: kind === "read" ? "manga" : "anime",
    status: card.badge || undefined,
    href: `${base}/info/${encodeURIComponent(card.id)}`,
  };
}

function CardGrid({ cards }: { cards: UnifiedMediaCardProps["item"][] }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
      {cards.map((item) => (
        <UnifiedMediaCard key={item.id} item={item} />
      ))}
    </div>
  );
}

export default function CustomHomePage() {
  const isNative = useIsNativeApp();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { namespace, sourceId } = useParams<{ namespace: string; sourceId: string }>();
  const { source } = useCustomSource(namespace, sourceId);
  const kind = source?.kind === "read" ? "read" : "watch";
  const base = `/x/${namespace}/${sourceId}`;

  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [filters, setFilters] = useState<CustomSearchFilters>({ tags: [] });
  const [showFilters, setShowFilters] = useState(false);
  const [showAllTags, setShowAllTags] = useState(false);

  const { data: home, isLoading } = useCustomHome(namespace, sourceId);

  const schema = home?.filters;
  const schemaTags = schema?.tags ?? [];
  const schemaGroups = schema?.groups ?? [];
  const hasFilterUi = schemaTags.length > 0 || schemaGroups.length > 0;

  const activeTags = filters.tags ?? [];
  const hasActiveFilters = useMemo(
    () =>
      activeTags.length > 0 ||
      Object.entries(filters).some(([k, v]) => k !== "tags" && typeof v === "string" && v !== ""),
    [filters, activeTags],
  );

  const resultsMode = Boolean(submitted) || hasActiveFilters;

  const { data: searchData, isLoading: searching } = useCustomSearch(
    namespace,
    sourceId,
    submitted,
    1,
    hasActiveFilters ? filters : undefined,
  );

  const toggleTag = (tag: string) =>
    setFilters((f) => {
      const next = new Set(f.tags ?? []);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return { ...f, tags: Array.from(next) };
    });

  const setGroup = (key: string, value: string) =>
    setFilters((f) => ({ ...f, [key]: value || undefined }));

  const clearFilters = () => setFilters({ tags: [] });

  const clearAll = () => {
    setQuery("");
    setSubmitted("");
    clearFilters();
  };

  const sections = useMemo(
    () =>
      (home?.sections ?? []).map((s) => ({
        title: s.title,
        cards: (s.items ?? []).map((c) => toUnifiedCustomCard(c, base, kind)),
      })),
    [home, base, kind],
  );

  const searchCards = useMemo(
    () => (searchData?.results ?? []).map((c) => toUnifiedCustomCard(c, base, kind)),
    [searchData, base, kind],
  );

  const hasSections = sections.some((s) => s.cards.length > 0);

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      {!isNative && <Background />}
      {!isMobile && <Sidebar />}

      <main
        className={cn(
          "relative z-10 mx-auto max-w-[1800px] py-6 pr-6 pb-24 md:pb-6",
          isNative ? "pl-6" : "pl-6 md:pl-32",
        )}
      >
        <Header />

        {/* Extension mount point — top of a custom-source home (scoped by ns/sid). */}
        <ExtensionSlot slotId="custom-home-top" props={{ namespace, sourceId, kind }} />

        <button
          type="button"
          onClick={() => navigate('/extensions')}
          className="mb-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-white/15 px-3 py-2 text-sm font-semibold active:scale-95 hover:bg-white/10"
          aria-label="Back to extensions"
        >
          <ArrowLeft className="h-4 w-4" /> Extensions
        </button>

        <div className="mb-8 mt-2 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-3xl font-black tracking-tight">{source?.name || "Custom source"}</h1>
            {source?.description ? (
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{source.description}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setSubmitted(query.trim());
              }}
              className="flex items-center gap-2"
            >
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search…"
                  className="w-56 rounded-xl border border-white/15 bg-white/5 py-2 pl-9 pr-8 text-sm outline-none focus:border-primary/60"
                />
                {submitted ? (
                  <button
                    type="button"
                    onClick={clearAll}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </form>
            {hasFilterUi ? (
              <button
                type="button"
                onClick={() => setShowFilters((v) => !v)}
                className={cn(
                  "inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition active:scale-95",
                  showFilters || hasActiveFilters
                    ? "border-primary/60 bg-primary/20 text-foreground"
                    : "border-white/15 bg-white/5 text-muted-foreground hover:bg-white/10",
                )}
                aria-label="Toggle filters"
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filters
                {hasActiveFilters ? (
                  <span className="rounded-md bg-primary/40 px-1.5 py-0.5 text-[11px]">
                    {activeTags.length + Object.keys(filters).filter((k) => k !== "tags" && filters[k]).length}
                  </span>
                ) : null}
              </button>
            ) : null}
          </div>
        </div>

        {hasFilterUi && showFilters ? (
          <GlassPanel className="mb-8 border border-white/10 p-4">
            {schemaGroups.length > 0 ? (
              <div className="mb-4 flex flex-wrap gap-3">
                {schemaGroups.map((group) => (
                  <label key={group.key} className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
                    {group.label}
                    <select
                      value={typeof filters[group.key] === "string" ? (filters[group.key] as string) : ""}
                      onChange={(e) => setGroup(group.key, e.target.value)}
                      className="min-w-[9rem] rounded-lg border border-white/15 bg-background/80 px-2.5 py-1.5 text-sm font-medium text-foreground outline-none focus:border-primary/60"
                    >
                      <option value="">Any</option>
                      {group.options.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            ) : null}

            {schemaTags.length > 0 ? (
              <div>
                <div className="mb-2 text-xs font-semibold text-muted-foreground">Tags</div>
                <div className="flex flex-wrap gap-2">
                  {(showAllTags ? schemaTags : schemaTags.slice(0, 24)).map((tag) => {
                    const active = activeTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs font-medium transition active:scale-95",
                          active
                            ? "border-primary/60 bg-primary/25 text-foreground"
                            : "border-white/15 bg-white/5 text-muted-foreground hover:bg-white/10",
                        )}
                      >
                        {tag}
                      </button>
                    );
                  })}
                  {schemaTags.length > 24 ? (
                    <button
                      type="button"
                      onClick={() => setShowAllTags((v) => !v)}
                      className="rounded-full border border-dashed border-white/20 px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-white/10"
                    >
                      {showAllTags ? "Show less" : `+${schemaTags.length - 24} more`}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {hasActiveFilters ? (
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-white/10"
                >
                  <X className="h-3.5 w-3.5" /> Clear filters
                </button>
              </div>
            ) : null}
          </GlassPanel>
        ) : null}

        {resultsMode ? (
          <section className="mb-10">
            <h3 className="mb-6 px-2 font-display text-xl font-semibold tracking-tight">
              {submitted ? `Results for “${submitted}”` : "Filtered results"}
            </h3>
            {searching ? (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
                {Array.from({ length: 12 }).map((_, i) => (
                  <CardSkeleton key={`search-skel-${i}`} />
                ))}
              </div>
            ) : searchCards.length > 0 ? (
              <CardGrid cards={searchCards} />
            ) : (
              <GlassPanel className="border border-white/10 p-6">
                <p className="text-sm text-muted-foreground">
                  {submitted ? `No results for “${submitted}”.` : "No results for the selected filters."}
                </p>
              </GlassPanel>
            )}
          </section>
        ) : isLoading ? (
          <div className="space-y-10">
            {Array.from({ length: 2 }).map((_, row) => (
              <div key={`skel-row-${row}`}>
                <div className="mb-4 h-7 w-48 rounded-lg bg-muted/50" />
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <CardSkeleton key={`skel-${row}-${i}`} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : hasSections ? (
          <div className="space-y-10">
            {sections
              .filter((s) => s.cards.length > 0)
              .map((s) => (
                <section key={s.title}>
                  <h3 className="mb-6 px-2 font-display text-2xl font-semibold tracking-tight">{s.title}</h3>
                  <CardGrid cards={s.cards} />
                </section>
              ))}
          </div>
        ) : (
          <GlassPanel className="border border-white/10 p-8 text-center">
            <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-muted-foreground" />
            <h2 className="text-lg font-bold">Nothing here yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              This source returned no home content. Try searching, or check that the extension is running.
            </p>
          </GlassPanel>
        )}

        {/* Extension mount point — bottom of a custom-source home. */}
        <ExtensionSlot slotId="custom-home-bottom" props={{ namespace, sourceId, kind }} />
      </main>

      {!isMobile && <MobileNav />}
    </div>
  );
}
