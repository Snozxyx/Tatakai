export function Background() {
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
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `linear-gradient(to right, hsl(var(--border)) 1px, transparent 1px), 
                           linear-gradient(to bottom, hsl(var(--border)) 1px, transparent 1px)`,
          backgroundSize: "4rem 4rem",
          maskImage: "radial-gradient(ellipse 60% 50% at 50% 0%, black 70%, transparent 100%)"
        }}
      />
      
      {/* Ambient Glows */}
      <div className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] bg-primary/10 rounded-full blur-[150px] animate-pulse-slow" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] bg-secondary/10 rounded-full blur-[150px] animate-pulse-slow" style={{ animationDelay: "2s" }} />
    </div>
  );
}
