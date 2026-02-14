/**
 * Mobile Downloads UI - Floating panel showing download progress
 */
import { useState } from 'react';
import { Download, X, RotateCcw, Trash2, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useMobileDownload } from '@/hooks/useMobileDownload';
import { cn } from '@/lib/utils';

export function MobileDownloadsUI() {
  const [isOpen, setIsOpen] = useState(false);
  const { isNative, queue, activeDownloads, cancelDownload, retryDownload } = useMobileDownload();

  // Only show on mobile
  if (!isNative) return null;

  // No downloads, don't show
  if (queue.length === 0) return null;

  const hasActive = activeDownloads.length > 0;

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          "fixed bottom-20 right-4 z-50 w-14 h-14 rounded-full shadow-xl",
          "flex items-center justify-center",
          hasActive ? "bg-primary" : "bg-zinc-800"
        )}
      >
        {hasActive ? (
          <Loader2 className="w-6 h-6 text-white animate-spin" />
        ) : (
          <Download className="w-6 h-6 text-white" />
        )}
        <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-bold">
          {queue.length}
        </span>
      </button>

      {/* Panel */}
      {isOpen && (
        <div className="fixed inset-0 z-[100]">
          <div className="absolute inset-0 bg-black/60" onClick={() => setIsOpen(false)} />

          <div className="absolute inset-x-0 bottom-0 bg-zinc-900 rounded-t-3xl max-h-[80vh] overflow-hidden animate-in slide-in-from-bottom">
            {/* Header */}
            <div className="sticky top-0 bg-zinc-900 border-b border-white/10 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Download className="w-5 h-5 text-primary" />
                <span className="font-semibold text-white">Downloads</span>
              </div>
              <button onClick={() => setIsOpen(false)} className="p-2 rounded-full hover:bg-white/10">
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* List */}
            <div className="overflow-y-auto max-h-[60vh] p-4 space-y-3">
              {queue.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "rounded-xl p-4",
                    item.status === 'failed' ? "bg-red-500/10 border border-red-500/20" :
                    item.status === 'completed' ? "bg-green-500/10 border border-green-500/20" :
                    "bg-white/5"
                  )}
                >
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                      item.status === 'downloading' ? "bg-primary/20" :
                      item.status === 'completed' ? "bg-green-500/20" :
                      item.status === 'failed' ? "bg-red-500/20" : "bg-zinc-700"
                    )}>
                      {item.status === 'downloading' && <Loader2 className="w-5 h-5 text-primary animate-spin" />}
                      {item.status === 'queued' && <Download className="w-5 h-5 text-zinc-400" />}
                      {item.status === 'completed' && <CheckCircle className="w-5 h-5 text-green-500" />}
                      {item.status === 'failed' && <AlertCircle className="w-5 h-5 text-red-500" />}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">{item.animeTitle}</p>
                      <p className="text-zinc-400 text-sm">S{item.season} E{item.episode}</p>

                      {/* Progress */}
                      {(item.status === 'downloading' || item.status === 'queued') && (
                        <div className="mt-2">
                          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${item.progress}%` }}
                            />
                          </div>
                          <p className="text-xs text-zinc-500 mt-1">
                            {item.status === 'queued' ? 'Waiting...' : `${item.progress}%`}
                          </p>
                        </div>
                      )}

                      {item.status === 'failed' && item.error && (
                        <p className="text-xs text-red-400 mt-1">{item.error}</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-1">
                      {item.status === 'failed' && (
                        <button
                          onClick={() => retryDownload(item.id)}
                          className="p-2 rounded-lg bg-white/5 hover:bg-white/10"
                        >
                          <RotateCcw className="w-4 h-4 text-white" />
                        </button>
                      )}
                      <button
                        onClick={() => cancelDownload(item.id)}
                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10"
                      >
                        {item.status === 'downloading' || item.status === 'queued' ? (
                          <X className="w-4 h-4 text-red-400" />
                        ) : (
                          <Trash2 className="w-4 h-4 text-zinc-400" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
