import { useContentSafetySettings } from "@/hooks/user/useContentSafetySettings";
import { useTVCatalogue } from "@/core/tv/catalogue";
import { TVContentCard, type TVCard } from "./TVContentCard";
import { TVLoadMore } from "./TVLoadMore";
export function TVDiscoveryGrid({ onFocus }: { onFocus?(item: TVCard): void }) {
  const { settings } = useContentSafetySettings();
  const result = useTVCatalogue('', undefined, settings.showAdultEverywhere);
  const items = [
    ...new Map(
      (result.data?.pages.flatMap((page) => page.animes) || []).map((item) => [
        item.id,
        item,
      ])
    ).values(),
  ];
  return (
    <section className="tv-discovery-grid">
      <h2>Keep exploring</h2>
      <div className="tv-search-results">
        {items.map((item) => (
          <TVContentCard key={item.id} item={item} onFocus={onFocus} />
        ))}
      </div>
      {result.isLoading && <p role="status">Finding more stories…</p>}
      {result.error && (
        <button onClick={() => void result.refetch()}>Retry discovery</button>
      )}
      <TVLoadMore
        hasMore={result.hasNextPage && !result.error}
        busy={result.isFetchingNextPage}
        load={() => result.fetchNextPage()}
      />
    </section>
  );
}
