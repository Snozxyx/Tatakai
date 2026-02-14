import { useDownload } from "@/hooks/useDownload";
import { useIsNativeApp, useIsMobileApp, useIsDesktopApp } from "@/hooks/useIsNativeApp";
import { Download, X, CheckCircle2, AlertCircle, RotateCcw, Pause, Play, FolderOpen, ChevronDown, ChevronUp } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";

export function DownloadIndicator() {
  const isNative = useIsNativeApp();
  const isMobile = useIsMobileApp();
  const isDesktop = useIsDesktopApp();
  const { downloadStates = {}, cancelDownload, startDownload, retryDownload } = useDownload();
  const [isExpanded, setIsExpanded] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  
  if (!isNative) return null;

  const allDownloads = Object.entries(downloadStates);
  const activeDownloads = allDownloads.filter(([_, state]) => state.status === 'downloading');
  const queuedDownloads = allDownloads.filter(([_, state]) => state.status === 'queued');
  const completedDownloads = allDownloads.filter(([_, state]) => state.status === 'completed');
  const errorDownloads = allDownloads.filter(([_, state]) => state.status === 'error');

  const totalActive = activeDownloads.length + queuedDownloads.length + errorDownloads.length;
  
  if (allDownloads.length === 0) return null;

  const openDownloadFolder = async () => {
    const downloadPath = localStorage.getItem('tatakai_download_path') || await (window as any).electron.getDownloadsDir();
    (window as any).electron.openPath(downloadPath);
  };

  if (isMinimized) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className={isMobile ? "fixed top-4 right-4 z-[50]" : "fixed bottom-4 right-4 z-[50]"}
      >
        <button 
          onClick={() => setIsMinimized(false)}
          className="flex items-center gap-2 px-3 py-2 bg-zinc-900/95 backdrop-blur-md border border-white/10 rounded-full shadow-xl hover:border-purple-500/30 transition-all"
        >
          <div className="relative">
            <Download size={16} className="text-purple-400" />
            {totalActive > 0 && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-purple-500 rounded-full text-[8px] flex items-center justify-center font-bold">
                {totalActive}
              </span>
            )}
          </div>
          <span className="text-xs text-white/70">Downloads</span>
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: isMobile ? -20 : 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={isMobile ? "fixed top-4 right-4 z-[50] w-80" : "fixed bottom-4 right-4 z-[50] w-80"}
    >
      <div className="bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 bg-gradient-to-r from-purple-500/5 to-pink-500/5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Download size={14} className="text-purple-400" />
            <span className="text-xs font-medium text-white/80">Downloads</span>
            {totalActive > 0 && (
              <span className="px-1.5 py-0.5 bg-purple-500/20 rounded text-[10px] font-bold text-purple-300">
                {totalActive}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {isDesktop && (
              <button 
                onClick={openDownloadFolder}
                className="p-1 hover:bg-white/5 rounded text-white/40 hover:text-white/70 transition-colors"
                title="Open folder"
              >
                <FolderOpen size={12} />
              </button>
            )}
            <button 
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 hover:bg-white/5 rounded text-white/40 hover:text-white/70 transition-colors"
            >
              {isExpanded ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
            </button>
            <button 
              onClick={() => setIsMinimized(true)}
              className="p-1 hover:bg-white/5 rounded text-white/40 hover:text-white/70 transition-colors"
              title="Minimize"
            >
              <X size={12} />
            </button>
          </div>
        </div>

        {/* Content */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="max-h-[300px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10"
            >
              {/* Active Downloads */}
              {activeDownloads.map(([id, state]) => (
                <DownloadItem 
                  key={id}
                  id={id}
                  state={state}
                  onCancel={() => cancelDownload(id)}
                  onRetry={() => retryDownload?.(id)}
                  type="active"
                />
              ))}

              {/* Queued */}
              {queuedDownloads.map(([id, state]) => (
                <DownloadItem 
                  key={id}
                  id={id}
                  state={state}
                  onCancel={() => cancelDownload(id)}
                  type="queued"
                />
              ))}

              {/* Errors */}
              {errorDownloads.map(([id, state]) => (
                <DownloadItem 
                  key={id}
                  id={id}
                  state={state}
                  onCancel={() => cancelDownload(id)}
                  onRetry={() => retryDownload?.(id)}
                  type="error"
                />
              ))}

              {/* Completed (show last 3) */}
              {completedDownloads.slice(-3).map(([id, state]) => (
                <DownloadItem 
                  key={id}
                  id={id}
                  state={state}
                  onCancel={() => cancelDownload(id)}
                  type="completed"
                />
              ))}

              {allDownloads.length === 0 && (
                <div className="p-4 text-center text-white/30 text-xs">
                  No active downloads
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function DownloadItem({ id, state, onCancel, onRetry, type }: {
  id: string;
  state: any;
  onCancel: () => void;
  onRetry?: () => void;
  type: 'active' | 'queued' | 'completed' | 'error';
}) {
  return (
    <div className="flex items-start gap-2.5 p-3 border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors">
      {/* Poster */}
      {state.posterUrl ? (
        <img src={state.posterUrl} alt="" className="w-8 h-11 object-cover rounded" />
      ) : (
        <div className="w-8 h-11 bg-zinc-800 rounded flex items-center justify-center">
          <Download size={12} className="text-white/30" />
        </div>
      )}
      
      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="text-[11px] font-medium text-white/90 truncate leading-tight">
              {state.animeName || 'Unknown'}
            </h4>
            <p className="text-[10px] text-white/40">Episode {state.episodeNumber}</p>
          </div>
          
          {/* Actions */}
          <div className="flex items-center gap-0.5 shrink-0">
            {type === 'error' && onRetry && (
              <button 
                onClick={onRetry}
                className="p-1 hover:bg-white/10 rounded text-orange-400 hover:text-orange-300"
                title="Retry"
              >
                <RotateCcw size={11} />
              </button>
            )}
            {(type === 'active' || type === 'queued' || type === 'error') && (
              <button 
                onClick={onCancel}
                className="p-1 hover:bg-white/10 rounded text-white/30 hover:text-red-400"
                title="Cancel"
              >
                <X size={11} />
              </button>
            )}
          </div>
        </div>
        
        {/* Status */}
        {type === 'active' && (
          <div className="mt-1.5 space-y-1">
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-300 relative"
                style={{ width: `${Math.max(0, Math.min(100, state.progress))}%` }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
              </div>
            </div>
            <div className="flex justify-between items-center text-[9px]">
              <span className="text-white/60 font-medium">
                {state.progress > 0 ? `${Math.round(state.progress)}%` : 'Starting...'}
                {state.downloaded && <span className="text-white/40 ml-1">({state.downloaded})</span>}
              </span>
              <div className="flex items-center gap-2 text-white/40">
                {state.speed && (
                  <span className="text-purple-400 font-medium">{state.speed}</span>
                )}
                {state.eta && (
                  <span>ETA: {state.eta}</span>
                )}
              </div>
            </div>
          </div>
        )}
        
        {type === 'queued' && (
          <div className="mt-1 flex items-center gap-1 text-[9px] text-yellow-400/70">
            <div className="w-1 h-1 bg-yellow-400 rounded-full animate-pulse" />
            <span>Queued</span>
          </div>
        )}
        
        {type === 'completed' && (
          <div className="mt-1 flex items-center gap-1 text-[9px] text-green-400">
            <CheckCircle2 size={10} />
            <span>Completed</span>
          </div>
        )}
        
        {type === 'error' && (
          <div className="mt-1 flex items-center gap-1 text-[9px] text-red-400">
            <AlertCircle size={10} />
            <span className="truncate">{state.error || 'Failed'}</span>
          </div>
        )}
      </div>
    </div>
  );
}
