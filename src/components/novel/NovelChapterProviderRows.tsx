import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
/**
 * NovelChapterProviderRows.tsx
 *
 * Same two-level chapter layout as the manga info page:
 *   - Non-clickable header row showing chapter number + title
 *   - One sub-row per source (provider + translator label)
 */

import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NovelChapterSource {
  provider: string;
  providerName?: string;
  chapterKey: string;
  providerChapterId: string;
  language?: string | null;
  translator?: string | null;
}

export interface NovelChapterProviderRowsProps {
  chapter: {
    chapterNumber: number | null;
    chapterTitle?: string | null;
    sources: NovelChapterSource[];
  };
  /** The "best" source for the current provider preference — highlighted with ring */
  bestSource: NovelChapterSource | null;
  /** 'auto' means show all providers */
  preferredProvider: string;
  /** Called when the user clicks a readable sub-row */
  onNavigate: (provider: string, chapterKey: string) => void;
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Renders a chapter as a non-clickable header plus one sub-row per source.
 * Returns null when all sub-rows are filtered out by the active provider filter.
 */
export function NovelChapterProviderRows({
  chapter,
  bestSource,
  preferredProvider,
  onNavigate,
  className,
}: NovelChapterProviderRowsProps) {
  useUiTranslation();
  // Build the chapter header label
  const chapterLabel =
    chapter.chapterNumber != null
      ? uiI18n.t('app.chapter_i18n_value_0_e0f6e591', { value0: chapter.chapterNumber })
      : chapter.chapterTitle || uiI18n.t('app.chapter_46b00590');

  // Show title after the label only when it differs
  const titleSuffix =
    chapter.chapterTitle && chapter.chapterTitle !== chapterLabel
      ? ` — ${chapter.chapterTitle}`
      : "";

  const filteredSources = chapter.sources.filter((src) => {
    const providerMatch =
      preferredProvider === "auto" || src.provider === preferredProvider;
    return providerMatch;
  });

  // If all sub-rows are filtered out, hide the whole chapter
  if (filteredSources.length === 0) return null;

  return (
    <div className={cn("rounded-xl border border-white/5 overflow-hidden", className)}>
      {/* Non-clickable header row */}
      <div className="px-4 py-2 bg-white/[0.03] text-sm font-semibold text-foreground select-none">
        {chapterLabel}
        {titleSuffix}
      </div>

      {/* Sub-rows — one per filtered source */}
      {filteredSources.map((src, idx) => {
        const isReadable = Boolean(src.chapterKey);
        const isBest =
          bestSource != null &&
          bestSource.chapterKey === src.chapterKey &&
          bestSource.provider === src.provider;

        const label =
          src.translator && src.translator.trim()
            ? uiI18n.t('app.i18n_value_0_i18n_value_1_638125aa', { value0: src.providerName || src.provider, value1: src.translator })
            : uiI18n.t('app.i18n_value_0_f0862f54', { value0: src.providerName || src.provider });

        return (
          <button
            key={`${src.providerName || src.provider}-${src.chapterKey || "empty"}-${idx}`}
            type="button"
            disabled={!isReadable}
            onClick={
              isReadable ? () => onNavigate(src.provider, src.chapterKey) : undefined
            }
            className={cn(
              // Base
              "w-full flex gap-2 px-4 py-2 text-xs transition-colors text-left",
              "border-t border-white/5",
              // Responsive: full row at md+, compact pill below md
              "md:flex-row md:items-center flex-col items-start",
              // Interactive vs disabled
              isReadable
                ? "hover:bg-white/5 cursor-pointer text-foreground"
                : "cursor-default opacity-40 text-muted-foreground",
              // Best-source highlight
              isBest && "ring-1 ring-primary/40 bg-primary/5",
            )}
          >
            {/* Provider + translator label */}
            <span
              className={cn(
                "flex-1 truncate font-medium",
                // Compact pill below md breakpoint
                "md:py-0 py-0.5 md:px-0 px-2 md:rounded-none rounded-full md:bg-transparent bg-white/5",
              )}
            >
              {label}
            </span>
            {src.language && <span className="text-muted-foreground">{src.language === 'ja' ? uiI18n.t('app.japanese_original_6875faf6') : src.language === 'en' ? uiI18n.t('app.english_649df08a') : src.language}</span>}
          </button>
        );
      })}
    </div>
  );
}
