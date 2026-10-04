import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, History, ScrollText, SlidersHorizontal } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { DesktopSettings } from '@/components/settings/DesktopSettings';
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
  { title: 'Launch at Startup', keywords: 'startup auto launch login boot', section: 'desktop' },
  { title: 'Download Location', keywords: 'download path folder location save directory', section: 'desktop' },
  { title: 'External Player', keywords: 'external player mpv vlc mpc playback', section: 'desktop' },
  { title: 'Auto-launch External Player', keywords: 'external player launch automatically always', section: 'desktop' },
  { title: 'Real-Debrid', keywords: 'debrid realdebrid real-debrid premium api token', section: 'desktop' },
  { title: 'TorBox', keywords: 'torbox debrid premium api token', section: 'desktop' },
  { title: 'Torrent Storage Location', keywords: 'torrent storage cache path location', section: 'desktop' },
  { title: 'Max Connections', keywords: 'torrent max connections peers conns', section: 'desktop' },
  { title: 'Enable UPnP', keywords: 'upnp port forward torrent', section: 'desktop' },
  { title: 'Torrent Background Behavior', keywords: 'torrent background keep running stop', section: 'desktop' },
  { title: 'Download Limit', keywords: 'download limit bandwidth speed throttle', section: 'desktop' },
  { title: 'Upload Limit', keywords: 'upload limit bandwidth speed throttle', section: 'desktop' },
  { title: 'Bandwidth Schedule', keywords: 'bandwidth schedule night owl gaming adaptive', section: 'desktop' },
  { title: 'Free Torrent Space Automatically', keywords: 'free space cleanup cache disk auto', section: 'desktop' },
  { title: 'Home Server', keywords: 'home server host share stream cloudflare', section: 'desktop' },
  { title: 'FlareSolverr', keywords: 'flaresolverr cloudflare captcha bypass challenge', section: 'desktop' },
  { title: 'Country / Region Policy', keywords: 'country region legality policy geo', section: 'desktop' },
  { title: 'Discord Rich Presence', keywords: 'discord rich presence rpc status', section: 'desktop' },
  { title: 'App Version & Updates', keywords: 'version update upgrade check release channel', section: 'desktop' },
  { title: 'System Information', keywords: 'system cpu ram memory platform electron', section: 'desktop' },
  { title: 'Changelog', keywords: 'changelog releases what new version history patch notes updates', section: 'changelog' },
  { title: 'Developer Mode', keywords: 'developer mode debug advanced', section: 'desktop' },
  { title: 'Export Application Logs', keywords: 'export logs troubleshoot developer', section: 'desktop' },
  { title: 'Runtime Diagnostics', keywords: 'runtime diagnostics events proxy', section: 'desktop' },
  { title: 'Extension Sideloading & Audit', keywords: 'sideload extension audit toko debug', section: 'desktop' },
  { title: 'WARP Routing Log', keywords: 'warp routing log route decisions', section: 'desktop' },
  { title: 'Reset Application', keywords: 'reset danger wipe clear factory', section: 'desktop' },
  { title: 'Display & Window', keywords: 'display window fullscreen titlebar chrome screen', section: 'display-window' },
  { title: 'Storage & Disk Space', keywords: 'storage disk space quota cache downloads clear', section: 'storage' },
  { title: 'Memory Profile', keywords: 'memory profile ram low balanced unlimited buffer cache footprint performance', section: 'performance' },
  { title: 'Free Memory Now', keywords: 'free memory reclaim ram gc garbage collect cache clear performance', section: 'performance' },
  { title: 'Memory Metrics', keywords: 'memory metrics rss heap performance monitor usage graph', section: 'performance' },
  { title: 'Proxy Servers', keywords: 'proxy network routing region vpn server', section: 'proxy' },
  { title: 'WARP Tunnel', keywords: 'warp cloudflare tunnel vpn privacy egress ip', section: 'warp' },
  { title: 'Extension Host Port', keywords: 'extension host port api sideload 8099', section: 'extension-port' },
  { title: 'Torrent Session History', keywords: 'torrent session history recent imports keep clear', section: 'torrent-history' },
  { title: 'Desktop Logs', keywords: 'logs diagnostics debug app.log device tail crash', section: 'desktop-logs' },
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
            title="Keep previous torrent sessions"
            description="Save recent torrent imports so you can review what was played, see blocked sessions, and reopen active sessions after a restart."
            action={
              <Switch
                checked={keepTorrentSessionHistory}
                onCheckedChange={handleKeepTorrentSessionHistoryChange}
                aria-label="Keep previous torrent sessions"
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
            title="Desktop logs"
            description="Live tail of this device's application log (userData/logs/app.log). It stays on your machine — handy when reporting an issue."
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
    [keepTorrentSessionHistory],
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
            placeholder="Search app settings — storage, proxy, updates…"
          />
        </div>
      </div>

      {query.trim() ? (
        searchResults.length === 0 ? (
          <SettingsEmptyState
            title="No settings match your search"
            description={`Nothing here matches “${query.trim()}”. Try a term like “storage”, “proxy”, or “update”.`}
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
                    {SECTION_LABELS[s.section] ?? 'App Settings'}
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
