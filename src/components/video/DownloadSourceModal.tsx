/**
 * DownloadSourceModal.tsx
 * Lets the user pick one HLS or torrent source before enqueuing a download.
 * Shows SourceTypeBadge and quality info for each option.
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Download, Loader2 } from "lucide-react";
import {
  type CategorizedSource,
  groupSourcesByDubLanguage,
} from "./SourcePanel";

// ---------------------------------------------------------------------------
// SourceTypeBadge (local copy — exported from SourcePanel but not re-exported
// to keep the import surface clean; we duplicate the minimal badge here)
// ---------------------------------------------------------------------------

const SOURCE_TYPE_STYLES: Record<
  CategorizedSource["type"],
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

function SourceTypeBadge({ type }: { type: CategorizedSource["type"] }) {
  const styles = SOURCE_TYPE_STYLES[type];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none",
        styles.bg,
        styles.text
      )}
    >
      {styles.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Stable key for a source
// ---------------------------------------------------------------------------

function sourceKey(source: CategorizedSource): string {
  return `${source.providerKey}::${source.type}::${source.url}`;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DownloadSourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  sources: CategorizedSource[];
  episodeId: string;
  animeName: string;
  episodeNumber: number;
}

// ---------------------------------------------------------------------------
// DownloadSourceModal
// ---------------------------------------------------------------------------

export function DownloadSourceModal({
  isOpen,
  onClose,
  sources,
  episodeId,
  animeName,
  episodeNumber,
}: DownloadSourceModalProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [isEnqueuing, setIsEnqueuing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only show HLS and torrent sources — embeds cannot be downloaded
  const downloadableSources = sources.filter(
    (s) => s.type === "hls" || s.type === "torrent"
  );

  const groups = groupSourcesByDubLanguage(downloadableSources);

  const selectedSource = downloadableSources.find(
    (s) => sourceKey(s) === selectedKey
  ) ?? null;

  const handleConfirm = async () => {
    if (!selectedSource) return;

    const bridge = window.electron;
    if (!bridge?.startDownload) {
      setError("Download is only available in the desktop app.");
      return;
    }

    setIsEnqueuing(true);
    setError(null);

    try {
      const payload: Record<string, unknown> = {
        episodeId,
        animeName,
        episodeNumber,
        sourceType: selectedSource.type,
        headers: selectedSource.headers ?? {},
      };

      if (selectedSource.type === "torrent") {
        // Torrent sources carry a magnet URI in the url field
        payload.magnet = selectedSource.url;
      } else {
        payload.url = selectedSource.url;
      }

      const res = await bridge.startDownload(payload);

      if (res?.success === false) {
        setError(res.error ?? "Failed to start download.");
        return;
      }

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setIsEnqueuing(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setSelectedKey(null);
      setError(null);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[80vh] overflow-hidden flex flex-col bg-background/95 backdrop-blur-xl border-white/10 shadow-2xl p-0">
        <DialogHeader className="p-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Download className="w-4 h-4 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold leading-tight">
                Download Episode {episodeNumber}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5 truncate max-w-[340px]">
                {animeName} — choose a source to download
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Source list */}
        <div className="flex-1 overflow-y-auto px-6 pb-2 space-y-4 custom-scrollbar">
          {downloadableSources.length === 0 ? (
            <div className="py-10 text-center border border-dashed border-white/5 rounded-2xl bg-white/5">
              <p className="text-sm text-muted-foreground">
                No downloadable sources available.
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Only HLS and torrent sources can be downloaded.
              </p>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.languageCode} className="space-y-2">
                {/* Language section header */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.language}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                {/* Source rows */}
                <div className="space-y-1.5">
                  {group.sources.map((source) => {
                    const key = sourceKey(source);
                    const isSelected = selectedKey === key;
                    const typeStyles = SOURCE_TYPE_STYLES[source.type];

                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSelectedKey(key)}
                        aria-pressed={isSelected}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all",
                          "border",
                          isSelected
                            ? "bg-primary/10 border-primary/40 ring-1 ring-primary/30"
                            : cn(
                                "border-white/5 hover:border-white/10",
                                typeStyles.bg,
                                "hover:brightness-110"
                              )
                        )}
                      >
                        {/* Selection indicator */}
                        <div
                          className={cn(
                            "w-4 h-4 rounded-full border-2 flex-shrink-0 transition-colors",
                            isSelected
                              ? "border-primary bg-primary"
                              : "border-muted-foreground/40"
                          )}
                        >
                          {isSelected && (
                            <div className="w-full h-full rounded-full bg-primary-foreground scale-[0.4]" />
                          )}
                        </div>

                        {/* Source info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={cn(
                                "text-sm font-medium truncate",
                                isSelected
                                  ? "text-primary"
                                  : typeStyles.text
                              )}
                            >
                              {source.sourceName || source.providerName}
                            </span>
                            <SourceTypeBadge type={source.type} />
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {source.quality && (
                              <span className="text-xs text-muted-foreground">
                                {source.quality}
                              </span>
                            )}
                            {source.type === "torrent" &&
                              source.seeders != null && (
                                <span className="text-xs text-muted-foreground">
                                  {source.seeders}S / {source.leechers ?? 0}L
                                </span>
                              )}
                            {source.groupName && (
                              <span className="text-xs text-muted-foreground/60 truncate">
                                {source.groupName}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Error message */}
        {error && (
          <div className="mx-6 mb-2 px-4 py-2.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium">
            {error}
          </div>
        )}

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-white/5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleOpenChange(false)}
            disabled={isEnqueuing}
            className="text-muted-foreground hover:text-foreground"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!selectedSource || isEnqueuing}
            onClick={handleConfirm}
            className="gap-1.5"
          >
            {isEnqueuing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Enqueuing…
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                Download
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
