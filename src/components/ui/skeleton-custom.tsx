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

export function CardSkeleton() {
  return (
    <div className="glass-panel p-3 space-y-3">
      <Skeleton className="w-full aspect-[3/4] rounded-2xl" />
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
