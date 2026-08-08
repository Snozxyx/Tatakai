/**
 * SourcePanel.tsx
 * Renders playback sources grouped by dub language.
 * Each group has a section header and a list of source cards.
 * SourceTypeBadge is added in task 7.3.
 * SourceHoverTooltip (Radix UI Tooltip, 200ms delay, lazy torrent:peers) is added in task 7.4.
 */

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SourceType = "hls" | "embed" | "torrent";

export interface CategorizedSource {
  type: SourceType;
  url: string;
  quality: string;
  /** Human-readable language name, e.g. "English", "Japanese" */
  dubLanguage: string;
  /** BCP-47 language code, e.g. "en", "ja", "pt" */
  dubLanguageCode: string;
  /** Provider / release group display name, e.g. "SubsPlease" */
  sourceName: string;
  /** Release group for torrent sources */
  groupName?: string;
  /** Torrent seeders (torrent sources only) */
  seeders?: number | null;
  /** Torrent leechers (torrent sources only) */
  leechers?: number | null;
  /** Active torrent session ID (torrent sources only, used for lazy peer fetch) */
  sessionId?: string;
  providerKey: string;
  providerName: string;
  isEmbed: boolean;
  isM3U8: boolean;
  headers?: Record<string, string>;
}

export interface DubLanguageGroup {
  /** Human-readable language name shown as the section header */
  language: string;
  /** BCP-47 code used for sorting; "unknown" for sources with no code */
  languageCode: string;
  sources: CategorizedSource[];
}

export interface SourceTooltipData {
  dubLanguage: string;
  sourceType: SourceType;
  quality: string;
  groupName?: string;
  seeders?: number | null;
  leechers?: number | null;
  providerName: string;
}

export interface SourcePanelProps {
  sources: CategorizedSource[];
  selectedSourceKey: string | null;
  onSelectSource: (source: CategorizedSource) => void;
}

// ---------------------------------------------------------------------------
// Grouping logic
// ---------------------------------------------------------------------------

/**
 * Priority map for language codes.
 * Japanese first (0), English second (1), others alphabetically (99),
 * unknown always last (100).
 */
const LANGUAGE_PRIORITY: Record<string, number> = {
  ja: 0,
  en: 1,
};

const UNKNOWN_CODE = "unknown";
const UNKNOWN_LABEL = "Unknown";

/**
 * Groups an array of CategorizedSource objects by dubLanguageCode.
 *
 * Ordering:
 *  1. Japanese (ja)
 *  2. English (en)
 *  3. All other identified languages, sorted alphabetically by language name
 *  4. Unknown (sources with no dubLanguageCode) — always last
 *
 * Guarantees: the total source count across all returned groups equals
 * sources.length (no sources are lost or duplicated).
 */
export function groupSourcesByDubLanguage(
  sources: CategorizedSource[]
): DubLanguageGroup[] {
  const groups = new Map<string, CategorizedSource[]>();

  for (const source of sources) {
    const key = source.dubLanguageCode || UNKNOWN_CODE;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(source);
  }

  return [...groups.entries()]
    .map(([code, srcs]) => ({
      language: code === UNKNOWN_CODE ? UNKNOWN_LABEL : (srcs[0].dubLanguage || UNKNOWN_LABEL),
      languageCode: code,
      sources: srcs,
    }))
    .sort((a, b) => {
      const pa = a.languageCode === UNKNOWN_CODE
        ? 100
        : (LANGUAGE_PRIORITY[a.languageCode] ?? 99);
      const pb = b.languageCode === UNKNOWN_CODE
        ? 100
        : (LANGUAGE_PRIORITY[b.languageCode] ?? 99);

      if (pa !== pb) return pa - pb;
      // Same priority bucket → sort alphabetically by language name
      return a.language.localeCompare(b.language);
    });
}

// ---------------------------------------------------------------------------
// Helper: derive a stable key for a source card
// ---------------------------------------------------------------------------

function sourceKey(source: CategorizedSource): string {
  return `${source.providerKey}::${source.type}::${source.url}`;
}

// ---------------------------------------------------------------------------
// SourcePanel component
// ---------------------------------------------------------------------------

/**
 * Renders all available playback sources grouped by dub language.
 * Each DubLanguageGroup is shown with a labelled section header followed
 * by a row of source cards.
 *
 * SourceTypeBadge visual styles are added in task 7.3.
 * SourceHoverTooltip (Radix UI, 200ms delay) is added in task 7.4.
 */
export function SourcePanel({
  sources,
  selectedSourceKey,
  onSelectSource,
}: SourcePanelProps) {
  const groups = groupSourcesByDubLanguage(sources);

  if (groups.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-2">
        No sources available.
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        {groups.map((group) => (
          <DubLanguageGroupSection
            key={group.languageCode}
            group={group}
            selectedSourceKey={selectedSourceKey}
            onSelectSource={onSelectSource}
          />
        ))}
      </div>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// DubLanguageGroupSection
// ---------------------------------------------------------------------------

interface DubLanguageGroupSectionProps {
  group: DubLanguageGroup;
  selectedSourceKey: string | null;
  onSelectSource: (source: CategorizedSource) => void;
}

function DubLanguageGroupSection({
  group,
  selectedSourceKey,
  onSelectSource,
}: DubLanguageGroupSectionProps) {
  return (
    <div className="space-y-2">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {group.language}
        </span>
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-muted-foreground">
          {group.sources.length} {group.sources.length === 1 ? "source" : "sources"}
        </span>
      </div>

      {/* Source cards */}
      <div className="flex flex-wrap gap-2">
        {group.sources.map((source) => {
          const key = sourceKey(source);
          const isSelected = selectedSourceKey === key;

          return (
            <SourceCardWithTooltip
              key={key}
              source={source}
              isSelected={isSelected}
              onSelect={() => onSelectSource(source)}
            />
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SOURCE_TYPE_STYLES — per-type background, text, and badge label
// ---------------------------------------------------------------------------

const SOURCE_TYPE_STYLES: Record<
  SourceType,
  { bg: string; text: string; label: string }
> = {
  hls: {
    bg: "bg-muted/60",
    text: "text-muted-foreground",
    label: "HLS",
  },
  embed: {
    bg: "bg-primary/20",
    text: "text-primary",
    label: "Embed",
  },
  torrent: {
    bg: "bg-green-500/20",
    text: "text-green-400",
    label: "Torrent",
  },
};

// ---------------------------------------------------------------------------
// SourceTypeBadge
// ---------------------------------------------------------------------------

interface SourceTypeBadgeProps {
  type: SourceType;
}

function SourceTypeBadge({ type }: SourceTypeBadgeProps) {
  const styles = SOURCE_TYPE_STYLES[type];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1 py-0.5 text-[10px] font-semibold leading-none",
        styles.bg,
        styles.text
      )}
    >
      {styles.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// SourceHoverTooltip
// ---------------------------------------------------------------------------

interface SourceHoverTooltipProps {
  source: CategorizedSource;
  children: React.ReactNode;
}

/**
 * Wraps a source card trigger with a Radix UI Tooltip.
 * - 200ms open delay is set on the parent <TooltipProvider> in <SourcePanel>.
 * - For torrent sources, lazily fetches seeders/leechers via `torrent:peers`
 *   IPC on first hover if the data is not already present on the source object.
 * - Dismisses immediately on mouse-leave (Radix default behaviour).
 */
function SourceHoverTooltip({ source, children }: SourceHoverTooltipProps) {
  // Lazy peer data state — only used for torrent sources
  const [peerData, setPeerData] = useState<{ seeders: number | null; leechers: number | null } | null>(null);
  const [peerFetched, setPeerFetched] = useState(false);

  const handleOpenChange = useCallback(
    async (open: boolean) => {
      if (!open) return;
      if (source.type !== "torrent") return;

      // If seeders/leechers are already on the source object, no need to fetch
      if (source.seeders != null && source.leechers != null) return;

      // Only fetch once per tooltip mount
      if (peerFetched) return;
      setPeerFetched(true);

      const sessionId = source.sessionId;
      if (!sessionId) return;

      try {
        const runtime = (window as Window & typeof globalThis).tatakaiRuntime;
        if (!runtime) return;
        const result = await runtime.getTorrentPeers?.(sessionId);
        if (result && typeof result === "object") {
          const r = result as { seeders?: number | null; leechers?: number | null };
          setPeerData({
            seeders: r.seeders ?? null,
            leechers: r.leechers ?? null,
          });
        }
      } catch {
        // Silently ignore — peer data is best-effort
      }
    },
    [source, peerFetched]
  );

  // Resolve the effective seeders/leechers to display
  const effectiveSeeders = source.seeders ?? peerData?.seeders;
  const effectiveLeechers = source.leechers ?? peerData?.leechers;
  const isTorrent = source.type === "torrent";
  const peersPending = isTorrent && effectiveSeeders == null && effectiveLeechers == null;

  return (
    <Tooltip onOpenChange={handleOpenChange}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side="top"
        className="max-w-[220px] bg-background/95 backdrop-blur-xl border-white/10 shadow-2xl"
      >
        <div className="space-y-1 p-0.5 text-xs">
          {/* Language */}
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Language</span>
            <span className="font-medium">{source.dubLanguage || "Unknown"}</span>
          </div>

          {/* Source type */}
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Type</span>
            <SourceTypeBadge type={source.type} />
          </div>

          {/* Quality */}
          {source.quality && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Quality</span>
              <span className="font-medium">{source.quality}</span>
            </div>
          )}

          {/* Provider */}
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Provider</span>
            <span className="font-medium truncate max-w-[120px]">{source.providerName}</span>
          </div>

          {/* Group name (torrent release group) */}
          {source.groupName && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Group</span>
              <span className="font-medium truncate max-w-[120px]">{source.groupName}</span>
            </div>
          )}

          {/* Torrent peer counts */}
          {isTorrent && (
            <>
              <div className="my-1 h-px bg-border" />
              {peersPending ? (
                <div className="text-muted-foreground italic">Fetching peers…</div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Seeders</span>
                    <span className="font-medium text-green-400">
                      {effectiveSeeders != null ? effectiveSeeders : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Leechers</span>
                    <span className="font-medium text-yellow-400">
                      {effectiveLeechers != null ? effectiveLeechers : "—"}
                    </span>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// SourceCardWithTooltip — combines SourceCard + SourceHoverTooltip
// ---------------------------------------------------------------------------

interface SourceCardWithTooltipProps {
  source: CategorizedSource;
  isSelected: boolean;
  onSelect: () => void;
}

function SourceCardWithTooltip({ source, isSelected, onSelect }: SourceCardWithTooltipProps) {
  return (
    <SourceHoverTooltip source={source}>
      <SourceCard source={source} isSelected={isSelected} onSelect={onSelect} />
    </SourceHoverTooltip>
  );
}

// ---------------------------------------------------------------------------
// SourceCard
// ---------------------------------------------------------------------------

interface SourceCardProps {
  source: CategorizedSource;
  isSelected: boolean;
  onSelect: () => void;
}

function SourceCard({ source, isSelected, onSelect }: SourceCardProps) {
  const typeStyles = SOURCE_TYPE_STYLES[source.type];

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "px-3 py-2 rounded-lg text-sm font-medium transition-all",
        "flex flex-col items-start gap-0.5 min-w-[80px]",
        isSelected
          ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-1 ring-offset-background"
          : cn(typeStyles.bg, typeStyles.text, "hover:brightness-110")
      )}
      aria-pressed={isSelected}
      title={`${source.providerName} — ${source.quality} (${source.type.toUpperCase()})`}
    >
      <span className="truncate max-w-[120px]">{source.sourceName || source.providerName}</span>
      {source.quality && (
        <span
          className={cn(
            "text-xs",
            isSelected ? "text-primary-foreground/70" : "opacity-70"
          )}
        >
          {source.quality}
        </span>
      )}
      <SourceTypeBadge type={source.type} />
    </button>
  );
}
