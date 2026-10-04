import { useIsNativeApp, useIsMacOS } from "@/hooks/ui/useIsNativeApp";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Minus, Square, X, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { DynamicIsland } from "./DynamicIsland";

export function TitleBar() {
  const isNative = useIsNativeApp();
  const isMac = useIsMacOS();
  const [title, setTitle] = useState("Tatakai");
  const [isMaximized, setIsMaximized] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const updateTitle = () => {
        if (location.pathname === '/') setTitle('Tatakai');
        else if (location.pathname === '/setup') setTitle('Setup');
        else if (location.pathname === '/offline') setTitle('Downloads');
        else if (location.pathname === '/settings') setTitle('Settings');
        else setTitle(document.title?.replace(' | Tatakai', '') || 'Tatakai');
    };

    updateTitle();

    const observer = new MutationObserver(() => {
        setTitle(document.title?.replace(' | Tatakai', '') || 'Tatakai');
    });
    const titleElement = document.querySelector('title');
    if(titleElement) {
        observer.observe(titleElement, { childList: true });
    }
    return () => observer.disconnect();
  }, [location]);

  // Track the real window state instead of a local toggle, so double-click,
  // OS snap, and keyboard maximize keep the restore/maximize glyph correct.
  useEffect(() => {
    const el = (window as any).electron;
    if (!el?.onMaximizeChanged) return;
    el.isMaximized?.().then((v: boolean) => setIsMaximized(!!v)).catch(() => {});
    return el.onMaximizeChanged((v: boolean) => setIsMaximized(!!v));
  }, []);

  if (!isNative) return null;

  // macOS paints native traffic lights via hiddenInset + already shows the
  // app name in the system menu bar, so the custom bar stays a transparent
  // drag-only overlay: no solid background, no border, no duplicate title.
  // That reclaims the visual "second menu bar" and can never cover header
  // icons behind an opaque strip.
  return (
    <div
      data-titlebar
      className={cn(
        "fixed top-0 left-0 right-0 h-[32px] z-[9999] flex items-center justify-between pr-0 select-none",
        isMac
          ? "bg-transparent border-transparent pointer-events-none"
          : "bg-background/95 backdrop-blur-sm border-b border-border/60",
      )}
      style={{ WebkitAppRegion: 'drag', paddingLeft: isMac ? 76 : 12 } as any}
    >
      {/* Left: App Icon + Title (hidden on mac — traffic lights + system menu sit here) */}
      <div className="flex items-center gap-2.5">
        {!isMac && (
          <img
            src={`${import.meta.env.BASE_URL}assets/logo/icon-32.png`}
            alt="Tatakai"
            className="w-4 h-4"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        )}
        {!isMac && (
          <span className="text-[12px] font-medium text-foreground/70 tracking-wide truncate max-w-[200px]">{title}</span>
        )}
      </div>

      {/* Center: Download Dynamic Island (absolutely centered, hover to expand) */}
      <div className={cn(isMac && "pointer-events-auto")}>
        <DynamicIsland />
      </div>

      {/* Right: Window Controls — Windows/Linux only (mac uses native lights) */}
      {!isMac && (
        <div className="flex items-center h-full" style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button
            onClick={() => (window as any).electron?.minimize()}
            className="h-[32px] w-[46px] flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            title="Minimize"
          >
            <Minus size={16} strokeWidth={1.5} />
          </button>
          <button
            onClick={() => (window as any).electron?.maximize()}
            className="h-[32px] w-[46px] flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            title={isMaximized ? "Restore" : "Maximize"}
          >
            {isMaximized ? (
              <Copy size={12} strokeWidth={1.5} className="rotate-180" />
            ) : (
              <Square size={12} strokeWidth={1.5} />
            )}
          </button>
          <button
            onClick={() => (window as any).electron?.close()}
            className="h-[32px] w-[46px] flex items-center justify-center text-muted-foreground hover:text-white hover:bg-destructive transition-all"
            title="Close"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>
      )}
    </div>
  );
}
