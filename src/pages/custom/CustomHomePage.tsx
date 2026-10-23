import { ThemedSelect } from "@/components/ui/themed-select";
import uiI18n from "@/lib/uiI18n";
import { useUiTranslation } from "@/hooks/ui/useUiTranslation";
/**
 * Custom-source home page (`/x/:namespace/:sourceId`).
 *
 * Reuses the app's own `UnifiedMediaCard` (the same card behind anime/manga/search)
 * so custom sources look identical to the built-in surfaces, but every card routes
 * to `/x/<ns>/<sid>/info/<id>` via a relative `href` — it NEVER touches the
 * anime/manga watchlist or readlist. Sections come from the extension's
 * `customHome`; the search box drives `customSearch`.
 */

import { useEffect, useMemo, useState } from "react";
import { Search, Loader2, X, ArrowLeft, SlidersHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Background } from "@/components/layout/Background";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { Header } from "@/components/layout/Header";
import { useIsDesktopApp } from "@/hooks/ui/useIsNativeApp";
import { useIsMobile } from "@/hooks/ui/use-mobile";
import { cn } from "@/lib/utils";
import {
  UnifiedMediaCard,
  type UnifiedMediaCardProps,
} from "@/components/UnifiedMediaCard";
import { CardSkeleton } from "@/components/ui/skeleton-custom";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  useCustomHome,
  useCustomSearch,
  useCustomSource,
  useCustomProviderGroups,
} from "@/hooks/api/useCustomSource";
import {
  customProviderKey,
  customSourceBase,
} from "@/core/content/custom-source-model";
import { CustomProviderToolbar } from "@/components/extensions/CustomProviderToolbar";
import { ExtensionContinue } from "@/components/extensions/ExtensionContinue";
import { HomeSectionHeading } from "@/components/home/HomeSectionHeading";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { HeroSection } from "@/components/anime/HeroSection";
import { MobileHomeBackdrop } from "@/components/anime/CinematicHero";
import { useMobileAppearance } from "@/hooks/ui/useMobileAppearance";
import type { SpotlightAnime } from "@/types/anime";
import { ExtensionSlot } from "@/core/extensions/ExtensionSlot";
import type {
  CustomMediaCard,
  CustomSearchFilters,
} from "@/core/extensions/sdk/types";
import { isCapacitor } from "@/lib/platform/platform";
import { registerMobileSource } from "@/core/extensions/mobile/mobileProxy";

/** Map a source card to the shared card contract, routing to the custom info page. */
function toUnifiedCustomCard(
  card: CustomMediaCard,
  base: string,
  kind: "read" | "watch"
): UnifiedMediaCardProps["item"] {
  return {
    id: String(card.id),
    name: card.title,
    poster:
      card.image && isCapacitor() && /^https?:/i.test(card.image)
        ? registerMobileSource({ url: card.image })
        : card.image || "",
    mediaType: kind === "read" ? "manga" : "anime",
    status: card.badge || undefined,
    href: `${base}/info/${encodeURIComponent(card.id)}`,
  };
}

function CardGrid({
  cards,
  rail = false,
}: {
  cards: UnifiedMediaCardProps["item"][];
  rail?: boolean;
}) {
  useUiTranslation();
  return (
    <div
      className={
        rail
          ? "flex snap-x gap-4 overflow-x-auto pb-4"
          : "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6"
      }
    >
      {cards.map((item) => (
        <div
          key={item.id}
          className={rail ? "w-36 shrink-0 snap-start md:w-44" : "min-w-0"}
        >
          <UnifiedMediaCard item={item} />
        </div>
      ))}
    </div>
  );
}

export default function CustomHomePage() {
  useUiTranslation();
  const { t } = useTranslation();
  const isDesktopApp = useIsDesktopApp();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { namespace, sourceId } = useParams<{
    namespace: string;
    sourceId: string;
  }>();
  const {
    source,
    isPending: discovering,
    error: discoveryError,
  } = useCustomSource(namespace, sourceId);
  const { data: groups } = useCustomProviderGroups();
  const group = groups.find(
    (item) => source && customProviderKey(item) === customProviderKey(source)
  );
  const [params, setParams] = useSearchParams();
  const kind = source?.kind === "read" ? "read" : "watch";
  const base = customSourceBase({
    namespace: namespace || "",
    id: sourceId || "",
  });

  const [query, setQuery] = useState(params.get("q") || "");
  const submitted = params.get("q") || "";
  const [page, setPage] = useState(1);
  const [browsePage, setBrowsePage] = useState(1);
  const [expanded, setExpanded] = useState<string>();
  const [filters, setFilters] = useState<CustomSearchFilters>({ tags: [] });
  const [showFilters, setShowFilters] = useState(false);
  const [showAllTags, setShowAllTags] = useState(false);

  const homeQuery = useCustomHome(namespace, sourceId, browsePage);
  const { data: home, isLoading } = homeQuery;
  useEffect(() => {
    setQuery(submitted);
    setPage(1);
  }, [submitted]);
  useEffect(() => {
    setFilters({ tags: [] });
    setPage(1);
    setBrowsePage(1);
    setExpanded(undefined);
    setShowFilters(false);
  }, [namespace, sourceId]);
  useEffect(() => {
    setPage(1);
  }, [filters]);

  const schema = home?.filters;
  const schemaTags = schema?.tags ?? [];
  const schemaGroups = schema?.groups ?? [];
  const hasFilterUi = schemaTags.length > 0 || schemaGroups.length > 0;

  const activeTags = filters.tags ?? [];
  const hasActiveFilters = useMemo(
    () =>
      activeTags.length > 0 ||
      Object.entries(filters).some(
        ([k, v]) => k !== "tags" && typeof v === "string" && v !== ""
      ),
    [filters, activeTags]
  );

  const resultsMode = Boolean(submitted) || hasActiveFilters;

  const searchQuery = useCustomSearch(
    namespace,
    sourceId,
    submitted,
    page,
    hasActiveFilters ? filters : undefined
  );
  const { data: searchData, isLoading: searching } = searchQuery;
  const activeQuery = resultsMode ? searchQuery : homeQuery;

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
    setParams({});
    clearFilters();
  };

  const sections = useMemo(
    () =>
      (home?.sections ?? []).map((s) => ({
        title: s.title,
        cards: (s.items ?? []).map((c) => toUnifiedCustomCard(c, base, kind)),
      })),
    [home, base, kind]
  );

  const searchCards = useMemo(
    () =>
      (searchData?.results ?? []).map((c) =>
        toUnifiedCustomCard(c, base, kind)
      ),
    [searchData, base, kind]
  );

  const hasSections = sections.some((s) => s.cards.length > 0);
  const refreshed = useMobileAppearance();
  const [activeSpotlight, setActiveSpotlight] = useState<SpotlightAnime>();
  const spotlights = useMemo<SpotlightAnime[]>(
    () =>
      (home?.sections?.[0]?.items || [])
        .filter((item) => !!item.image && !item.image.includes("placeholder"))
        .slice(0, 5)
        .map((item, index) => ({
          id: String(item.id),
          name: item.title,
          jname: "",
          poster: item.image || "/placeholder.svg",
          description: item.subtitle || source?.description || "",
          rank: index + 1,
          otherInfo: [source?.name, item.badge].filter(
            (value): value is string => !!value
          ),
          episodes: { sub: 0, dub: 0 },
        })),
    [home, source?.name, source?.description]
  );

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      {refreshed && !resultsMode && (
        <MobileHomeBackdrop
          anime={
            spotlights.find((item) => item.id === activeSpotlight?.id) ||
            spotlights[0]
          }
        />
      )}
      {!isMobile && <Background />}
      {!isMobile && <Sidebar />}

      <main
        data-mobile-home
        className={cn(
          "app-page relative z-10 mx-auto max-w-[1800px] py-6 pr-6 pb-28 md:pb-6",
          isDesktopApp && !isMobile ? "pl-6" : "pl-6 md:pl-32"
        )}
      >
        <Header
          providerSearch={{
            name: source?.name || "provider",
            query: submitted,
            onSearch: (term) => {
              setPage(1);
              setParams(term ? { q: term } : {});
            },
          }}
          providerControls={
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/custom-providers")}
                aria-label="All providers"
              >
                <ArrowLeft className="size-4" />
              </Button>
              <CustomProviderToolbar source={source} compact />
            </div>
          }
        />

        {/* Extension mount point — top of a custom-source home (scoped by ns/sid). */}
        <ExtensionSlot
          slotId="custom-home-top"
          props={{ namespace, sourceId, kind }}
        />

        <div className="mb-6 mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-black tracking-tight">
              {source?.name || t("discover.customSourceFallback")}
            </h1>
            {source?.description ? (
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                {source.description}
              </p>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {hasFilterUi ? (
              <button
                type="button"
                onClick={() => setShowFilters((v) => !v)}
                className={cn(
                  "inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition active:scale-95",
                  showFilters || hasActiveFilters
                    ? "border-primary/60 bg-primary/20 text-foreground"
                    : "border-white/15 bg-white/5 text-muted-foreground hover:bg-white/10"
                )}
                aria-label={t("migration.toggleFilters")}
              >
                <SlidersHorizontal className="h-4 w-4" />
                {t("migration.filters")}
                {hasActiveFilters ? (
                  <span className="rounded-md bg-primary/40 px-1.5 py-0.5 text-[11px]">
                    {activeTags.length +
                      Object.keys(filters).filter(
                        (k) => k !== "tags" && filters[k]
                      ).length}
                  </span>
                ) : null}
              </button>
            ) : null}
          </div>
        </div>

        {!discovering && !source && (
          <Alert className="mb-6">
            <AlertDescription>
              {discoveryError?.message ||
                "This source is disabled, removed, or unavailable on this device. Enable it in the extension hub."}
            </AlertDescription>
          </Alert>
        )}
        {activeQuery.isError && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>
              {activeQuery.error?.message ||
                "The provider could not load its catalogue."}
              <Button
                variant="outline"
                size="sm"
                onClick={() => void activeQuery.refetch()}
              >
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {!resultsMode && browsePage === 1 && spotlights.length > 0 && (
          <div data-custom-hero>
            <HeroSection
              spotlight={spotlights[0]}
              spotlights={spotlights}
              onActiveSpotlightChange={setActiveSpotlight}
              getDetailsPath={(item) =>
                `${base}/info/${encodeURIComponent(item.id)}`
              }
              hideCatalogActions
              actionLabel="View title"
              mediaType={kind === "read" ? "manga" : "anime"}
            />
          </div>
        )}
        {source && !resultsMode && (
          <div className="mb-10 flex min-w-0 flex-col gap-10">
            <ExtensionContinue
              kind={kind}
              namespace={namespace}
              sourceIds={group?.variants.map((item) => item.id) || [sourceId!]}
            />
            <ExtensionContinue
              kind={kind}
              namespace={namespace}
              sourceIds={group?.variants.map((item) => item.id) || [sourceId!]}
              saved
            />
          </div>
        )}

        {hasFilterUi && showFilters ? (
          <GlassPanel className="mb-8 border border-white/10 p-4">
            {schemaGroups.length > 0 ? (
              <div className="mb-4 flex flex-wrap gap-3">
                {schemaGroups.map((group) => (
                  <label
                    key={group.key}
                    className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground"
                  >
                    {group.label}
                    <ThemedSelect
                      value={
                        typeof filters[group.key] === "string"
                          ? (filters[group.key] as string)
                          : ""
                      }
                      onChange={(e) => setGroup(group.key, e.target.value)}
                      className="min-w-[9rem] rounded-lg border border-white/15 bg-background/80 px-2.5 py-1.5 text-sm font-medium text-foreground outline-none focus:border-primary/60"
                    >
                      <option value="">{t("migration.any")}</option>
                      {group.options.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </ThemedSelect>
                  </label>
                ))}
              </div>
            ) : null}

            {schemaTags.length > 0 ? (
              <div>
                <div className="mb-2 text-xs font-semibold text-muted-foreground">
                  {t("migration.tags")}
                </div>
                <div className="flex flex-wrap gap-2">
                  {(showAllTags ? schemaTags : schemaTags.slice(0, 24)).map(
                    (tag) => {
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
                              : "border-white/15 bg-white/5 text-muted-foreground hover:bg-white/10"
                          )}
                        >
                          {tag}
                        </button>
                      );
                    }
                  )}
                  {schemaTags.length > 24 ? (
                    <button
                      type="button"
                      onClick={() => setShowAllTags((v) => !v)}
                      className="rounded-full border border-dashed border-white/20 px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-white/10"
                    >
                      {showAllTags
                        ? t("comments.showLess")
                        : uiI18n.t("app.i18n_value_0_more_f2150f35", {
                            value0: schemaTags.length - 24,
                          })}
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
                  <X className="h-3.5 w-3.5" /> {t("migration.clearFilters")}
                </button>
              </div>
            ) : null}
          </GlassPanel>
        ) : null}

        {resultsMode ? (
          <section className="mb-10">
            <h3 className="mb-6 px-2 font-display text-xl font-semibold tracking-tight">
              {submitted
                ? uiI18n.t("app.results_for_i18n_value_0_f5bc8a09", {
                    value0: submitted,
                  })
                : t("migration.filteredResults")}
            </h3>
            {searching ? (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
                {Array.from({ length: 12 }).map((_, i) => (
                  <CardSkeleton key={`search-skel-${i}`} />
                ))}
              </div>
            ) : searchQuery.isError ? null : searchCards.length > 0 ? (
              <CardGrid cards={searchCards} />
            ) : (
              <GlassPanel className="border border-white/10 p-6">
                <p className="text-sm text-muted-foreground">
                  {submitted
                    ? uiI18n.t("app.no_results_for_i18n_value_0_4f62353d", {
                        value0: submitted,
                      })
                    : t("migration.noFilteredResults")}
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
        ) : homeQuery.isError ? null : hasSections ? (
          <div className="space-y-10">
            {sections
              .filter((s) => s.cards.length > 0)
              .map((s) => (
                <section key={s.title}>
                  <HomeSectionHeading
                    title={s.title}
                    action={
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setExpanded(
                            expanded === s.title ? undefined : s.title
                          )
                        }
                      >
                        {expanded === s.title ? "Show row" : "View all"}
                      </Button>
                    }
                  />
                  <CardGrid cards={s.cards} rail={expanded !== s.title} />
                </section>
              ))}
          </div>
        ) : (
          <GlassPanel className="border border-white/10 p-8 text-center">
            <h2 className="text-lg font-bold">{t("discover.nothingHere")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Search this provider, try another language, or check its settings.
            </p>
          </GlassPanel>
        )}
        {((resultsMode && (page > 1 || searchData?.hasNextPage)) ||
          (!resultsMode && (browsePage > 1 || home?.hasNextPage))) && (
          <nav
            className="my-8 flex items-center justify-center gap-4"
            aria-label="Provider pages"
          >
            <Button
              variant="outline"
              disabled={
                activeQuery.isFetching || (resultsMode ? page : browsePage) <= 1
              }
              onClick={() =>
                resultsMode
                  ? setPage((value) => value - 1)
                  : setBrowsePage((value) => value - 1)
              }
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground" aria-live="polite">
              Page {resultsMode ? page : browsePage}
            </span>
            <Button
              variant="outline"
              disabled={
                activeQuery.isFetching ||
                !(resultsMode ? searchData?.hasNextPage : home?.hasNextPage)
              }
              onClick={() =>
                resultsMode
                  ? setPage((value) => value + 1)
                  : setBrowsePage((value) => value + 1)
              }
            >
              Next
            </Button>
          </nav>
        )}

        {/* Extension mount point — bottom of a custom-source home. */}
        <ExtensionSlot
          slotId="custom-home-bottom"
          props={{ namespace, sourceId, kind }}
        />
      </main>

      {/* MobileNav hides itself above `md` and on auth/error routes. */}
      <MobileNav />
    </div>
  );
}
