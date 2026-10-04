import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Puzzle, Shield, PackageOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSettingsModal } from '@/contexts/SettingsModalContext';
import {
  SettingsSection,
  SettingRow,
  SettingsBadge,
  SettingsEmptyState,
} from '@/components/settings/SettingsPrimitives';
import type { ExtensionManifest } from '@/pages/base/ExtensionHubPage';
import { isIOS } from '@/lib/platform/platform';

/** Install state lives per-device in localStorage — same keys the runtime and
 *  the store hooks read/write, so this is a view of that truth, not a new one. */
const SIDELOADED_KEY = 'tatakai_sideloaded_extensions';
const SIDELOAD_EVENT = 'tatakai:extension-sideloaded';

const TYPE_LABELS: Record<string, string> = {
  torrent: 'Torrent',
  onlinestream: 'Streaming',
  custom: 'Custom',
};

function readInstalled(): ExtensionManifest[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(SIDELOADED_KEY);
    const list = raw ? (JSON.parse(raw) as ExtensionManifest[]) : [];
    return Array.isArray(list) ? list.filter((item) => item?.id && item?.name) : [];
  } catch {
    return [];
  }
}

/** Extensions: installed list on this device + entry point into the full hub. */
export function ExtensionsPanel() {
  const navigate = useNavigate();
  const { closeSettings } = useSettingsModal();

  const [installed, setInstalled] = useState<ExtensionManifest[]>(() => readInstalled());
  const [loadedIds, setLoadedIds] = useState<Set<string>>(() => new Set());
  const visibleInstalled = isIOS() ? installed.filter((ext) => ext.type !== 'torrent') : installed;

  const refresh = useCallback(() => setInstalled(readInstalled()), []);

  useEffect(() => {
    refresh();
    const onStorage = (event: StorageEvent) => {
      if (event.key === SIDELOADED_KEY) refresh();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(SIDELOAD_EVENT, refresh);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(SIDELOAD_EVENT, refresh);
    };
  }, [refresh]);

  // Best-effort: ask the runtime which bundles it actually has loaded, to mark
  // installed-but-not-loaded rows. Silent when no runtime (web) — no false state.
  useEffect(() => {
    let cancelled = false;
    const runtime = (window as any).tatakaiRuntime;
    if (!runtime?.health) return;
    Promise.resolve(runtime.health())
      .then((health: any) => {
        if (cancelled) return;
        const ids: string[] = Array.isArray(health?.loadedExtensions) ? health.loadedExtensions : [];
        setLoadedIds(new Set(ids.map((id) => String(id ?? '').trim().toLowerCase())));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [installed]);

  const openHub = () => {
    navigate('/extensions');
    closeSettings();
  };

  return (
    <div className="space-y-6">
      <SettingsSection
        icon={Puzzle}
        eyebrow="Extensions"
        title="Extension Hub"
        description="Extensions add new sources, features, and customization options to Tatakai."
        action={
          <Button onClick={openHub} className="whitespace-nowrap">
            Open Extension Hub
          </Button>
        }
      >
        <div className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-xs text-muted-foreground">
          <Shield className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <span>Only verified, curated extensions from the Tatakai team are allowed to run.</span>
        </div>
      </SettingsSection>

      <SettingsSection
        icon={PackageOpen}
        eyebrow="Installed"
        title="Installed extensions"
        description="Extensions loaded on this device. Manage or add more from the Extension Hub."
      >
        {visibleInstalled.length === 0 ? (
          <SettingsEmptyState
            icon={PackageOpen}
            title="No extensions installed"
            description="Open the Extension Hub to browse and install sources."
          />
        ) : (
          <div className="divide-y divide-white/5">
            {visibleInstalled.map((ext) => {
              const isLoaded = loadedIds.size > 0 && loadedIds.has(ext.id.trim().toLowerCase());
              const showLoadState = loadedIds.size > 0;
              return (
                <SettingRow
                  key={ext.id}
                  title={ext.name}
                  description={ext.description || undefined}
                  badge={
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      {ext.type && (
                        <SettingsBadge tone="primary">{TYPE_LABELS[ext.type] ?? ext.type}</SettingsBadge>
                      )}
                      {showLoadState &&
                        (isLoaded ? (
                          <SettingsBadge tone="success">Loaded</SettingsBadge>
                        ) : (
                          <SettingsBadge tone="warning">Not loaded</SettingsBadge>
                        ))}
                    </span>
                  }
                  control={
                    <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                      v{ext.version}
                    </span>
                  }
                />
              );
            })}
          </div>
        )}
      </SettingsSection>
    </div>
  );
}
