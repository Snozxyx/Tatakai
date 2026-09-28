import { cn } from '@/lib/utils';

/**
 * Green presence marker overlaid on a `relative` avatar's bottom-right corner.
 * Render conditionally (`onlineUserIds.has(userId)`); pass a matching `ring`
 * colour when the backing surface isn't `--background` (e.g. solid-dark cards).
 */
export function OnlineDot({
  className,
  size = 'md',
}: {
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <span
      className={cn(
        'absolute bottom-0 right-0 block rounded-full bg-emerald-500 ring-2 ring-background',
        size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3',
        className,
      )}
      aria-label="Online"
    >
      <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-60" />
    </span>
  );
}
