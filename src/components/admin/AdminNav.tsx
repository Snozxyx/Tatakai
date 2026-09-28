/**
 * The admin dashboard's section rail — one component for the desktop column and
 * the mobile sheet, so the two lists (and their badge counts) cannot drift apart
 * the way the page's hand-written pair did.
 *
 * The rows are Radix `TabsTrigger`s, so the page keeps its existing `Tabs` root
 * and all thirty `TabsContent` bodies untouched; this replaces only the two
 * lists that used to sit around them.
 *
 * The filter box is local state rather than a page concern because hiding a row
 * never changes which panel is open — Radix drives the panel from the root's
 * `value`, not from the presence of a trigger — so a leftover search can't
 * strand anyone on a section they can no longer see.
 */
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { filterAdminNav, type AdminBadgeKey, type AdminNavGroup } from './adminSections';

/** Below this many rows the list is short enough to read; a filter is noise. */
const SEARCH_THRESHOLD = 8;

interface AdminNavProps {
  groups: AdminNavGroup[];
  /** Live pending counts, keyed as in `AdminNavItem.badge`. */
  badgeCounts?: Partial<Record<AdminBadgeKey, number>> | null;
  /** Fires once a section is chosen — the mobile sheet closes on it. */
  onSelect?: () => void;
  className?: string;
}

export function AdminNav({ groups, badgeCounts, onSelect, className }: AdminNavProps) {
  const [query, setQuery] = useState('');
  const visible = useMemo(() => filterAdminNav(groups, query), [groups, query]);
  const total = useMemo(
    () => groups.reduce((sum, group) => sum + group.items.length, 0),
    [groups],
  );

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {total > SEARCH_THRESHOLD && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Filter ${total} sections`}
            aria-label="Filter dashboard sections"
            className="h-10 w-full rounded-xl border border-white/[0.07] bg-white/[0.03] pl-9 pr-3 text-sm font-medium text-foreground transition-colors placeholder:text-muted-foreground focus-visible:border-primary/40 focus-visible:outline-none"
          />
        </div>
      )}

      <TabsList className="flex h-auto w-full flex-col items-stretch justify-start gap-0.5 border-0 bg-transparent p-0">
        {visible.map((group) => (
          <div key={group.id} role="presentation" className="w-full">
            <p className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground/60">
              {group.label}
            </p>
            {group.items.map((item) => {
              const count = item.badge ? (badgeCounts?.[item.badge] ?? 0) : 0;
              return (
                <TabsTrigger
                  key={item.value}
                  value={item.value}
                  onClick={onSelect}
                  className="group/nav w-full justify-start gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-white/55 transition-colors hover:text-white data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm data-[state=active]:shadow-primary/25"
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate text-left">{item.label}</span>
                  {count > 0 && (
                    <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground group-data-[state=active]/nav:bg-primary-foreground group-data-[state=active]/nav:text-primary">
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                </TabsTrigger>
              );
            })}
          </div>
        ))}
      </TabsList>

      {visible.length === 0 && (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">
          No section matches “{query.trim()}”.
        </p>
      )}
    </div>
  );
}
