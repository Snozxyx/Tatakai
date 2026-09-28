import { type ReactNode } from 'react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { cn } from '@/lib/utils';
import { type LucideIcon } from 'lucide-react';

/**
 * One figure in the dashboard's summary row.
 *
 * `tone` is a theme token rather than a colour so the row cannot drift off the
 * palette the way the old status tile did, which reached for `orange-500` and
 * `emerald-500` — two hues that appear nowhere else in the app.
 */
export function StatTile({
  icon: Icon,
  tone,
  value,
  label,
}: {
  icon: LucideIcon;
  tone: 'primary' | 'secondary' | 'destructive' | 'amber';
  value: ReactNode;
  label: string;
}) {
  const chip = {
    primary: 'bg-primary/15 text-primary',
    secondary: 'bg-secondary/15 text-secondary',
    destructive: 'bg-destructive/15 text-destructive',
    amber: 'bg-amber/15 text-amber',
  }[tone];

  return (
    <GlassPanel className="rounded-2xl p-4">
      <div className="flex items-center gap-3">
        <div className={cn('rounded-xl p-2', chip)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold tabular-nums">{value}</p>
          <p className="truncate text-xs text-muted-foreground">{label}</p>
        </div>
      </div>
    </GlassPanel>
  );
}
