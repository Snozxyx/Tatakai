import { useState, useEffect } from 'react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle, ShieldAlert } from 'lucide-react';
import type { CrashReport } from '@/types/admin-dashboard';

const ACKNOWLEDGED_KEY = 'acknowledged_crash_ids';

function loadAcknowledgedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(ACKNOWLEDGED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set<string>(parsed);
  } catch {
    // malformed JSON — start fresh
  }
  return new Set();
}

function saveAcknowledgedIds(ids: Set<string>): void {
  localStorage.setItem(ACKNOWLEDGED_KEY, JSON.stringify(Array.from(ids)));
}

/**
 * CrashReportPanel
 *
 * Registers a listener on `window.electron.onCrashPrevious` to receive
 * crash report objects from the desktop crash service. On mount, previously
 * acknowledged crash IDs are read from localStorage and filtered out of the
 * displayed list. Admins can acknowledge individual reports to remove them
 * from view and persist their IDs.
 *
 * Requirements: 3.2, 3.3, 3.4, 3.7
 */
export function CrashReportPanel() {
  const [crashes, setCrashes] = useState<CrashReport[]>([]);
  const [saveErrors, setSaveErrors] = useState<Set<string>>(new Set());

  useEffect(() => {
    const electron = (window as any).electron;
    if (!electron?.onCrashPrevious) return;

    const acknowledged = loadAcknowledgedIds();

    const unsubscribe = electron.onCrashPrevious((report: CrashReport) => {
      // Filter out already-acknowledged reports as they arrive
      if (acknowledged.has(report.id)) return;
      setCrashes((prev) => {
        // Deduplicate by id; keep at most 50
        if (prev.some((c) => c.id === report.id)) return prev;
        const next = [report, ...prev];
        return next.slice(0, 50);
      });
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  const handleAcknowledge = (id: string) => {
    try {
      const acknowledged = loadAcknowledgedIds();
      acknowledged.add(id);
      saveAcknowledgedIds(acknowledged);

      // Remove from displayed list on successful save
      setCrashes((prev) => prev.filter((c) => c.id !== id));
      // Clear any previous save error for this id
      setSaveErrors((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch {
      // localStorage write failed — retain the report and show inline error
      setSaveErrors((prev) => new Set(prev).add(id));
    }
  };

  const formatDate = (isoDate: string): string => {
    try {
      return new Date(isoDate).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return isoDate;
    }
  };

  const displayedCrashes = crashes.slice(0, 50);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-red-400" />
            Crash Reports
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Crash dump reports received from the desktop process during this session
          </p>
        </div>
        {displayedCrashes.length > 0 && (
          <span className="text-sm text-gray-400">
            {displayedCrashes.length} report{displayedCrashes.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Report list or empty state */}
      {displayedCrashes.length === 0 ? (
        <GlassPanel className="p-12 text-center">
          <CheckCircle className="w-12 h-12 text-green-500/60 mx-auto mb-4" />
          <p className="text-gray-400 text-sm">No crash reports detected in this session</p>
        </GlassPanel>
      ) : (
        <GlassPanel className="divide-y divide-white/10">
          {displayedCrashes.map((report) => {
            const hasSaveError = saveErrors.has(report.id);
            return (
              <div
                key={report.id}
                className="p-4 hover:bg-white/5 transition-colors duration-200"
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Report details */}
                  <div className="flex items-start gap-3 min-w-0">
                    <AlertTriangle className="w-5 h-5 text-orange-400 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-mono text-white break-all">
                        <span className="text-gray-500 text-xs mr-1">ID</span>
                        {report.id}
                      </p>
                      <p className="text-xs text-gray-400">
                        <span className="text-gray-500 mr-1">Date</span>
                        {formatDate(report.date)}
                      </p>
                      <p className="text-xs text-gray-400 break-all">
                        <span className="text-gray-500 mr-1">Path</span>
                        <span className="font-mono">{report.path}</span>
                      </p>
                    </div>
                  </div>

                  {/* Acknowledge action */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {hasSaveError && (
                      <span
                        className="text-red-400"
                        title="Could not save acknowledgment"
                        aria-label="Could not save acknowledgment"
                      >
                        <AlertTriangle className="w-4 h-4" />
                      </span>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs border-white/10 hover:border-green-500/50 hover:text-green-400"
                      onClick={() => handleAcknowledge(report.id)}
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      Acknowledge
                    </Button>
                  </div>
                </div>

                {/* Inline save error message */}
                {hasSaveError && (
                  <p className="mt-2 ml-8 text-xs text-red-400">
                    Could not save acknowledgment — storage may be full. The report will reappear on next load.
                  </p>
                )}
              </div>
            );
          })}
        </GlassPanel>
      )}
    </div>
  );
}
