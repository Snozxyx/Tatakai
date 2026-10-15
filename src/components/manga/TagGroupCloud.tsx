import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { memo } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TagCloudItem {
  id: string | number;
  name: string;
  description?: string | null;
  category?: string | null;
  isGeneralSpoiler?: boolean | null;
  isAdult?: boolean | null;
}

export interface TagCloudGroup {
  category: string;
  tags: TagCloudItem[];
}

/**
 * Group tags by their taxonomy category so each chip carries context
 * (a "Military" tag under Cast means something different than under Setting).
 *
 * Shared by the manga discover Tags panel and both Search tag sections, so
 * all three render identically: sticky category headers with counts and a
 * per-group selected tally, refined chips with spoiler/adult markers.
 */
export const TagGroupCloud = memo(function TagGroupCloud({
  groups,
  selected,
  onToggle,
  maxHeightClass = "max-h-48",
  emptyText = uiI18n.t('app.no_tags_match_that_search_b5b4f8be'),
  compact = false,
}: {
  groups: TagCloudGroup[];
  selected: string[];
  onToggle: (name: string) => void;
  maxHeightClass?: string;
  emptyText?: string;
  compact?: boolean;
}) {
  useUiTranslation();
  const selectedSet = new Set(selected);
  const totalSelected = selected.length;

  if (groups.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyText}</p>;
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-3 overflow-y-auto pr-1 scrollbar-thin",
        maxHeightClass,
      )}
    >
      {groups.map((group) => {
        const picked = group.tags.filter((tag) => selectedSet.has(tag.name)).length;
        return (
          <section key={group.category} aria-label={group.category}>
            <header className="sticky top-0 z-10 -mx-0.5 flex items-center gap-2 bg-background/95 py-1 backdrop-blur-sm">
              <span className="h-1 w-1 shrink-0 rounded-full bg-primary/70" aria-hidden />
              <h4 className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                {group.category}
              </h4>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-px text-[9px] font-bold tabular-nums text-muted-foreground">
                {group.tags.length}
              </span>
              {picked > 0 && (
                <span className="rounded-full bg-primary/15 px-1.5 py-px text-[9px] font-black text-primary">
                  {picked} {uiI18n.t('app.picked_17a53b0a')}
                </span>
              )}
              <span className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" aria-hidden />
            </header>
            <div className={cn("flex flex-wrap", compact ? "gap-1" : "gap-1.5", "pt-1.5")}>
              {group.tags.map((tag) => {
                const active = selectedSet.has(tag.name);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    title={tag.description || tag.category || tag.name}
                    onClick={() => onToggle(tag.name)}
                    aria-pressed={active}
                    className={cn(
                      "inline-flex min-h-[30px] items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-all active:scale-95",
                      active
                        ? "border-primary/60 bg-primary/15 text-primary shadow-[0_0_12px_-4px_hsl(var(--primary)/0.5)]"
                        : "border-white/10 bg-white/[0.02] text-muted-foreground hover:border-primary/30 hover:bg-white/[0.05] hover:text-foreground",
                    )}
                  >
                    {active && <Check className="h-3 w-3 shrink-0" />}
                    {tag.name}
                    {tag.isGeneralSpoiler ? (
                      <span className="text-amber-400" title={uiI18n.t('app.spoiler_tag_3398991a')}>
                        !
                      </span>
                    ) : null}
                    {tag.isAdult ? (
                      <span className="text-[9px] font-black uppercase text-rose-400" title={uiI18n.t('app.adult_tag_54ad227a')}>
                        18+
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
      {totalSelected > 0 && (
        <p className="sr-only">{totalSelected} {uiI18n.t('app.tags_selected_226e2987')}</p>
      )}
    </div>
  );
});
