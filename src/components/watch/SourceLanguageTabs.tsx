/**
 * SourceLanguageTabs
 *
 * Renders language-filter tabs above the Watch page source list.
 * Returns null when fewer than 2 distinct language values exist (req 2.6.3).
 *
 * Validates: Requirements 2.6.1, 2.6.2, 2.6.3
 */

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  normalizeWatchLanguageKey,
  formatWatchLanguageLabel,
} from "@/lib/languageUtils";

interface Source {
  language?: string | null;
  audioLanguage?: string | null;
}

interface SourceLanguageTabsProps {
  sources: Source[];
  /** "all" or a normalized language key produced by normalizeWatchLanguageKey */
  activeLanguage: string;
  onLanguageChange: (key: string) => void;
}

export function SourceLanguageTabs({
  sources,
  activeLanguage,
  onLanguageChange,
}: SourceLanguageTabsProps) {
  // Derive distinct language tabs from the source list
  const languageTabs = useMemo(() => {
    const seen = new Map<string, string>();
    for (const src of sources) {
      const raw = src.language || src.audioLanguage;
      if (!raw) continue;
      const key = normalizeWatchLanguageKey(raw);
      if (key && !seen.has(key)) {
        seen.set(key, formatWatchLanguageLabel(raw));
      }
    }
    return Array.from(seen.entries()).map(([value, label]) => ({ value, label }));
  }, [sources]);

  // Req 2.6.3 — render nothing when 0 or 1 distinct language
  if (languageTabs.length < 2) return null;

  return (
    <div className="flex gap-1 flex-wrap mb-2">
      {/* "All" tab */}
      <button
        onClick={() => onLanguageChange("all")}
        className={cn(
          "px-3 py-1 rounded-full text-xs font-semibold transition-colors",
          activeLanguage === "all"
            ? "bg-primary text-primary-foreground"
            : "bg-white/5 text-muted-foreground hover:bg-white/10",
        )}
      >
        All
      </button>

      {/* One tab per distinct language */}
      {languageTabs.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => onLanguageChange(value)}
          className={cn(
            "px-3 py-1 rounded-full text-xs font-semibold transition-colors",
            activeLanguage === value
              ? "bg-primary text-primary-foreground"
              : "bg-white/5 text-muted-foreground hover:bg-white/10",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
