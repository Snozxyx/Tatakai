import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { RefreshCw, X } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

interface LogEntry {
  timestamp?: string;
  level?: LogLevel;
  message?: string;
  context?: Record<string, unknown>;
  pid?: number;
  version?: string;
  platform?: string;
}

interface LogViewerPanelProps {
  onClose?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse a raw log line (JSON string) into a LogEntry, falling back to raw text. */
function parseLine(raw: string): LogEntry & { _raw: string } {
  try {
    const parsed = JSON.parse(raw);
    return { ...parsed, _raw: raw };
  } catch {
    return { message: raw, _raw: raw };
  }
}

/** Returns a Tailwind-compatible inline colour for each log level. */
function levelColour(level?: LogLevel): string {
  switch (level) {
    case 'DEBUG': return 'rgba(156, 163, 175, 0.85)';  // grey
    case 'INFO':  return 'rgba(229, 231, 235, 1)';      // white
    case 'WARN':  return 'rgba(251, 191, 36, 1)';       // amber
    case 'ERROR': return 'rgba(248, 113, 113, 1)';      // red
    case 'FATAL': return 'rgba(239, 68, 68, 1)';        // bright red
    default:      return 'rgba(229, 231, 235, 0.7)';
  }
}

function levelBg(level?: LogLevel): string {
  switch (level) {
    case 'WARN':  return 'rgba(251, 191, 36, 0.07)';
    case 'ERROR': return 'rgba(248, 113, 113, 0.08)';
    case 'FATAL': return 'rgba(239, 68, 68, 0.12)';
    default:      return 'transparent';
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * LogViewerPanel
 *
 * On open: calls `window.electron.logTail(500)` and displays lines in a
 * virtualised list using `@tanstack/react-virtual`.
 * Lines are colour-coded by level (DEBUG grey, INFO white, WARN amber,
 * ERROR/FATAL red).
 * A refresh button re-fetches the tail on click.
 *
 * Requirements: 8.1
 */
export function LogViewerPanel({ onClose }: LogViewerPanelProps) {
  const [lines, setLines] = useState<Array<LogEntry & { _raw: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parentRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async () => {
    const electron = (window as any).electron;
    if (!electron?.logTail) {
      setError('logTail IPC not available — is this a desktop build?');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const raw: string[] | { error: string } = await electron.logTail(500);
      if (Array.isArray(raw)) {
        setLines(raw.map(parseLine));
      } else if (raw && typeof (raw as any).error === 'string') {
        setError((raw as any).error);
      }
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 10,
  });

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      role="dialog"
      aria-label="Log Viewer"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#0f0f1a',
        color: '#e5e7eb',
        fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
        fontSize: 12,
        borderRadius: 8,
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          background: 'rgba(255,255,255,0.04)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          flexShrink: 0,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 13, letterSpacing: '0.02em' }}>
          Application Logs
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={fetchLogs}
            disabled={loading}
            aria-label="Refresh logs"
            style={{
              background: 'none',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 6,
              color: '#e5e7eb',
              cursor: loading ? 'not-allowed' : 'pointer',
              padding: '4px 8px',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              opacity: loading ? 0.5 : 1,
              fontSize: 11,
            }}
          >
            <RefreshCw
              size={12}
              style={{ animation: loading ? 'spin 1s linear infinite' : undefined }}
            />
            Refresh
          </button>
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Close log viewer"
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.5)',
                cursor: 'pointer',
                padding: 4,
                display: 'flex',
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      {error ? (
        <div style={{ padding: 16, color: '#f87171' }}>{error}</div>
      ) : lines.length === 0 && !loading ? (
        <div style={{ padding: 16, color: 'rgba(255,255,255,0.4)' }}>No log entries found.</div>
      ) : (
        <div
          ref={parentRef}
          style={{ flex: 1, overflow: 'auto' }}
          aria-live="polite"
          aria-label="Log entries"
        >
          <div
            style={{
              height: virtualizer.getTotalSize(),
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualItems.map((virtualRow) => {
              const entry = lines[virtualRow.index];
              const colour = levelColour(entry.level as LogLevel);
              const bg = levelBg(entry.level as LogLevel);

              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                    padding: '3px 12px',
                    background: bg,
                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                    display: 'flex',
                    gap: 8,
                    alignItems: 'flex-start',
                    color: colour,
                    lineHeight: 1.5,
                  }}
                >
                  {/* Timestamp */}
                  {entry.timestamp && (
                    <span style={{ color: 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {entry.timestamp.replace('T', ' ').replace('Z', '').slice(0, 23)}
                    </span>
                  )}
                  {/* Level badge */}
                  {entry.level && (
                    <span
                      style={{
                        fontWeight: 700,
                        minWidth: 40,
                        flexShrink: 0,
                        color: colour,
                        textTransform: 'uppercase',
                      }}
                    >
                      {entry.level}
                    </span>
                  )}
                  {/* Message */}
                  <span style={{ wordBreak: 'break-all' }}>
                    {entry.message ?? entry._raw}
                    {entry.context && (
                      <span style={{ color: 'rgba(255,255,255,0.35)', marginLeft: 6 }}>
                        {JSON.stringify(entry.context)}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Spin keyframes — injected via style tag */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

export default LogViewerPanel;
