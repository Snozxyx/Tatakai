import { useIsNativeApp } from "@/hooks/useIsNativeApp";
import { useEffect, useState, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { Minus, Square, X, Copy } from "lucide-react";
import { useDownload } from "@/hooks/useDownload";

export function TitleBar() {
  const isNative = useIsNativeApp();
  const [title, setTitle] = useState("Tatakai");
  const [isMaximized, setIsMaximized] = useState(false);
  const location = useLocation();
  const { downloadStates = {} } = useDownload();

  const activeDownloads = useMemo(() => 
    Object.values(downloadStates).filter(d => d.status === 'downloading'), 
    [downloadStates]
  );
  const queuedDownloads = useMemo(() => 
    Object.values(downloadStates).filter(d => d.status === 'queued'),
    [downloadStates]
  );

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

  if (!isNative) return null;

  return (
    <div 
      className="fixed top-0 left-0 right-0 h-[32px] z-[9999] flex items-center justify-between pl-3 pr-0 select-none bg-[#0a0a0b]/95 backdrop-blur-sm border-b border-white/[0.06]" 
      style={{ WebkitAppRegion: 'drag' } as any}
    >
      {/* Left: App Icon + Title */}
      <div className="flex items-center gap-2.5">
        <img 
          src="/icon-32.png" 
          alt="Tatakai" 
          className="w-4 h-4"
          onError={(e) => {
            // Fallback to gradient if icon fails to load
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
        <span className="text-[12px] font-medium text-white/70 tracking-wide truncate max-w-[200px]">{title}</span>
      </div>

      {/* Center: Download Status */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 group/downloads" style={{ WebkitAppRegion: 'no-drag' } as any}>
        {(activeDownloads.length > 0 || queuedDownloads.length > 0) && (
          <>
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/30 shadow-lg shadow-purple-500/10 hover:border-purple-500/50 transition-all cursor-pointer">
              <div className="relative flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                <div className="absolute w-3 h-3 rounded-full bg-purple-400/30 animate-ping" />
              </div>
              <span className="text-[11px] font-semibold bg-gradient-to-r from-purple-300 to-pink-300 bg-clip-text text-transparent">
                {activeDownloads.length > 0 
                  ? `${activeDownloads.length} downloading`
                  : `${queuedDownloads.length} queued`}
              </span>
            </div>
            
            {/* Tooltip */}
            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 opacity-0 invisible group-hover/downloads:opacity-100 group-hover/downloads:visible transition-all duration-200 z-[10000]">
              <div className="bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl p-3 min-w-[280px] max-w-[320px]">
                <div className="space-y-2">
                  <div className="text-[10px] font-semibold text-white/50 uppercase tracking-wider mb-2">Active Downloads</div>
                  {activeDownloads.slice(0, 3).map((state) => (
                    <div key={state.episodeId} className="flex items-center gap-2 py-1.5 px-2 rounded-lg bg-white/5">
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-medium text-white/90 truncate">{state.animeName}</div>
                        <div className="text-[10px] text-white/50">Episode {state.episodeNumber}</div>
                      </div>
                      <div className="text-[10px] font-bold text-purple-400">{Math.round(state.progress || 0)}%</div>
                    </div>
                  ))}
                  {activeDownloads.length > 3 && (
                    <div className="text-[10px] text-white/40 text-center mt-1">+{activeDownloads.length - 3} more</div>
                  )}
                  {queuedDownloads.length > 0 && (
                    <div className="text-[10px] text-white/40 mt-2 pt-2 border-t border-white/5">{queuedDownloads.length} in queue</div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Right: Window Controls - Only custom controls, no native */}
      <div className="flex items-center h-full" style={{ WebkitAppRegion: 'no-drag' } as any}>
        <button 
          onClick={() => (window as any).electron?.minimize()}
          className="h-[32px] w-[46px] flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-all"
          title="Minimize"
        >
          <Minus size={16} strokeWidth={1.5} />
        </button>
        <button 
          onClick={() => {
            (window as any).electron?.maximize();
            setIsMaximized(!isMaximized);
          }}
          className="h-[32px] w-[46px] flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-all"
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
          className="h-[32px] w-[46px] flex items-center justify-center text-white/50 hover:text-white hover:bg-red-500 transition-all"
          title="Close"
        >
          <X size={16} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
