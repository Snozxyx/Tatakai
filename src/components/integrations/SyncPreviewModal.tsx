/**
 * src/components/integrations/SyncPreviewModal.tsx
 *
 * Modal that shows the sync diff (import/export/conflict items) and lets users
 * select which items to apply before committing. Implements the manual approval
 * flow required by design: sync is always previewed first, never applied silently
 * from bulk import/export paths.
 */

import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, ArrowDown, ArrowUp, ArrowLeftRight, CheckCircle2, XCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SyncProposalItem, Integration, MediaType } from '@/hooks/user/useIntegrationSync';

interface SyncPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (selectedItems: SyncProposalItem[]) => Promise<void>;
  items: SyncProposalItem[];
  integration: Integration;
  mediaType: MediaType;
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
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/40 border border-white/5 text-muted-foreground capitalize">
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

  // Initialise all as selected
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(items.map(i => i.id)));

  // Sync selectedIds when items change externally (e.g. preview re-loads)
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
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map(i => i.id)));
    }
  };

  const selectedItems = items.filter(i => selectedIds.has(i.id));

  const importCount = items.filter(i => i.direction === 'import').length;
  const exportCount = items.filter(i => i.direction === 'export').length;
  const conflictCount = items.filter(i => i.direction === 'conflict').length;

  const handleApply = async () => {
    if (selectedItems.length === 0) return;
    await onApply(selectedItems);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden bg-background/95 backdrop-blur border-white/10">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-sm shadow-lg"
              style={{ backgroundColor: meta.color, boxShadow: `0 4px 16px ${meta.color}30` }}
            >
              {meta.short}
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">
                Sync Preview — {meta.label}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Review changes before applying. Select which items to sync.
              </DialogDescription>
            </div>
          </div>

          {/* Stats row */}
          {!isLoading && items.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {importCount > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <ArrowDown className="w-3 h-3" />
                  {importCount} to import
                </span>
              )}
              {exportCount > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <ArrowUp className="w-3 h-3" />
                  {exportCount} to export
                </span>
              )}
              {conflictCount > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <ArrowLeftRight className="w-3 h-3" />
                  {conflictCount} conflicts
                </span>
              )}
              <button
                onClick={toggleAll}
                className="ml-auto text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
              >
                {selectedIds.size === items.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>
          )}
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 overflow-hidden">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: meta.color }} />
              <p className="text-sm">Fetching changes from {meta.label}…</p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <CheckCircle2 className="w-10 h-10 text-green-500" />
              <p className="text-sm font-medium text-foreground">All caught up!</p>
              <p className="text-xs text-center max-w-xs">
                Your Tatakai {mediaType} list is in sync with {meta.label}. No changes to apply.
              </p>
            </div>
          ) : (
            <ScrollArea className="h-full max-h-[50vh]">
              <div className="px-4 py-3 space-y-2">
                {items.map((item) => {
                  const isSelected = selectedIds.has(item.id);
                  return (
                    <label
                      key={item.id}
                      htmlFor={`sync-item-${item.id}`}
                      className={cn(
                        'flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer group',
                        isSelected
                          ? 'bg-white/[0.04] border-white/10'
                          : 'bg-transparent border-transparent opacity-50 hover:opacity-70'
                      )}
                    >
                      <Checkbox
                        id={`sync-item-${item.id}`}
                        checked={isSelected}
                        onCheckedChange={() => toggleItem(item.id)}
                        className="mt-0.5 shrink-0"
                      />

                      {/* Poster */}
                      {item.poster ? (
                        <img
                          src={item.poster}
                          alt={item.title}
                          className="w-10 h-14 object-cover rounded-lg shrink-0 bg-muted"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <div className="w-10 h-14 rounded-lg bg-muted/40 shrink-0 flex items-center justify-center text-muted-foreground text-[8px] font-bold uppercase">
                          {item.type[0]}
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <p className="font-medium text-sm leading-tight line-clamp-1 flex-1">
                            {item.title}
                          </p>
                          <DirectionBadge direction={item.direction} />
                        </div>

                        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                          {item.actionText}
                        </p>

                        {/* Status comparison */}
                        {(item.localStatus || item.remoteStatus) && (
                          <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                            {item.localStatus && <StatusPill label="Local" value={item.localStatus} />}
                            {item.localProgress != null && (
                              <StatusPill label={item.type === 'anime' ? 'Ep' : 'Ch'} value={String(item.localProgress)} />
                            )}
                            {(item.localStatus || item.localProgress != null) && (item.remoteStatus || item.remoteProgress != null) && (
                              <ArrowLeftRight className="w-2.5 h-2.5 text-muted-foreground" />
                            )}
                            {item.remoteStatus && <StatusPill label={meta.short} value={item.remoteStatus} />}
                            {item.remoteProgress != null && (
                              <StatusPill label={item.type === 'anime' ? 'Ep' : 'Ch'} value={String(item.remoteProgress)} />
                            )}
                          </div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t border-white/5 shrink-0 flex-col sm:flex-row gap-2">
          {items.length > 0 && !isLoading && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mr-auto">
              <Info className="w-3 h-3" />
              {selectedItems.length} of {items.length} changes selected
            </p>
          )}
          <Button variant="outline" onClick={onClose} disabled={isApplying} className="border-white/10">
            Cancel
          </Button>
          {items.length > 0 && !isLoading && (
            <Button
              onClick={handleApply}
              disabled={selectedItems.length === 0 || isApplying}
              style={selectedItems.length > 0 ? { backgroundColor: meta.color } : undefined}
              className="gap-2 text-white shadow-lg"
            >
              {isApplying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Applying…
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Apply {selectedItems.length} Change{selectedItems.length !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
