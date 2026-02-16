import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

export function Background() {
  const { isLightTheme, themes, theme } = useTheme();

  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
      {/* Deep textured base */}
      <div className="absolute inset-0 bg-background" />

      {/* Subtle noise grain */}
      <div
        className="absolute inset-0 opacity-[0.02] mix-blend-overlay"
        style={{
          backgroundImage: "url('https://grainy-gradients.vercel.app/noise.svg')",
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

      {/* Ambient Glows - Simplified on mobile for performance */}
      <div className={cn(
        "absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] rounded-full blur-[150px] animate-pulse-slow",
        isLightTheme ? "bg-primary/5" : "bg-primary/10",
        "md:block" // Keep full glow on desktop
      )} />
      <div className={cn(
        "absolute bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] rounded-full blur-[150px] animate-pulse-slow",
        isLightTheme ? "bg-secondary/5" : "bg-secondary/10",
        "md:block"
      )} style={{ animationDelay: "2s" }} />
    </div>
  );
}
