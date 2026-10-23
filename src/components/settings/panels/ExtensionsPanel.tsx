import uiI18n from '@/lib/uiI18n';
import { ExtensionServersSettings } from '../ExtensionServersSettings';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { RemoteExtensionsPanel } from "@/components/extensions/RemoteExtensionsPanel";
import { migrateExtensionStorage } from "@/core/extensions/ecosystems";
migrateExtensionStorage();
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
const SIDELOADED_KEY = 'tatakai_extension_manifests';
const SIDELOAD_EVENT = 'tatakai:extension-installed';

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
  useUiTranslation();
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
    <><div className="space-y-6">
      <SettingsSection
        icon={Puzzle}
        eyebrow="Extensions"
        title={uiI18n.t('app.extension_hub_e58f54b8')}
        description={uiI18n.t('app.extensions_add_new_sources_features_and_customiz_c01962e6')}
        action={
          <Button onClick={openHub} className="whitespace-nowrap">
            {uiI18n.t('app.open_extension_hub_68bb8d7f')}
          </Button>
        }
      >
        <div className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-xs text-muted-foreground">
          <Shield className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <span>{uiI18n.t('app.choose_source_extensions_from_the_marketplace_or_e18d995d')}</span>
        </div>
      </SettingsSection>
 <ExtensionServersSettings />
 <RemoteExtensionsPanel />
      <SettingsSection
        icon={PackageOpen}
        eyebrow="Installed"
        title={uiI18n.t('app.installed_extensions_749ba7d5')}
        description={uiI18n.t('app.extensions_loaded_on_this_device_manage_or_add_m_c397011a')}
      >
        {visibleInstalled.length === 0 ? (
          <SettingsEmptyState
            icon={PackageOpen}
            title={uiI18n.t('app.no_extensions_installed_255fc1b6')}
            description={uiI18n.t('app.open_the_extension_hub_to_browse_and_install_sou_8f1799c7')}
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
                          <SettingsBadge tone="success">{uiI18n.t('app.loaded_6db90a0a')}</SettingsBadge>
                        ) : (
                          <SettingsBadge tone="warning">{uiI18n.t('app.not_loaded_45096619')}</SettingsBadge>
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
  </>
  );
}
