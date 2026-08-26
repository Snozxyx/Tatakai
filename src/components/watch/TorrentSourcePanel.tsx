/**
 * TorrentSourcePanel
 *
 * The torrent half of the source list, split out from the language-grouped
 * stream buttons because the two are chosen on completely different evidence.
 *
 * A stream source is picked by language and provider — a short label is enough.
 * A torrent is picked by *swarm health and file size*: 3 seeders on a 12 GB
 * season pack and 400 seeders on a 1.4 GB single episode are the same button in
 * a flat list, and the user cannot tell them apart until the download has
 * already started. So releases get a table with the numbers visible, sortable
 * on the fields that actually decide the choice, and a filter to hide the dead
 * ones and the season packs.
 *
 * Rendering-only: selecting a row calls `onSelect`, which still goes through the
 * confirmation dialog. Nothing here starts a session.
 */

import { useMemo, useState } from "react";
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  HardDrive,
  Layers,
  Magnet,
  Search,
  Users,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  TORRENT_SORT_OPTIONS,
  formatBytesShort,
  isBatchRelease,
  parseQualityRank,
  parseSizeLabelToBytes,
  seederCountOf,
  seederHealth,
  sortTorrentSources,
  torrentDisplayTitle,
  type SortDirection,
  type TorrentSortKey,
} from "@/lib/watch/torrentSort";

interface TorrentSourcePanelProps {
  /** Every torrent-typed source for this episode, in provider-resolution order. */
  sources: any[];
  /** URL of the source backing the live session, so it can be marked. */
  activeUrl?: string;
  /** Whether the runtime can start a session at all. */
  isDesktop: boolean;
  onSelect: (source: any) => void;
}

const HEALTH_DOT: Record<ReturnType<typeof seederHealth>, string> = {
  strong: "bg-emerald-400",
  ok: "bg-emerald-500/70",
  weak: "bg-amber-400",
  dead: "bg-red-500",
  unknown: "bg-muted-foreground/40",
};

const HEALTH_TEXT: Record<ReturnType<typeof seederHealth>, string> = {
  strong: "text-emerald-400",
  ok: "text-emerald-400/80",
  weak: "text-amber-400",
  dead: "text-red-400",
  unknown: "text-muted-foreground",
};

export function TorrentSourcePanel({
  sources,
  activeUrl,
  isDesktop,
  onSelect,
}: TorrentSourcePanelProps) {
  const [sortKey, setSortKey] = useState<TorrentSortKey>("seeders");
  const [direction, setDirection] = useState<SortDirection>("desc");
  const [query, setQuery] = useState("");
  const [hideDead, setHideDead] = useState(false);
  const [hideBatches, setHideBatches] = useState(false);
  const [minQuality, setMinQuality] = useState<number>(0);

  // Which quality tiers this episode actually has — offering "1080p+" when
  // nothing above 720p was found is a filter that can only return nothing.
  const qualityTiers = useMemo(() => {
    const tiers = new Set<number>();
    for (const source of sources) {
      const rank = parseQualityRank(source?.quality);
      if (rank) tiers.add(rank);
    }
    return Array.from(tiers).sort((a, b) => b - a);
  }, [sources]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sources.filter((source) => {
      if (hideDead && seederCountOf(source) === 0) return false;
      if (hideBatches && isBatchRelease(source)) return false;
      if (minQuality > 0) {
        const rank = parseQualityRank(source?.quality);
        // Unknown quality is kept — dropping it would hide releases that simply
        // do not label themselves, which is most of what some indexers return.
        if (rank != null && rank < minQuality) return false;
      }
      if (!needle) return true;
      const haystack = [
        torrentDisplayTitle(source),
        source?.providerName,
        source?.releaseGroup,
        source?.quality,
        source?.fileFormat,
        source?.episodeRange,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [sources, query, hideDead, hideBatches, minQuality]);

  const sorted = useMemo(
    () => sortTorrentSources(filtered, sortKey, direction),
    [filtered, sortKey, direction],
  );

  const applySort = (key: TorrentSortKey) => {
    if (key === sortKey) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setDirection(TORRENT_SORT_OPTIONS.find((option) => option.key === key)?.defaultDirection ?? "desc");
  };

  const filtersActive = hideDead || hideBatches || minQuality > 0 || query.trim().length > 0;

  if (sources.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.03] p-3">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Magnet className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">
            Torrent releases
          </span>
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">
            {sorted.length === sources.length
              ? `${sources.length}`
              : `${sorted.length} of ${sources.length}`}
          </span>
        </div>

        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter releases, groups, codecs..."
            className="h-8 rounded-lg border-white/10 bg-black/20 pl-7 pr-7 text-xs"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear release filter"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* ── Sort + filter controls ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Sort
        </span>
        {TORRENT_SORT_OPTIONS.map((option) => {
          const active = option.key === sortKey;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => applySort(option.key)}
              className={`flex h-7 items-center gap-1 rounded-lg px-2.5 text-[11px] font-medium transition-all ${
                active
                  ? "bg-foreground text-background"
                  : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
              }`}
              title={active ? "Click again to reverse" : `Sort by ${option.label.toLowerCase()}`}
            >
              {option.label}
              {active &&
                (direction === "desc" ? (
                  <ArrowDownWideNarrow className="h-3 w-3" />
                ) : (
                  <ArrowUpNarrowWide className="h-3 w-3" />
                ))}
            </button>
          );
        })}

        <span className="mx-1 h-4 w-px bg-white/10" />

        <button
          type="button"
          onClick={() => setHideDead((value) => !value)}
          className={`h-7 rounded-lg px-2.5 text-[11px] font-medium transition-all ${
            hideDead
              ? "bg-red-500/20 text-red-300"
              : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
          }`}
          title="Hide releases the indexer reports as having no seeders"
        >
          Hide 0 seeders
        </button>
        <button
          type="button"
          onClick={() => setHideBatches((value) => !value)}
          className={`h-7 rounded-lg px-2.5 text-[11px] font-medium transition-all ${
            hideBatches
              ? "bg-amber-500/20 text-amber-300"
              : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
          }`}
          title="Hide season packs — they download in full even for one episode"
        >
          Hide batches
        </button>

        {qualityTiers.length > 1 && (
          <select
            value={minQuality}
            onChange={(event) => setMinQuality(Number(event.target.value))}
            className="h-7 rounded-lg border border-white/10 bg-black/20 px-2 text-[11px] text-foreground outline-none"
            title="Minimum resolution"
          >
            <option value={0}>Any quality</option>
            {qualityTiers.map((tier) => (
              <option key={tier} value={tier}>
                {tier >= 2160 ? "4K" : `${tier}p`}+
              </option>
            ))}
          </select>
        )}

        {filtersActive && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setHideDead(false);
              setHideBatches(false);
              setMinQuality(0);
            }}
            className="h-7 rounded-lg px-2 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Reset
          </button>
        )}
      </div>

      {/* ── Rows ───────────────────────────────────────────────────────────── */}
      {sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 p-4 text-center text-[11px] text-muted-foreground">
          No releases match these filters.
        </div>
      ) : (
        <div className="flex max-h-[22rem] flex-col gap-1.5 overflow-y-auto pr-1">
          {sorted.map((source, index) => {
            const seeders = seederCountOf(source);
            const health = seederHealth(seeders);
            const bytes = parseSizeLabelToBytes(source?.fileSize);
            const sizeLabel = String(source?.fileSize ?? "").trim() || formatBytesShort(bytes);
            const batch = isBatchRelease(source);
            const isActive = Boolean(activeUrl && source?.url === activeUrl);
            const title = torrentDisplayTitle(source);

            return (
              <button
                key={`${source?.url || source?.magnetLink || "torrent"}-${index}`}
                type="button"
                onClick={() => onSelect(source)}
                disabled={!isDesktop}
                className={`group flex w-full flex-col gap-1 rounded-xl border px-3 py-2 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                  isActive
                    ? "border-emerald-400/60 bg-emerald-500/15"
                    : "border-white/5 bg-white/[0.02] hover:border-emerald-500/30 hover:bg-emerald-500/10"
                }`}
                title={isDesktop ? title : "Torrent playback needs the desktop app"}
              >
                <div className="flex items-start gap-2">
                  <span className={`mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full ${HEALTH_DOT[health]}`} />
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] leading-relaxed text-foreground">
                    {title}
                  </span>
                  {isActive && (
                    <span className="shrink-0 rounded-full bg-emerald-400/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300">
                      Playing
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-3.5 text-[10px] text-muted-foreground">
                  <span className={`flex items-center gap-1 font-medium ${HEALTH_TEXT[health]}`}>
                    <Users className="h-2.5 w-2.5" />
                    {seeders == null ? "n/a" : seeders} seed
                    {typeof source?.leechers === "number" ? ` · ${source.leechers} leech` : ""}
                  </span>
                  {sizeLabel && (
                    <span className="flex items-center gap-1">
                      <HardDrive className="h-2.5 w-2.5" />
                      {sizeLabel}
                    </span>
                  )}
                  {source?.quality && <span className="font-medium text-foreground/70">{source.quality}</span>}
                  {source?.fileFormat && <span className="uppercase">{source.fileFormat}</span>}
                  {source?.providerName && <span className="truncate">{source.providerName}</span>}
                  {batch && (
                    <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-amber-400">
                      <Layers className="h-2.5 w-2.5" />
                      {String(source?.episodeRange ?? "").trim() || "Batch"}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {!isDesktop && (
        <p className="text-[10px] text-amber-400">
          Torrent playback needs the desktop app — these releases cannot be started on this device.
        </p>
      )}
    </div>
  );
}
