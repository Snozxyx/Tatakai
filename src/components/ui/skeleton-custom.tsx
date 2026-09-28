import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-shimmer rounded-lg bg-muted",
        className
      )}
    />
  );
}

/**
 * Stands in for a media card while it loads, so it has to keep the card's own
 * 2:3 poster ratio (docs/Plans.md §2 — "Cards (improve polish and
 * consistency)"); at 3:4 the row visibly grew when the real cards arrived.
 * Callers pass width through `className`, which it used not to accept.
 */
export function CardSkeleton({ className }: SkeletonProps) {
  return (
    <div className={cn("glass-panel p-3 space-y-3", className)}>
      <Skeleton className="w-full aspect-[2/3] rounded-2xl" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}

export function HeroSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
      <div className="lg:col-span-5 space-y-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-16 w-3/4" />
        <div className="flex gap-3">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-20" />
        </div>
        <div className="flex gap-4">
          <Skeleton className="h-14 w-40 rounded-full" />
          <Skeleton className="h-14 w-14 rounded-full" />
        </div>
      </div>
      <div className="lg:col-span-7">
        <Skeleton className="h-[600px] rounded-3xl" />
      </div>
    </div>
  );
}
