import { useState } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STATUS_ACCENT } from '../statusLabels';
import { SeeAllDialog } from './SeeAllDialog';

interface ProfileShelfProps<T> {
  status: string;
  label: string;
  items: T[];
  getKey: (item: T) => string;
  getTitle: (item: T) => string | null | undefined;
  renderCard: (item: T, index: number) => React.ReactNode;
  shelfGridClass: string;
  dialogGridClass: string;
  cap?: number;
}

/**
 * One status section of a profile list: an accent header (status dot + label +
 * count), up to `cap` cards, and a "+" / "See all (N)" pill that opens
 * {@link SeeAllDialog} with the full (already search-filtered) category.
 */
export function ProfileShelf<T>({
  status,
  label,
  items,
  getKey,
  getTitle,
  renderCard,
  shelfGridClass,
  dialogGridClass,
  cap = 5,
}: ProfileShelfProps<T>) {
  const [open, setOpen] = useState(false);
  const accent = STATUS_ACCENT[status] || STATUS_ACCENT.plan_to_watch;
  const visible = items.slice(0, cap);
  const hasMore = items.length > cap;

  return (
    <section className="group/shelf">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <span className={cn('inline-flex h-2.5 w-2.5 rounded-full', accent.dot)} />
          <h4 className={cn('text-sm font-black uppercase tracking-widest', accent.text)}>{label}</h4>
          <span className="px-2 py-0.5 rounded-full bg-white/[0.04] text-[11px] font-semibold text-muted-foreground border border-white/[0.05]">
            {items.length}
          </span>
        </div>
        {hasMore && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] px-3 py-1.5 text-xs font-bold text-foreground/80 hover:text-foreground transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            See all ({items.length})
          </button>
        )}
      </div>

      <div className={shelfGridClass}>
        {visible.map((item, i) => (
          <div key={getKey(item)}>{renderCard(item, i)}</div>
        ))}
      </div>

      {hasMore && (
        <SeeAllDialog
          open={open}
          onOpenChange={setOpen}
          title={label}
          items={items}
          getKey={getKey}
          getTitle={getTitle}
          renderCard={renderCard}
          gridClass={dialogGridClass}
        />
      )}
    </section>
  );
}
