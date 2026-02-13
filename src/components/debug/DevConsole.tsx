import { useState, useEffect, useRef } from 'react';
import { X, Trash2, Copy, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Capacitor } from '@capacitor/core';

interface LogEntry {
  timestamp: Date;
  level: 'log' | 'warn' | 'error' | 'info';
  message: string;
  data?: any;
}

export function DevConsole() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'log' | 'warn' | 'error' | 'info'>('all');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Only work on mobile platforms
    if (!Capacitor.isNativePlatform()) {
      return;
    }
    
    // Intercept console methods
    // Intercept console methods
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    const originalInfo = console.info;

    console.log = (...args: any[]) => {
      originalLog(...args);
      setLogs(prev => [...prev, {
        timestamp: new Date(),
        level: 'log',
        message: args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' '),
        data: args.length === 1 ? args[0] : args
      }].slice(-500)); // Keep last 500 logs
    };

    console.warn = (...args: any[]) => {
      originalWarn(...args);
      setLogs(prev => [...prev, {
        timestamp: new Date(),
        level: 'warn',
        message: args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' '),
        data: args.length === 1 ? args[0] : args
      }].slice(-500));
    };

    console.error = (...args: any[]) => {
      originalError(...args);
      setLogs(prev => [...prev, {
        timestamp: new Date(),
        level: 'error',
        message: args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' '),
        data: args.length === 1 ? args[0] : args
      }].slice(-500));
    };

    console.info = (...args: any[]) => {
      originalInfo(...args);
      setLogs(prev => [...prev, {
        timestamp: new Date(),
        level: 'info',
        message: args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' '),
        data: args.length === 1 ? args[0] : args
      }].slice(-500));
    };

    return () => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
      console.info = originalInfo;
    };
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);
  
  // Only render on mobile platforms
  if (!Capacitor.isNativePlatform()) {
    return null;
  }

  const filteredLogs = filter === 'all' 
    ? logs 
    : logs.filter(log => log.level === filter);

  const clearLogs = () => setLogs([]);

  const copyLogs = () => {
    const text = filteredLogs.map(log => 
      `[${log.timestamp.toLocaleTimeString()}] [${log.level.toUpperCase()}] ${log.message}`
    ).join('\n');
    navigator.clipboard.writeText(text);
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error': return 'text-red-400';
      case 'warn': return 'text-yellow-400';
      case 'info': return 'text-blue-400';
      default: return 'text-gray-300';
    }
  };

  return (
    <>
      {/* Floating Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-20 right-4 z-[9999] w-14 h-14 rounded-full bg-purple-600 shadow-lg flex items-center justify-center"
      >
        <Terminal className="w-6 h-6 text-white" />
      </button>

      {/* Console Panel */}
      {isOpen && (
        <div className="fixed inset-0 z-[10000] bg-black/95 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Terminal className="w-5 h-5 text-purple-400" />
              <h3 className="text-white font-semibold">Dev Console</h3>
              <span className="text-xs text-white/50">({filteredLogs.length} logs)</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={copyLogs}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10"
              >
                <Copy className="w-4 h-4 text-white" />
              </button>
              <button
                onClick={clearLogs}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10"
              >
                <Trash2 className="w-4 h-4 text-white" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-2 p-2 border-b border-white/10 overflow-x-auto">
            {(['all', 'log', 'info', 'warn', 'error'] as const).map((level) => (
              <button
                key={level}
                onClick={() => setFilter(level)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap",
                  filter === level 
                    ? "bg-purple-600 text-white" 
                    : "bg-white/5 text-white/70"
                )}
              >
                {level.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Logs */}
          <div 
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-sm"
          >
            {filteredLogs.length === 0 ? (
              <p className="text-white/50 text-center py-8">No logs yet</p>
            ) : (
              filteredLogs.map((log, index) => (
                <div key={index} className="flex gap-2 items-start">
                  <span className="text-white/40 text-xs shrink-0">
                    {log.timestamp.toLocaleTimeString()}
                  </span>
                  <span className={cn("text-xs shrink-0", getLevelColor(log.level))}>
                    [{log.level.toUpperCase()}]
                  </span>
                  <pre className="text-white/90 whitespace-pre-wrap break-all flex-1">
                    {log.message}
                  </pre>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}
