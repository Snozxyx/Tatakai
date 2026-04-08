import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

export function Background() {
  const { isLightTheme, themes, theme } = useTheme();

  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
      {/* Deep textured base */}
      <div className="absolute inset-0 bg-background" />

      {/* Subtle noise grain - desktop only to avoid remote fetch on mobile */}
      <div
        className="absolute inset-0 opacity-[0.02] mix-blend-overlay hidden md:block"
        style={{
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.35'/%3E%3C/svg%3E\")",
          backgroundRepeat: "repeat"
        }}
      />

      {/* Architectural Grid */}
      <div
        className="absolute inset-0 opacity-[0.03] md:opacity-[0.05]"
        style={{
          backgroundImage: `linear-gradient(to right, hsl(var(--border)) 1px, transparent 1px), 
                           linear-gradient(to bottom, hsl(var(--border)) 1px, transparent 1px)`,
          backgroundSize: "4rem 4rem",
          maskImage: "radial-gradient(ellipse 60% 50% at 50% 0%, black 70%, transparent 100%)"
        }}
      />

      {/* Ambient Glows - desktop only, too expensive on mobile */}
      <div className={cn(
        "absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] rounded-full blur-[150px] animate-pulse-slow hidden md:block",
        isLightTheme ? "bg-primary/5" : "bg-primary/10"
      )} />
      <div className={cn(
        "absolute bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] rounded-full blur-[150px] animate-pulse-slow hidden md:block",
        isLightTheme ? "bg-secondary/5" : "bg-secondary/10"
      )} style={{ animationDelay: "2s" }} />
    </div>
  );
}
