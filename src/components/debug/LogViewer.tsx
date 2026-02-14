import { useEffect, useState, useRef } from 'react';
import { useIsNativeApp } from '@/hooks/useIsNativeApp';
import { X, Terminal, Trash2, Copy, Download, Search, Filter, ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';

interface LogEntry {
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  data?: any;
  timestamp: string;
}

type LogFilter = 'all' | 'info' | 'warn' | 'error' | 'debug';

export function LogViewer() {
  const isNative = useIsNativeApp();
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<LogFilter>('all');
  const [search, setSearch] = useState('');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle Escape to close
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    // Listen for Electron's toggle event
    if ((window as any).electron?.onToggleLogViewer) {
      (window as any).electron.onToggleLogViewer(() => {
        setIsOpen(prev => !prev);
      });
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (!isNative) return;

    const originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      debug: console.debug,
    };

    const addLog = (level: LogEntry['level'], message: any, ...args: any[]) => {
      const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
      let formattedMessage = String(message);
      let data: any = args.length > 0 ? args : undefined;

      if (message instanceof Error) {
        formattedMessage = message.message;
        data = message.stack ? [message.stack] : undefined;
      }

      setLogs(prev => [...prev.slice(-500), { level, message: formattedMessage, data, timestamp }]);
      
      if (scrollRef.current) {
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        if (scrollHeight - scrollTop - clientHeight < 100) {
          setTimeout(() => {
            scrollRef.current?.scrollTo({ top: scrollHeight, behavior: 'smooth' });
          }, 0);
        }
      }
    };

    console.log = (...args: any[]) => {
      if (args.length > 0) addLog('info', args[0], ...args.slice(1));
      originalConsole.log(...args);
    };
    console.warn = (...args: any[]) => {
      if (args.length > 0) addLog('warn', args[0], ...args.slice(1));
      originalConsole.warn(...args);
    };
    console.error = (...args: any[]) => {
      if (args.length > 0) addLog('error', args[0], ...args.slice(1));
      originalConsole.error(...args);
    };
    console.debug = (...args: any[]) => {
      if (args.length > 0) addLog('debug', args[0], ...args.slice(1));
      originalConsole.debug(...args);
    };

    return () => {
      console.log = originalConsole.log;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
      console.debug = originalConsole.debug;
    };
  }, [isNative]);

  if (!isOpen) return null;

  const filteredLogs = logs.filter(log => {
    if (filter !== 'all' && log.level !== filter) return false;
    if (search && !log.message.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const copyLogs = () => {
    const text = filteredLogs.map(l => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(text);
  };

  const exportLogs = () => {
    const text = filteredLogs.map(l => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}${l.data ? '\n' + JSON.stringify(l.data, null, 2) : ''}`).join('\n\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tatakai-logs-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const logCounts = {
    all: logs.length,
    info: logs.filter(l => l.level === 'info').length,
    warn: logs.filter(l => l.level === 'warn').length,
    error: logs.filter(l => l.level === 'error').length,
    debug: logs.filter(l => l.level === 'debug').length,
  };

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 md:p-8"
      >
        <motion.div 
          initial={{ scale: 0.95, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 20 }}
          className="w-full max-w-6xl h-[85vh] bg-[#0c0c0d] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-gradient-to-r from-zinc-900/80 to-zinc-900/40">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-lg border border-white/10">
                <Terminal className="w-4 h-4 text-purple-400" />
                <span className="font-mono text-sm font-semibold text-white/90">Console</span>
              </div>
              
              {/* Stats */}
              <div className="hidden md:flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[10px] font-bold">{logCounts.info} INFO</span>
                <span className="px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-400 text-[10px] font-bold">{logCounts.warn} WARN</span>
                <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-400 text-[10px] font-bold">{logCounts.error} ERR</span>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => setLogs([])} title="Clear" className="h-8 w-8 hover:bg-white/5">
                <Trash2 className="w-4 h-4 text-zinc-400" />
              </Button>
              <Button variant="ghost" size="icon" onClick={copyLogs} title="Copy" className="h-8 w-8 hover:bg-white/5">
                <Copy className="w-4 h-4 text-zinc-400" />
              </Button>
              <Button variant="ghost" size="icon" onClick={exportLogs} title="Export" className="h-8 w-8 hover:bg-white/5">
                <Download className="w-4 h-4 text-zinc-400" />
              </Button>
              <div className="w-px h-5 bg-white/10 mx-1" />
              <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} title="Close (Esc)" className="h-8 w-8 hover:bg-red-500/20 hover:text-red-400">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-3 px-4 py-2 border-b border-white/5 bg-zinc-900/30">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Filter logs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-8 pl-9 pr-3 bg-white/5 border border-white/10 rounded-lg text-sm text-white/80 placeholder:text-zinc-600 focus:outline-none focus:border-purple-500/50"
              />
            </div>

            {/* Filter Dropdown */}
            <div className="relative">
              <button 
                onClick={() => setShowFilterMenu(!showFilterMenu)}
                className="flex items-center gap-2 h-8 px-3 bg-white/5 border border-white/10 rounded-lg text-xs font-medium text-white/70 hover:bg-white/10 transition-colors"
              >
                <Filter className="w-3 h-3" />
                <span className="capitalize">{filter}</span>
                <ChevronDown className="w-3 h-3" />
              </button>
              
              {showFilterMenu && (
                <div className="absolute top-full left-0 mt-1 w-32 bg-zinc-900 border border-white/10 rounded-lg shadow-xl overflow-hidden z-10">
                  {(['all', 'info', 'warn', 'error', 'debug'] as LogFilter[]).map(f => (
                    <button
                      key={f}
                      onClick={() => { setFilter(f); setShowFilterMenu(false); }}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-white/5 transition-colors",
                        filter === f ? "text-purple-400" : "text-white/60"
                      )}
                    >
                      <span className="capitalize">{f}</span>
                      {filter === f && <Check className="w-3 h-3" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Log Content */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 font-mono text-xs">
            {filteredLogs.map((log, i) => (
              <div 
                key={i} 
                className={cn(
                  "flex gap-2 py-1.5 px-2 rounded hover:bg-white/[0.02] group border-l-2",
                  log.level === 'info' && "border-blue-500/50",
                  log.level === 'debug' && "border-purple-500/50",
                  log.level === 'warn' && "border-yellow-500/50",
                  log.level === 'error' && "border-red-500/50",
                )}
              >
                <span className="text-zinc-600 shrink-0 select-none w-16">{log.timestamp}</span>
                <span className={cn(
                  "uppercase font-bold w-10 shrink-0 select-none text-[10px] py-0.5 text-center rounded",
                  log.level === 'info' && "bg-blue-500/10 text-blue-400",
                  log.level === 'debug' && "bg-purple-500/10 text-purple-400",
                  log.level === 'warn' && "bg-yellow-500/10 text-yellow-400",
                  log.level === 'error' && "bg-red-500/10 text-red-400",
                )}>{log.level}</span>
                <div className={cn(
                  "break-all whitespace-pre-wrap flex-1",
                  log.level === 'info' && "text-zinc-300",
                  log.level === 'debug' && "text-zinc-400",
                  log.level === 'warn' && "text-yellow-200",
                  log.level === 'error' && "text-red-300",
                )}>
                  {log.message}
                  {log.data && (
                    <div className="mt-1 pl-3 border-l border-white/10 text-zinc-500 text-[10px] overflow-x-auto">
                       {Array.isArray(log.data) ? log.data.map((d, di) => (
                         <div key={di}>{typeof d === 'object' ? JSON.stringify(d, null, 2) : String(d)}</div>
                       )) : typeof log.data === 'string' ? log.data : JSON.stringify(log.data, null, 2)}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {filteredLogs.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-zinc-700 space-y-3 py-20">
                <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center">
                  <Terminal className="w-8 h-8 opacity-30" />
                </div>
                <p className="text-sm">No logs captured yet</p>
                <p className="text-xs text-zinc-600">Console output will appear here</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-white/5 bg-zinc-900/30 text-[10px] text-zinc-600">
            <span>Press <kbd className="px-1.5 py-0.5 bg-white/5 rounded text-zinc-400">F12</kbd> or <kbd className="px-1.5 py-0.5 bg-white/5 rounded text-zinc-400">Ctrl+Shift+I</kbd> to toggle</span>
            <span>{filteredLogs.length} entries</span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
