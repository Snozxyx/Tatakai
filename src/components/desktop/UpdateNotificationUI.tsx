import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Download, RefreshCw } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UpdaterEvent {
  type:
    | 'checking'
    | 'available'
    | 'not-available'
    | 'downloading'
    | 'downloaded'
    | 'mandatory-update'
    | 'error';
  info?: { version: string; releaseName?: string };
  progress?: { percent: number; transferred: number; total: number };
  dismissible?: boolean;
  message?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * UpdateNotificationUI
 *
 * Subscribes to `window.electron.onUpdaterEvent` on mount and renders:
 *  - A non-dismissible blocking modal for `mandatory-update` events (Req 5.2, 5.3)
 *  - A dismissible Sonner toast for `available` events (Req 5.5)
 *  - A download progress bar for `downloading` events
 *  - An install prompt on `downloaded` with "Restart Now" button (Req 8.5)
 *
 * Requirements: 5.2, 5.3, 5.5, 8.5
 */
export function UpdateNotificationUI() {
  const [mandatory, setMandatory] = useState<{ version: string; progress: number } | null>(null);
  const [downloaded, setDownloaded] = useState<{ version: string } | null>(null);

  useEffect(() => {
    const electron = (window as any).electron;
    if (!electron?.onUpdaterEvent) return;

    const unsubscribe = electron.onUpdaterEvent((event: UpdaterEvent) => {
      switch (event.type) {
        case 'mandatory-update': {
          // Blocking modal — user cannot dismiss (Req 5.2)
          setMandatory({ version: event.info?.version ?? 'latest', progress: 0 });
          break;
        }

        case 'available': {
          if (event.dismissible !== false) {
            // Dismissible toast (Req 5.5)
            toast('Update available', {
              description: event.info?.version
                ? `Version ${event.info.version} is ready to download.`
                : 'A new version is ready to download.',
              action: {
                label: 'Download',
                onClick: () => electron.updateDownload?.(),
              },
              duration: 12_000,
            });
          }
          break;
        }

        case 'downloading': {
          const pct = event.progress?.percent ?? 0;
          if (mandatory) {
            setMandatory((prev) => prev ? { ...prev, progress: pct } : null);
          }
          break;
        }

        case 'downloaded': {
          if (mandatory) {
            // Auto-install for mandatory updates (Req 5.3)
            setMandatory(null);
            electron.updateInstall?.();
          } else {
            setDownloaded({ version: event.info?.version ?? 'latest' });
          }
          break;
        }

        case 'error': {
          toast.error('Update error', {
            description: event.message ?? 'An error occurred while checking for updates.',
            duration: 8_000,
          });
          break;
        }

        default:
          break;
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [mandatory]);

  // ── Downloaded install prompt ──────────────────────────────────────────────

  useEffect(() => {
    if (!downloaded) return;

    toast(`Version ${downloaded.version} ready`, {
      description: 'Restart Tatakai to apply the update.',
      action: {
        label: 'Restart Now',
        onClick: () => (window as any).electron?.updateInstall?.(),
      },
      duration: Infinity,
    });

    setDownloaded(null);
  }, [downloaded]);

  // ── Mandatory update blocking modal ───────────────────────────────────────

  if (!mandatory) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mandatory-update-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(6px)',
      }}
    >
      <div
        style={{
          background: '#1a1a2e',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: 12,
          padding: '32px 40px',
          maxWidth: 420,
          width: '90%',
          textAlign: 'center',
          color: '#fff',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <AlertTriangle size={40} color="#f59e0b" />
        </div>

        <h2
          id="mandatory-update-title"
          style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}
        >
          Required Update
        </h2>

        <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: 24, lineHeight: 1.5 }}>
          Version <strong>{mandatory.version}</strong> is a required update and is being
          downloaded. Tatakai will restart automatically when complete.
        </p>

        {/* Progress bar */}
        <div
          role="progressbar"
          aria-valuenow={Math.round(mandatory.progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Download progress"
          style={{
            background: 'rgba(255,255,255,0.1)',
            borderRadius: 6,
            height: 8,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${mandatory.progress}%`,
              background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
              borderRadius: 6,
              transition: 'width 0.3s ease',
            }}
          />
        </div>

        <p style={{ marginTop: 12, color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
          <Download size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
          {Math.round(mandatory.progress)}% downloaded
        </p>
      </div>
    </div>
  );
}

export default UpdateNotificationUI;
