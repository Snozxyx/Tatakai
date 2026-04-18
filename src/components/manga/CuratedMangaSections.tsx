import { useMemo } from "react";
import { BookMarked } from "lucide-react";
import { UnifiedMediaCard, type UnifiedMediaCardProps } from "@/components/UnifiedMediaCard";
import { useContentSafetySettings } from "@/hooks/useContentSafetySettings";
import { useCuratedHomeSections } from "@/hooks/useCuratedHomeSections";
import { getProxiedImageUrl } from "@/lib/api";
import { type CuratedHomeSection, type CuratedManualItem } from "@/services/curation.service";

type SectionMetadata = {
  customImage: string;
  manualItems: CuratedManualItem[];
};

function toSafeNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readSectionMetadata(section: CuratedHomeSection): SectionMetadata {
  const metadata =
    section.metadata && typeof section.metadata === "object" && !Array.isArray(section.metadata)
      ? (section.metadata as Record<string, unknown>)
      : {};

  const manualItems = Array.isArray(metadata.manualItems)
    ? (metadata.manualItems as CuratedManualItem[])
    : [];

  return {
    customImage: String(metadata.customImage || "").trim(),
    manualItems,
  };
}

function normalizeHref(item: CuratedManualItem): string | undefined {
  const link = String(item.link || "").trim();
  if (!link) return undefined;

  if (link.startsWith("/")) return link;
  if (/^https?:\/\//i.test(link)) return undefined;

  return `/${link.replace(/^\/+/, "")}`;
}

function toManualCard(item: CuratedManualItem): UnifiedMediaCardProps["item"] | null {
  const title = String(item.title || "").trim();
  const routeId = String(item.routeId || item.id || "").trim();
  if (!title || !routeId) return null;

  const mediaType = item.mediaType === "anime" ? "anime" : "manga";
  const poster = String(item.cover || item.poster || item.image || "").trim() || "/placeholder.svg";

  return {
    id: routeId,
    name: title,
    poster,
    mediaType,
    type: mediaType,
    anilistId: toSafeNumber(item.anilistId),
    malId: toSafeNumber(item.malId),
    href: normalizeHref(item),
    isAdult: false,
  };
}

function dedupeCards(items: UnifiedMediaCardProps["item"][]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.mediaType}:${String(item.anilistId ?? item.malId ?? item.id)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function CuratedMangaSections() {
  const { settings: contentSafetySettings } = useContentSafetySettings();
  const { data: sections = [], isLoading } = useCuratedHomeSections("manga");
  const canShowAdultEverywhere = contentSafetySettings.showAdultEverywhere;

  const renderedSections = useMemo(() => {
    return sections
      .map((section) => {
        const metadata = readSectionMetadata(section);

        const cards = dedupeCards(
          metadata.manualItems
            .map(toManualCard)
            .filter(Boolean)
            .filter((item) => canShowAdultEverywhere || !item?.isAdult) as UnifiedMediaCardProps["item"][],
        ).slice(0, Math.max(1, Math.min(24, Number(section.max_items || 12))));

        return {
          section,
          metadata,
          cards,
        };
      })
      .filter((entry) => entry.cards.length > 0);
  }, [sections, canShowAdultEverywhere]);

  if (!isLoading && renderedSections.length === 0) return null;

  return (
    <div className="space-y-16 my-16">
      {renderedSections.map(({ section, metadata, cards }) => (
        <section key={section.id}>
          <div className="mb-6 px-2 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              {metadata.customImage ? (
                <div className="h-16 w-12 overflow-hidden rounded-lg border border-white/10 bg-black/40">
                  <img
                    src={getProxiedImageUrl(metadata.customImage)}
                    alt={`${section.title} custom`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                  />
                </div>
              ) : (
                <div className="h-12 w-12 shrink-0 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center">
                  <BookMarked className="w-5 h-5 text-primary" />
                </div>
              )}

              <div>
                <h3 className="font-display text-2xl font-semibold tracking-tight">{section.title}</h3>
                {section.description ? (
                  <p className="text-sm text-muted-foreground mt-1">{section.description}</p>
                ) : null}
              </div>
            </div>

            <span className="text-[10px] uppercase tracking-wider text-muted-foreground rounded-full border border-white/10 px-2 py-1">
              Curated
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {cards.map((item) => (
              <UnifiedMediaCard key={`${section.id}-${item.mediaType}-${item.id}`} item={item} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
