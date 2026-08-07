/**
 * MangaChapterProviderRows.tsx
 *
 * Renders a two-level chapter layout:
 *   - Non-clickable header row showing chapter number + title
 *   - One sub-row per source (provider + language/scanlator label)
 *
 * Validates: Requirements 2.7.1–2.7.9, 3.7, 3.8
 */

import { cn } from "@/lib/utils";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Normalises a raw language value to a lower-cased, trimmed key (mirrors MangaPage logic) */
const normalizeLanguageKey = (value: string | null | undefined): string => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "unknown";
  if (normalized === "jp" || normalized.startsWith("ja") || normalized.includes("japanese")) return "jp";
  if (normalized === "kr" || normalized.startsWith("ko") || normalized.includes("korean")) return "kr";
  if (normalized === "zh" || normalized.startsWith("zh") || normalized.includes("chinese")) return "zh";
  if (normalized === "en" || normalized.startsWith("en") || normalized.includes("english")) return "en";
  return normalized;
};

/** Returns a human-readable language label from a raw language value */
const formatLanguageLabel = (value: string | null | undefined): string => {
  const key = normalizeLanguageKey(value);
  if (key === "jp") return "Japanese";
  if (key === "kr") return "Korean";
  if (key === "zh") return "Chinese";
  if (key === "en") return "English";
  if (key === "unknown") return "Unknown";
  return key.toUpperCase();
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChapterSource {
  provider: string;
  chapterKey: string;
  providerChapterId: string;
  language?: string | null;
  scanlator?: string | null;
}

export interface MangaChapterProviderRowsProps {
  chapter: {
    chapterNumber: number | null;
    chapterTitle?: string | null;
    sources: ChapterSource[];
  };
  /** The "best" source for the current provider/language preferences — highlighted with ring */
  bestSource: ChapterSource | null;
  /** 'auto' means show all providers */
  preferredProvider: string;
  /** 'auto' means show all languages */
  effectivePreferredLanguage: string;
  /** Called when the user clicks a readable sub-row */
  onNavigate: (provider: string, chapterKey: string) => void;
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Renders a chapter as a non-clickable header plus one sub-row per source.
 * Returns null when all sub-rows are filtered out by the active provider/language filter (Req 2.7.9).
 */
export function MangaChapterProviderRows({
  chapter,
  bestSource,
  preferredProvider,
  effectivePreferredLanguage,
  onNavigate,
  className,
}: MangaChapterProviderRowsProps) {
  // Build the chapter header label
  const chapterLabel =
    chapter.chapterNumber != null
      ? `Chapter ${chapter.chapterNumber}`
      : chapter.chapterTitle || "Chapter";

  // Show title after the label only when it differs (Req 2.7.1 — header shows number + title)
  const titleSuffix =
    chapter.chapterTitle && chapter.chapterTitle !== chapterLabel
      ? ` — ${chapter.chapterTitle}`
      : "";

  // Req 2.7.9 — filter sources by active provider/language preferences
  const filteredSources = chapter.sources.filter((src) => {
    const providerMatch =
      preferredProvider === "auto" || src.provider === preferredProvider;
    const langMatch =
      effectivePreferredLanguage === "auto" ||
      normalizeLanguageKey(src.language) === effectivePreferredLanguage;
    return providerMatch && langMatch;
  });

  // If all sub-rows are filtered out, hide the whole chapter (Req 2.7.9)
  if (filteredSources.length === 0) return null;

  return (
    <div className={cn("rounded-xl border border-white/5 overflow-hidden", className)}>
      {/* Non-clickable header row (Req 2.7.1) */}
      <div className="px-4 py-2 bg-white/[0.03] text-sm font-semibold text-foreground select-none">
        {chapterLabel}
        {titleSuffix}
      </div>

      {/* Sub-rows — one per filtered source (Req 2.7.1, 2.7.2) */}
      {filteredSources.map((src, idx) => {
        const isReadable = Boolean(src.chapterKey); // Req 2.7.6
        const isBest =
          bestSource != null &&
          bestSource.chapterKey === src.chapterKey &&
          bestSource.provider === src.provider; // Req 2.7.7

        const langLabel = formatLanguageLabel(src.language);

        // Req 2.7.3 / 2.7.4 — label format
        const label =
          src.scanlator && src.scanlator.trim()
            ? `${src.provider} • ${src.scanlator} (${langLabel})`
            : `${src.provider} (${langLabel})`;

        return (
          <button
            key={`${src.provider}-${src.chapterKey || "empty"}-${idx}`}
            type="button"
            disabled={!isReadable} // Req 2.7.6
            onClick={
              isReadable ? () => onNavigate(src.provider, src.chapterKey) : undefined
            } // Req 2.7.5
            className={cn(
              // Base
              "w-full flex gap-2 px-4 py-2 text-xs transition-colors text-left",
              "border-t border-white/5",
              // Responsive: full row at md+, compact pill below md (Req 2.7.8)
              "md:flex-row md:items-center flex-col items-start",
              // Interactive vs disabled (Req 2.7.6)
              isReadable
                ? "hover:bg-white/5 cursor-pointer text-foreground"
                : "cursor-default opacity-40 text-muted-foreground",
              // Best-source highlight (Req 2.7.7)
              isBest && "ring-1 ring-primary/40 bg-primary/5",
            )}
          >
            {/* Provider + scanlator + language label */}
            <span
              className={cn(
                "flex-1 truncate font-medium",
                // Compact pill below md breakpoint (Req 2.7.8)
                "md:py-0 py-0.5 md:px-0 px-2 md:rounded-none rounded-full md:bg-transparent bg-white/5",
              )}
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
