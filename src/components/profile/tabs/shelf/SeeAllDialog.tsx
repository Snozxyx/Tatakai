import { useState } from 'react';
import { Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

interface SeeAllDialogProps<T> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  items: T[];
  getKey: (item: T) => string;
  getTitle: (item: T) => string | null | undefined;
  renderCard: (item: T, index: number) => React.ReactNode;
  gridClass: string;
}

/**
 * The "See all" modal behind a shelf's "+" pill: the full category in a
 * scrollable grid with its own search box. Reuses the exact `renderCard` the
 * shelf uses, so cards are identical inside and out.
 */
export function SeeAllDialog<T>({
  open,
  onOpenChange,
  title,
  items,
  getKey,
  getTitle,
  renderCard,
  gridClass,
}: SeeAllDialogProps<T>) {
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const filtered = term
    ? items.filter((i) => String(getTitle(i) || '').toLowerCase().includes(term))
    : items;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl border-white/10 bg-background/95 backdrop-blur-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display tracking-tight">
            {title}
            <span className="px-2.5 py-0.5 rounded-full bg-white/[0.05] text-xs font-semibold text-muted-foreground border border-white/[0.06]">
              {items.length}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search this shelf…"
            className="pl-9 rounded-full bg-white/[0.03] border-white/[0.08]"
          />
        </div>

        <ScrollArea className="max-h-[60vh] pr-2 -mr-2">
          {filtered.length > 0 ? (
            <div className={gridClass}>
              {filtered.map((item, i) => (
                <div key={getKey(item)}>{renderCard(item, i)}</div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground text-sm">No matches.</div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
