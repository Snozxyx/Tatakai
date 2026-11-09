import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { cn } from "@/lib/utils";

// The catalogue and custom-source detail pages use one layout contract.
export function AnimeDetailHero({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn("grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12 pt-4 md:pt-8", className)}
    >
      {children}
    </div>
  );
}
export function AnimeDetailPoster({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <GlassPanel quiet className={cn("overflow-hidden self-start", className)}>{children}</GlassPanel>
  );
}
export function AnimeDetailContent({ children }: { children: ReactNode }) {
  return (
    <div className="lg:col-span-2 flex min-w-0 flex-col gap-6">{children}</div>
  );
}
export function AnimeDetailTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h1 className={cn("font-display text-4xl md:text-5xl font-semibold mb-4", className)}>
      {children}
    </h1>
  );
}
export function AnimeDetailDescription({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground leading-relaxed">{children}</p>;
}
export function AnimeDetailFacts({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">{children}</div>
  );
}
export function AnimeDetailActions({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 pt-4">{children}</div>
  );
}
export function AnimeDetailPrimaryAction({
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        "h-12 px-6 rounded-[10px] bg-foreground text-background font-medium text-sm motion-safe:active:scale-[0.98] transition-colors flex items-center gap-2 disabled:opacity-50",
        className
      )}
    >
      {children}
    </button>
  );
}
