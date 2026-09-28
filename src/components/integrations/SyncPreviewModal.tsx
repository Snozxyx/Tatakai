/**
 * src/components/integrations/SyncPreviewModal.tsx
 *
 * Right-side sheet (AvatarPickerSheet visual language) that shows the sync diff
 * — import/export/conflict items across anime AND manga — and lets the user pick
 * which to apply. Sync is always previewed first, never applied silently.
 */

import { useState, useMemo } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, ArrowDown, ArrowUp, ArrowLeftRight, CheckCircle2, Check, Info, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SyncProposalItem, Integration, MediaType } from '@/hooks/user/useIntegrationSync';

interface SyncPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (selectedItems: SyncProposalItem[]) => Promise<void>;
  items: SyncProposalItem[];
  integration: Integration;
  /** Omit for the unified (anime + manga) sync; per-row type badges are shown. */
  mediaType?: MediaType;
  isLoading?: boolean;
  isApplying?: boolean;
}

const INTEGRATION_META = {
  mal: { label: 'MyAnimeList', color: '#2E51A2', short: 'MAL' },
  anilist: { label: 'AniList', color: '#02A9FF', short: 'AL' },
};

function DirectionBadge({ direction }: { direction: SyncProposalItem['direction'] }) {
  if (direction === 'import') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/20">
        <ArrowDown className="w-3 h-3" />
        Import
      </span>
    );
  }
  if (direction === 'export') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
        <ArrowUp className="w-3 h-3" />
        Export
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/20">
      <ArrowLeftRight className="w-3 h-3" />
      Conflict
    </span>
  );
}

function StatusPill({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/10 text-muted-foreground capitalize">
      {label}: {value.replace(/_/g, ' ')}
    </span>
  );
}

export function SyncPreviewModal({
  isOpen,
  onClose,
  onApply,
  items,
  integration,
  mediaType,
  isLoading = false,
  isApplying = false,
}: SyncPreviewModalProps) {
  const meta = INTEGRATION_META[integration];
  const reduceMotion = useReducedMotion();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(items.map(i => i.id)));

  // Re-sync selection whenever a new preview loads.
  useMemo(() => {
    setSelectedIds(new Set(items.map(i => i.id)));
  }, [items]);

  const toggleItem = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === items.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(items.map(i => i.id)));
  };

  const selectedItems = items.filter(i => selectedIds.has(i.id));
  const importCount = items.filter(i => i.direction === 'import').length;
  const exportCount = items.filter(i => i.direction === 'export').length;
  const conflictCount = items.filter(i => i.direction === 'conflict').length;

  const handleApply = async () => {
    if (selectedItems.length === 0) return;
    await onApply(selectedItems);
  };

  const selectAnim = reduceMotion ? {} : { scale: [1, 1.02, 1], transition: { duration: 0.35, ease: 'easeOut' } };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden border-l border-white/[0.08] bg-background/60 p-0 backdrop-blur-[40px] sm:max-w-md md:max-w-lg shadow-[-20px_0_40px_rgba(0,0,0,0.5)]"
      >
        {/* ── Ambient Background Glow ── */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
          <div
            className="absolute top-0 right-0 w-96 h-96 blur-[120px] rounded-full opacity-30"
            style={{ backgroundColor: meta.color }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/80 to-background/95" />
        </div>

        {/* ── Header ── */}
        <SheetHeader className="relative shrink-0 border-b border-white/[0.05] bg-white/[0.01] p-6 pb-5 text-left z-10">
          <SheetTitle className="flex items-center gap-3 text-2xl font-black tracking-tight text-white drop-shadow-md">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-2xl border text-white font-black text-sm shadow-lg"
              style={{ backgroundColor: meta.color, borderColor: `${meta.color}40`, boxShadow: `0 0 20px ${meta.color}40` }}
            >
              {meta.short}
            </div>
            Sync with {meta.label}
          </SheetTitle>
          <p className="text-xs font-medium text-muted-foreground/80 mt-1">
            Review {mediaType ?? 'anime & manga'} changes before applying. Select what to sync.
          </p>

          {/* Stats row */}
          {!isLoading && items.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-4">
              {importCount > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <ArrowDown className="w-3 h-3" />
                  {importCount} import
                </span>
              )}
              {exportCount > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <ArrowUp className="w-3 h-3" />
                  {exportCount} export
                </span>
              )}
              {conflictCount > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <ArrowLeftRight className="w-3 h-3" />
                  {conflictCount} conflict
                </span>
              )}
              <button
                onClick={toggleAll}
                className="ml-auto text-xs font-bold text-muted-foreground hover:text-white underline underline-offset-2 transition-colors"
              >
                {selectedIds.size === items.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>
          )}
        </SheetHeader>

        {/* ── Scrollable Body ── */}
        <div className="min-h-0 flex-1 overflow-hidden relative z-10">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground">
              <Loader2 className="w-9 h-9 animate-spin" style={{ color: meta.color }} />
              <p className="text-sm font-medium">Fetching changes from {meta.label}…</p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4 px-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10 border border-green-500/20">
                <CheckCircle2 className="w-9 h-9 text-green-500" />
              </div>
              <p className="text-base font-bold text-foreground">All caught up!</p>
              <p className="text-xs font-medium text-muted-foreground/80 max-w-xs">
                Your Tatakai {mediaType ?? 'anime & manga'} list is in sync with {meta.label}. Nothing to apply.
              </p>
            </div>
          ) : (
            <ScrollArea className="h-full custom-scrollbar">
              <div className="p-5 space-y-3">
                {items.map((item) => {
                  const isSelected = selectedIds.has(item.id);
                  return (
                    <motion.button
                      key={item.id}
                      type="button"
                      onClick={() => toggleItem(item.id)}
                      animate={isSelected ? selectAnim : {}}
                      whileTap={reduceMotion ? {} : { scale: 0.98 }}
                      className={cn(
                        'group relative flex w-full items-start gap-3 overflow-hidden rounded-[1.25rem] p-3 text-left transition-all duration-300 shadow-lg',
                        isSelected
                          ? 'bg-white/[0.05] ring-2 ring-offset-0'
                          : 'bg-white/[0.02] ring-1 ring-white/10 opacity-60 hover:opacity-90',
                      )}
                      style={isSelected ? ({ '--tw-ring-color': meta.color } as React.CSSProperties) : undefined}
                    >
                      {/* Poster */}
                      {item.poster ? (
                        <img
                          src={item.poster}
                          alt={item.title}
                          className="w-11 h-16 object-cover rounded-xl shrink-0 bg-muted ring-1 ring-white/10"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <div className="w-11 h-16 rounded-xl bg-white/[0.04] shrink-0 flex items-center justify-center text-muted-foreground text-[8px] font-bold uppercase ring-1 ring-white/10">
                          {item.type[0]}
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <p className="font-bold text-sm leading-tight line-clamp-1 flex-1 text-white/90">
                            {item.title}
                          </p>
                          {!mediaType && (
                            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-muted-foreground">
                              {item.type}
                            </span>
                          )}
                          <DirectionBadge direction={item.direction} />
                        </div>

                        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                          {item.actionText}
                        </p>

                        {(item.localStatus || item.remoteStatus) && (
                          <div className="flex items-center gap-1.5 flex-wrap mt-2">
                            {item.localStatus && <StatusPill label="Local" value={item.localStatus} />}
                            {item.localProgress != null && (
                              <StatusPill label={item.type === 'anime' ? 'Ep' : 'Ch'} value={String(item.localProgress)} />
                            )}
                            {item.type === 'manga' && item.localVolumes != null && item.localVolumes > 0 && (
                              <StatusPill label="Vol" value={String(item.localVolumes)} />
                            )}
                            {(item.localStatus || item.localProgress != null) && (item.remoteStatus || item.remoteProgress != null) && (
                              <ArrowLeftRight className="w-2.5 h-2.5 text-muted-foreground" />
                            )}
                            {item.remoteStatus && <StatusPill label={meta.short} value={item.remoteStatus} />}
                            {item.remoteProgress != null && (
                              <StatusPill label={item.type === 'anime' ? 'Ep' : 'Ch'} value={String(item.remoteProgress)} />
                            )}
                            {item.type === 'manga' && item.remoteVolumes != null && item.remoteVolumes > 0 && (
                              <StatusPill label="Vol" value={String(item.remoteVolumes)} />
                            )}
                          </div>
                        )}
                      </div>

                      {/* Selected check */}
                      <div
                        className={cn(
                          'shrink-0 mt-0.5 flex h-6 w-6 items-center justify-center rounded-full transition-all',
                          isSelected ? 'text-white shadow-lg' : 'bg-white/[0.04] text-transparent border border-white/10',
                        )}
                        style={isSelected ? { backgroundColor: meta.color } : undefined}
                      >
                        <Check className="h-4 w-4" />
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* ── Sticky Footer ── */}
        <div className="relative z-20 flex shrink-0 items-center gap-3 border-t border-white/[0.08] bg-background/60 p-5 backdrop-blur-2xl">
          {items.length > 0 && !isLoading && (
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1 mr-auto">
              <Info className="w-3 h-3" />
              {selectedItems.length} of {items.length} selected
            </p>
          )}
          <Button variant="ghost" onClick={onClose} disabled={isApplying} className="h-11 rounded-full px-6 font-bold hover:bg-white/10">
            Cancel
          </Button>
          {items.length > 0 && !isLoading && (
            <Button
              onClick={handleApply}
              disabled={selectedItems.length === 0 || isApplying}
              className="h-11 rounded-full px-7 text-sm font-black uppercase tracking-wide text-white shadow-lg transition-all hover:scale-105 disabled:hover:scale-100"
              style={selectedItems.length > 0 ? { backgroundColor: meta.color, boxShadow: `0 0 20px ${meta.color}40` } : undefined}
            >
              {isApplying ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Applying…</>
              ) : (
                <><RefreshCw className="mr-2 h-4 w-4" /> Apply {selectedItems.length}</>
              )}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
