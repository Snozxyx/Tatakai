import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, History, ScrollText, SlidersHorizontal } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { DesktopSettings } from '@/components/settings/DesktopSettings';
import { DownloadResumeSetting } from '@/components/settings/DownloadResumeSetting';
import { TorrentSessionHistory } from '@/components/settings/TorrentSessionHistory';
import { ChangelogPanel } from '@/components/settings/panels/ChangelogPanel';
import { StorageSettingsPanel } from '@/components/settings/StorageSettingsPanel';
import { PerformanceSettingsPanel } from '@/components/settings/PerformanceSettingsPanel';
import { ProxySettingsPanel } from '@/components/settings/ProxySettingsPanel';
import { ExtensionHostPortSetting } from '@/components/settings/ExtensionHostPortSetting';
import { WarpSettingsPanel } from '@/components/settings/WarpSettingsPanel';
import { DisplayWindowPanel } from '@/components/settings/DisplayWindowPanel';
import { LogViewerPanel } from '@/components/desktop/LogViewerPanel';
import {
  SettingsEmptyState,
  SettingsSearch,
  SettingsSection,
} from '@/components/settings/SettingsPrimitives';
import {
  getLocalTorrentSessionHistoryEnabled,
  setLocalTorrentSessionHistoryEnabled,
  clearLocalTorrentSessionHistory,
} from '@/lib/localStorage';

type AppSection = {
  id: string;
  /** Search haystack: matched against the query alongside the visible title. */
  keywords: string[];
  render: () => ReactNode;
};

/** Human label for each top-level section, shown on a search-result chip. */
const SECTION_LABELS: Record<string, string> = {
  'download-resume': 'Downloads',
  desktop: 'Desktop & Playback',
  'display-window': 'Display & Window',
  storage: 'Storage',
  performance: 'Performance',
  proxy: 'Proxy',
  warp: 'WARP',
  'extension-port': 'Extensions',
  'torrent-history': 'Torrent History',
  'desktop-logs': 'Diagnostics',
  changelog: 'Changelog',
};

/** One searchable setting, mapped to the section that renders it. */
type IndexedSetting = { title: string; keywords: string; section: string };

/**
 * Flat index of individual settings so search matches a single control by name
 * (not a whole panel). Selecting a result jumps to the section holding it.
 */
const SETTING_INDEX: IndexedSetting[] = [
  { get title() { return uiI18n.t('app.resume_interrupted_downloads_56cbe23b'); }, keywords: 'resume download anime manga interrupted retry progress automatic', section: 'download-resume' },
  { get title() { return uiI18n.t('app.launch_at_startup_88d8812a'); }, keywords: 'startup auto launch login boot', section: 'desktop' },
  { get title() { return uiI18n.t('app.download_location_b82af0c9'); }, keywords: 'download path folder location save directory', section: 'desktop' },
  { get title() { return uiI18n.t('app.external_player_d6d6f3a4'); }, keywords: 'external player mpv vlc mpc playback', section: 'desktop' },
  { get title() { return uiI18n.t('app.auto_launch_external_player_5cc8c3af'); }, keywords: 'external player launch automatically always', section: 'desktop' },
  { get title() { return uiI18n.t('app.real_debrid_218eb8bc'); }, keywords: 'debrid realdebrid real-debrid premium api token', section: 'desktop' },
  { get title() { return uiI18n.t('app.torbox_d8681117'); }, keywords: 'torbox debrid premium api token', section: 'desktop' },
  { get title() { return uiI18n.t('app.torrent_storage_location_30553d7c'); }, keywords: 'torrent storage cache path location', section: 'desktop' },
  { get title() { return uiI18n.t('app.max_connections_e0cfb922'); }, keywords: 'torrent max connections peers conns', section: 'desktop' },
  { get title() { return uiI18n.t('app.enable_upnp_707344e7'); }, keywords: 'upnp port forward torrent', section: 'desktop' },
  { get title() { return uiI18n.t('app.torrent_background_behavior_cd6846dc'); }, keywords: 'torrent background keep running stop', section: 'desktop' },
  { get title() { return uiI18n.t('app.download_limit_cb698c3e'); }, keywords: 'download limit bandwidth speed throttle', section: 'desktop' },
  { get title() { return uiI18n.t('app.upload_limit_db7bc8fb'); }, keywords: 'upload limit bandwidth speed throttle', section: 'desktop' },
  { get title() { return uiI18n.t('app.bandwidth_schedule_0ab23943'); }, keywords: 'bandwidth schedule night owl gaming adaptive', section: 'desktop' },
  { get title() { return uiI18n.t('app.free_torrent_space_automatically_1a3842cc'); }, keywords: 'free space cleanup cache disk auto', section: 'desktop' },
  { get title() { return uiI18n.t('app.home_server_bf871bf0'); }, keywords: 'home server host share stream cloudflare', section: 'desktop' },
  { get title() { return uiI18n.t('app.flaresolverr_ea8e0b38'); }, keywords: 'flaresolverr cloudflare captcha bypass challenge', section: 'desktop' },
  { get title() { return uiI18n.t('app.country_region_policy_41c6c1ed'); }, keywords: 'country region legality policy geo', section: 'desktop' },
  { get title() { return uiI18n.t('app.discord_rich_presence_1ce59a08'); }, keywords: 'discord rich presence rpc status', section: 'desktop' },
  { get title() { return uiI18n.t('app.app_version_updates_19a32ff7'); }, keywords: 'version update upgrade check release channel', section: 'desktop' },
  { get title() { return uiI18n.t('app.system_information_5131fe56'); }, keywords: 'system cpu ram memory platform electron', section: 'desktop' },
  { get title() { return uiI18n.t('app.changelog_164b3d48'); }, keywords: 'changelog releases what new version history patch notes updates', section: 'changelog' },
  { get title() { return uiI18n.t('app.developer_mode_324ac722'); }, keywords: 'developer mode debug advanced', section: 'desktop' },
  { get title() { return uiI18n.t('app.export_application_logs_dd9a9c86'); }, keywords: 'export logs troubleshoot developer', section: 'desktop' },
  { get title() { return uiI18n.t('app.runtime_diagnostics_1e531b8f'); }, keywords: 'runtime diagnostics events proxy', section: 'desktop' },
  { get title() { return uiI18n.t('app.extension_sideloading_audit_19db1d35'); }, keywords: 'sideload extension audit toko debug', section: 'desktop' },
  { get title() { return uiI18n.t('app.warp_routing_log_8d56dbeb'); }, keywords: 'warp routing log route decisions', section: 'desktop' },
  { get title() { return uiI18n.t('app.reset_application_5d8a5040'); }, keywords: 'reset danger wipe clear factory', section: 'desktop' },
  { get title() { return uiI18n.t('app.display_window_92dc8206'); }, keywords: 'display window fullscreen titlebar chrome screen', section: 'display-window' },
  { get title() { return uiI18n.t('app.storage_disk_space_54f99525'); }, keywords: 'storage disk space quota cache downloads clear', section: 'storage' },
  { get title() { return uiI18n.t('app.memory_profile_75158bac'); }, keywords: 'memory profile ram low balanced unlimited buffer cache footprint performance', section: 'performance' },
  { get title() { return uiI18n.t('app.free_memory_now_806b68eb'); }, keywords: 'free memory reclaim ram gc garbage collect cache clear performance', section: 'performance' },
  { get title() { return uiI18n.t('app.memory_metrics_c504c3e4'); }, keywords: 'memory metrics rss heap performance monitor usage graph', section: 'performance' },
  { get title() { return uiI18n.t('app.proxy_servers_ed8fbf41'); }, keywords: 'proxy network routing region vpn server', section: 'proxy' },
  { get title() { return uiI18n.t('app.warp_tunnel_c3c03857'); }, keywords: 'warp cloudflare tunnel vpn privacy egress ip', section: 'warp' },
  { get title() { return uiI18n.t('app.extension_host_port_2f02acf5'); }, keywords: 'extension host port api sideload 8099', section: 'extension-port' },
  { get title() { return uiI18n.t('app.torrent_session_history_549e5787'); }, keywords: 'torrent session history recent imports keep clear', section: 'torrent-history' },
  { get title() { return uiI18n.t('app.desktop_logs_af241809'); }, keywords: 'logs diagnostics debug app.log device tail crash', section: 'desktop-logs' },
];

/**
 * App Settings (native only): one searchable list of every desktop / storage /
 * network preference. The self-framed panels (Storage, Proxy, Extension port)
 * bring their own `SettingsSection`; the torrent-history block is framed here.
 * The optimize-storage switch that used to live here was dropped — it wrote the
 * same key as the "Free Torrent Space Automatically" control inside the torrent
 * engine settings, so there were two toggles for one setting.
 */
export function AppSettingsPanel({ section }: { section?: string }) {
  useUiTranslation();
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const [pendingScroll, setPendingScroll] = useState<string | null>(null);

  const [keepTorrentSessionHistory, setKeepTorrentSessionHistory] = useState(() =>
    getLocalTorrentSessionHistoryEnabled(),
  );

  const handleKeepTorrentSessionHistoryChange = (enabled: boolean) => {
    setKeepTorrentSessionHistory(enabled);
    setLocalTorrentSessionHistoryEnabled(enabled);
    if (!enabled) clearLocalTorrentSessionHistory();
  };

  const sections = useMemo<AppSection[]>(
    () => [
      {
        id: 'desktop',
        keywords: [
          'desktop', 'general', 'startup', 'auto launch', 'autolaunch', 'download location',
          'download path', 'discord', 'rich presence', 'rpc', 'update', 'updates', 'version',
          'system', 'info', 'developer', 'dev tools', 'logs', 'diagnostics', 'runtime', 'reset',
          'danger', 'flaresolverr', 'home server', 'country', 'region', 'playback',
          'external player', 'mpv', 'vlc', 'debrid', 'torrent engine', 'bandwidth',
        ],
        render: () => <DesktopSettings />,
      },
      {
        id: 'display-window',
        keywords: [
          'display', 'window', 'fullscreen', 'full screen', 'f11', 'title bar', 'titlebar',
          'chrome', 'maximize', 'screen',
        ],
        render: () => <DisplayWindowPanel />,
      },
      {
        id: 'storage',
        keywords: ['storage', 'disk', 'space', 'cache', 'downloads', 'quota', 'limit', 'gb', 'clear', 'folder'],
        render: () => <StorageSettingsPanel />,
      },
      {
        id: 'download-resume',
        keywords: ['download', 'resume', 'interrupted', 'retry', 'anime', 'manga', 'automatic', 'progress'],
        render: () => <DownloadResumeSetting />,
      },
      {
        id: 'performance',
        keywords: [
          'performance', 'memory', 'ram', 'profile', 'low', 'balanced', 'unlimited',
          'buffer', 'cache', 'footprint', 'reclaim', 'free memory', 'gc', 'rss', 'heap', 'metrics',
        ],
        render: () => <PerformanceSettingsPanel />,
      },
      {
        id: 'proxy',
        keywords: ['proxy', 'proxies', 'network', 'tunnel', 'region', 'vpn', 'server', 'routing'],
        render: () => <ProxySettingsPanel />,
      },
      {
        id: 'warp',
        keywords: [
          'warp', 'cloudflare', 'tunnel', 'vpn', 'network', 'egress', 'proxy',
          'routing', 'privacy', 'ip', 'region',
        ],
        render: () => <WarpSettingsPanel />,
      },
      {
        id: 'extension-port',
        keywords: ['extension', 'extensions', 'port', 'host', 'api', 'sideload', '8099'],
        render: () => <ExtensionHostPortSetting />,
      },
      {
        id: 'torrent-history',
        keywords: ['torrent', 'session', 'history', 'sessions', 'recent', 'imports', 'keep', 'clear'],
        render: () => (
          <SettingsSection
            icon={History}
            eyebrow="Session History"
            title={uiI18n.t('app.keep_previous_torrent_sessions_cc35fd01')}
            description={uiI18n.t('app.save_recent_torrent_imports_so_you_can_review_wh_d6f648cc')}
            action={
              <Switch
                checked={keepTorrentSessionHistory}
                onCheckedChange={handleKeepTorrentSessionHistoryChange}
                aria-label={uiI18n.t('app.keep_previous_torrent_sessions_cc35fd01')}
              />
            }
          >
            <TorrentSessionHistory />
          </SettingsSection>
        ),
      },
      {
        id: 'desktop-logs',
        keywords: [
          'logs', 'log', 'diagnostics', 'debug', 'app.log', 'device', 'tail',
          'console', 'errors', 'crash', 'troubleshoot', 'support',
        ],
        render: () => (
          <SettingsSection
            icon={ScrollText}
            eyebrow="Diagnostics"
            title={uiI18n.t('app.desktop_logs_77ff3006')}
            description={uiI18n.t('app.live_tail_of_this_device_s_application_log_userd_50bcb26d')}
          >
            <div className="h-96">
              <LogViewerPanel />
            </div>
          </SettingsSection>
        ),
      },
      {
        id: 'changelog',
        keywords: [
          'changelog', 'changes', 'releases', 'release', 'version history', 'history',
          'what new', 'whats new', 'patch', 'notes', 'update', 'updates', 'latest', 'new features',
        ],
        render: () => <ChangelogPanel />,
      },
    ],
    [keepTorrentSessionHistory, uiI18n.language],
  );

  // Search matches individual settings (not whole panels) and shows at most 3.
  const searchResults = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];
    return SETTING_INDEX.filter((s) => {
      const haystack = `${s.title} ${s.keywords} ${SECTION_LABELS[s.section] ?? ''}`.toLowerCase();
      return tokens.every((t) => haystack.includes(t));
    }).slice(0, 3);
  }, [query]);

  const jumpToSection = (section: string) => {
    setQuery('');
    setPendingScroll(section);
  };

  // Deep-link support: scroll to the requested section on open (best-effort).
  useEffect(() => {
    if (!section) return;
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-app-section="${section}"]`);
    if (el) {
      const id = requestAnimationFrame(() => el.scrollIntoView({ block: 'start', behavior: 'smooth' }));
      return () => cancelAnimationFrame(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll to a section after a search result is chosen (query clears first).
  useEffect(() => {
    if (!pendingScroll) return;
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-app-section="${pendingScroll}"]`);
    if (el) {
      const raf = requestAnimationFrame(() => el.scrollIntoView({ block: 'start', behavior: 'smooth' }));
      setPendingScroll(null);
      return () => cancelAnimationFrame(raf);
    }
    setPendingScroll(null);
  }, [pendingScroll]);

  return (
    <div ref={containerRef} className="min-w-0 space-y-4">
      <div className="sticky -top-5 z-10 -mx-5 -mt-5 bg-background/70 px-5 pb-4 pt-5 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" />
          <SettingsSearch
            className="min-w-0 flex-1"
            value={query}
            onChange={setQuery}
            placeholder={uiI18n.t('app.search_app_settings_storage_proxy_updates_a3d1d8c2')}
          />
        </div>
      </div>

      {query.trim() ? (
        searchResults.length === 0 ? (
          <SettingsEmptyState
            title={uiI18n.t('app.no_settings_match_your_search_779f3dc6')}
            description={uiI18n.t('app.nothing_here_matches_i18n_value_0_try_a_term_lik_1876b97a', { value0: query.trim() })}
          />
        ) : (
          <div className="space-y-1.5">
            {searchResults.map((s) => (
              <button
                key={s.title}
                type="button"
                onClick={() => jumpToSection(s.section)}
                className="group flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-foreground">{s.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {SECTION_LABELS[s.section] ?? uiI18n.t('app.app_settings_09439e42')}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
              </button>
            ))}
          </div>
        )
      ) : (
        sections.map((s) => (
          <div key={s.id} data-app-section={s.id} className="scroll-mt-4">
            {s.render()}
          </div>
        ))
      )}
    </div>
  );
}
