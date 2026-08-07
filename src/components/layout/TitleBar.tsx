import { useIsNativeApp } from "@/hooks/ui/useIsNativeApp";
import { useEffect, useState, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { Minus, Square, X, Copy } from "lucide-react";
// import { useDownload } from "@/hooks/media/useDownload";

export function TitleBar() {
  const isNative = useIsNativeApp();
  const [title, setTitle] = useState("Tatakai");
  const [isMaximized, setIsMaximized] = useState(false);
  const location = useLocation();
  // const { downloadStates = {} } = useDownload();

  // const activeDownloads = useMemo(() => 
  //   Object.values(downloadStates).filter(d => d.status === 'downloading'), 
  //   [downloadStates]
  // );
  // const queuedDownloads = useMemo(() => 
  //   Object.values(downloadStates).filter(d => d.status === 'queued'),
  //   [downloadStates]
  // );

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
      data-titlebar
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


