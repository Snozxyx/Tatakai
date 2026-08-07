/**
 * SourceTypeBadge
 *
 * Renders a small classification chip next to a source label in the Watch page
 * source list. Priority: HLS > Embed > Torrent. Returns null if none apply.
 *
 * Validates: Requirements 2.6.4–2.6.7, 3.6
 */

interface SourceTypeBadgeProps {
  isM3U8?: boolean;
  isEmbed?: boolean;
  /** "hls" | "torrent" | undefined — from the source object's sourceType field */
  sourceType?: string;
}

export function SourceTypeBadge({ isM3U8, isEmbed, sourceType }: SourceTypeBadgeProps) {
  // Priority 1 — HLS (req 2.6.4)
  if (isM3U8 || sourceType === "hls") {
    return (
      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-zinc-800 text-zinc-400">
        HLS
      </span>
    );
  }

  // Priority 2 — Embed (req 2.6.5)
  if (isEmbed) {
    return (
      <span
        className="px-1.5 py-0.5 rounded text-[10px] font-bold"
        style={{
          background: "color-mix(in srgb, var(--accent) 20%, transparent)",
          color: "var(--accent)",
        }}
      >
        Embed
      </span>
    );
  }

  // Priority 3 — Torrent (req 2.6.6)
  if (sourceType === "torrent") {
    return (
      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-900/30 text-green-400">
        Torrent
      </span>
    );
  }

  return null;
}
