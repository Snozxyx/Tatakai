import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
"use client";

import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Monitor, Apple, Download, X, Smartphone, Tv, DownloadCloud, CheckCircle, Shield, Sparkles, RefreshCw, Server, ExternalLink } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Navigation } from "@/components/ui/navbar";
import { FooterSection } from "@/components/ui/footer";
import { supabase } from "@/integrations/supabase/client";
import {
  useGitHubRepo,
  useAllReleases,
  platformForAsset,
  platformKeyForName,
  pickPrimaryAsset,
  formatCompact,
  formatBytes,
  firstLine,
  GITHUB_RELEASES_URL,
} from "@/lib/github";

const ALTSTORE_SOURCE_URL = "https://tatakai.me/altstore/apps.json";
const OBTAINIUM_ADD_URL =
  "https://apps.obtainium.imranr.dev/redirect?r=obtainium://add/https://github.com/snozxyx/tatakai";

const ALT_INSTALLS = [
  {
    name: "AltStore / SideStore",
    tag: "iOS",
    get description() { return uiI18n.t('app.add_our_official_source_in_altstore_sidestore_or_814fb231'); },
    actionLabel: "Add Source",
    actionHref: `altstore://source?url=${ALTSTORE_SOURCE_URL}`,
    copyValue: ALTSTORE_SOURCE_URL,
    copyLabel: "Copy source URL",
  },
  {
    name: "Obtainium",
    tag: "Android",
    get description() { return uiI18n.t('app.track_github_releases_in_obtainium_to_get_notifi_adc1e1e3'); },
    actionLabel: "Track in Obtainium",
    actionHref: OBTAINIUM_ADD_URL,
  },
  {
    name: "F-Droid",
    tag: "Android · soon",
    get description() { return uiI18n.t('app.official_f_droid_listing_is_in_preparation_submi_24d0d2c6'); },
    actionLabel: "Release notes",
    actionHref: GITHUB_RELEASES_URL,
  },
];

interface DownloadItem {
  id?: string;
  name: string;
  category: string;
  icon: any;
  description: string;
  requirements: string;
  link: string;
  comingSoon?: boolean;
  /** Phone/mobile build that is still under active development — shown as "In Progress", not downloadable. */
  inProgress?: boolean;
  versions: { version: string; date: string; size: string; notes?: string; downloadUrl?: string }[];
}

const DEFAULT_DOWNLOADS: DownloadItem[] = [
  {
    name: "Windows",
    category: "Desktop App",
    icon: Monitor,
    get description() { return uiI18n.t('app.windows_10_11_installer_exe_portable_012ff6d3'); },
    requirements: "Windows 10 or later (64-bit)",
    link: "https://github.com/snozxyx/tatakai/releases",
    versions: []
  },
  {
    name: "macOS",
    category: "Desktop App",
    icon: Apple,
    get description() { return uiI18n.t('app.apple_silicon_intel_macs_dmg_7f097b23'); },
    requirements: "macOS 11.0 Big Sur or later",
    link: "https://github.com/snozxyx/tatakai/releases",
    versions: []
  },
  {
    name: "Linux",
    category: "Desktop App",
    icon: Monitor,
    get description() { return uiI18n.t('app.appimage_debian_package_deb_e47b6b0b'); },
    requirements: "Ubuntu 20.04+, Fedora 34+, Arch",
    link: "https://github.com/snozxyx/tatakai/releases",
    versions: []
  },
  {
    name: "Android",
    category: "Mobile App",
    icon: Smartphone,
    get description() { return uiI18n.t('app.signed_developer_apk_install_directly_no_app_sto_6f1b6883'); },
    requirements: "Android 8.0 or later (64-bit)",
    link: "https://github.com/snozxyx/tatakai/releases",
    versions: []
  },
  {
    name: "Android TV",
    category: "TV App",
    icon: Tv,
    description: "Remote-first app for Android TV and Google TV. Link your account using a QR code or PIN.",
    requirements: "Android TV / Google TV 9.0 or later",
    link: GITHUB_RELEASES_URL,
    versions: [],
  },
  {
    name: "iOS",
    category: "Mobile App",
    icon: Smartphone,
    get description() { return uiI18n.t('app.unsigned_ipa_for_iphone_ipad_sideload_with_your__f0583075'); },
    requirements: "iOS 14.0 or later",
    link: "https://github.com/snozxyx/tatakai/releases",
    versions: []
  },
];

export function DownloadSection() {
  useUiTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [downloadsList, setDownloadsList] = useState<DownloadItem[]>(DEFAULT_DOWNLOADS);
  const [selectedDownload, setSelectedDownload] = useState<DownloadItem | null>(null);
  const [stats, setStats] = useState({ platforms: "—", downloads: "—", stars: "—", version: "—" });
  const sectionRef = useRef<HTMLElement>(null);

  const releases = useAllReleases();
  const repo = useGitHubRepo();

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.1 }
    );

    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  // Populate real download links + version history from GitHub Releases (snozxyx/tatakai)
  useEffect(() => {
    if (!releases || releases.length === 0) return;
    const latest = releases[0];

    setDownloadsList((prev) =>
      prev.map((item) => {
        const key = platformKeyForName(item.name);
        if (!key) return item;
        const versions = releases
          .map((rel) => {
            const asset = pickPrimaryAsset(rel.assets, key);
            if (!asset) return null;
            return {
              version: rel.tag_name.replace(/^v/i, ""),
              date: (rel.published_at || "").split("T")[0],
              size: formatBytes(asset.size),
              notes: firstLine(rel.body) || rel.name || undefined,
              downloadUrl: asset.browser_download_url,
            };
          })
          .filter(Boolean) as DownloadItem["versions"];
        const latestAsset = pickPrimaryAsset(latest.assets, key);
        return {
          ...item,
          link: latestAsset?.browser_download_url || item.link,
          versions: versions.length ? versions : item.versions,
        };
      }),
    );
  }, [releases]);

  // Real aggregate stats from GitHub (downloads, platforms, stars, latest version)
  useEffect(() => {
    if (!releases && !repo) return;
    const totalDownloads = (releases || []).reduce(
      (sum, r) => sum + r.assets.reduce((s, a) => s + (a.download_count || 0), 0),
      0,
    );
    const platformsWithBuild = new Set<string>();
    (releases || []).forEach((r) =>
      r.assets.forEach((a) => {
        const k = platformForAsset(a.name);
        if (k) platformsWithBuild.add(k);
      }),
    );
    const latestVersion = releases && releases[0]?.tag_name ? releases[0].tag_name.replace(/^v/i, "") : null;
    setStats({
      platforms: platformsWithBuild.size ? `${platformsWithBuild.size}` : "—",
      downloads: totalDownloads > 0 ? formatCompact(totalDownloads) : "—",
      stars: repo ? formatCompact(repo.stargazers_count) : "—",
      version: latestVersion ? `v${latestVersion}` : "—",
    });
  }, [releases, repo]);

  const handleDownloadClick = async (downloadItem: DownloadItem) => {
    // Record download event in Supabase if online
    try {
      await supabase.from("analytics_events").insert({
        event_type: "download_click",
        page_path: typeof window !== "undefined" ? window.location.pathname : null,
        metadata: {
          platform: downloadItem.name,
          category: downloadItem.category,
          timestamp: new Date().toISOString(),
        },
      });
    } catch {
      // Ignore if table/permissions missing
    }

    if (downloadItem.link && downloadItem.link !== "#") {
      window.open(downloadItem.link, "_blank");
    } else {
      window.open(GITHUB_RELEASES_URL, "_blank");
    }
  };

  return (
    <section id="downloads" ref={sectionRef} className="relative overflow-hidden pt-32 lg:pt-40 bg-black text-white">
      {/* Header */}
      <div className="relative z-10 text-center mb-16 px-6 lg:px-12">
        <span className={`inline-flex items-center gap-3 text-sm font-mono text-white/60 mb-8 transition-all duration-700 justify-center bg-white/5 border border-white/10 px-4 py-1.5 rounded-full ${isVisible ? "opacity-100" : "opacity-0"}`}>
          <Sparkles className="w-4 h-4 text-primary" />
          {uiI18n.t('app.official_tatakai_clients_1a888e75')}
        </span>

        <h1 className={`text-5xl md:text-7xl lg:text-[110px] font-display tracking-tight leading-[0.9] transition-all duration-1000 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          {uiI18n.t('app.get_tatakai_e325f5d4')}
          <br />
          <span className="text-white/40">{uiI18n.t('app.on_every_device_34dcc590')}</span>
        </h1>

        <p className={`mt-8 text-lg md:text-xl text-white/60 leading-relaxed max-w-xl mx-auto transition-all duration-1000 delay-100 ${isVisible ? "opacity-100" : "opacity-0"}`}>
          {uiI18n.t('app.enjoy_4k_streaming_offline_episode_downloads_mul_ab6537d7')}
        </p>
      </div>

      {/* Featured Image - Standard HTML img replacing next/image */}
      <div className={`w-full max-w-[1400px] mx-auto px-6 lg:px-12 mb-20 transition-all duration-1000 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
        <div className="relative h-64 md:h-96 lg:h-[480px] w-full overflow-hidden rounded-3xl border border-white/10 shadow-2xl bg-white/5">
          <img
            src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/connection-KeJwWPQvn6l0a7C48tCARYtNEdC92H.png"
            alt={uiI18n.t('app.tatakai_app_preview_b2a69677')}
            className="w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-80" />
          <div className="absolute bottom-8 left-8 right-8 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
            <div>
              <span className="text-xs font-mono uppercase tracking-widest text-primary font-bold">{uiI18n.t('app.cross_platform_sync_617dae35')}</span>
              <h3 className="text-2xl font-bold text-white">{uiI18n.t('app.watch_anywhere_resume_anytime_da3e3d83')}</h3>
            </div>
           
          </div>
        </div>
      </div>

      {/* Download Grid */}
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-20">
          {downloadsList.map((download, index) => {
            const Icon = download.icon;
            const isLocked = download.comingSoon || download.inProgress;
            return (
              <button
                key={download.name}
                onClick={() => !isLocked && setSelectedDownload(download)}
                disabled={isLocked}
                className={`group relative overflow-hidden p-8 border rounded-2xl transition-all duration-500 text-left ${isLocked ? "opacity-50 cursor-not-allowed bg-white/[0.02]" : "bg-white/[0.03] hover:bg-white/[0.07]"} ${hoveredIndex === index && !isLocked
                    ? "border-white/40 shadow-xl scale-[1.02]"
                    : "border-white/10 hover:border-white/30"} ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
                style={{
                  transitionDelay: `${index * 50 + 200}ms`,
                }}
                onMouseEnter={(e) => {
                  if (!isLocked) {
                    setHoveredIndex(index);
                    const rect = e.currentTarget.getBoundingClientRect();
                    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                  }
                }}
                onMouseMove={(e) => {
                  if (!isLocked) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                  }
                }}
                onMouseLeave={() => {
                  setHoveredIndex(null);
                  setMousePos(null);
                }}
              >
                {/* Cursor-following halo */}
                {hoveredIndex === index && mousePos && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 z-0 rounded-2xl"
                    style={{
                      background: `radial-gradient(240px circle at ${mousePos.x}px ${mousePos.y}px, rgba(255,255,255,0.12) 0%, transparent 70%)`,
                    }}
                  />
                )}

                {/* Category tag */}
                <span className={`absolute top-4 right-4 text-[10px] font-mono px-2.5 py-1 rounded-full border transition-colors ${hoveredIndex === index
                    ? "bg-white text-black border-white"
                    : "bg-white/10 text-white/70 border-white/10"}`}>
                  {download.category}
                </span>

                {/* Status badge — in-progress mobile builds vs coming soon */}
                {isLocked && (
                  <span className={`absolute top-4 left-4 text-xs font-mono px-2.5 py-0.5 rounded border ${download.inProgress
                      ? "bg-primary/20 text-primary border-primary/30"
                      : "bg-amber-500/20 text-amber-300 border-amber-500/30"}`}>
                    {download.inProgress ? uiI18n.t('app.in_progress_bf81443b') : uiI18n.t('app.soon_540a681e')}
                  </span>
                )}

                {/* Icon */}
                <div className={`mb-6 p-3 rounded-xl bg-white/5 border border-white/10 w-fit transition-transform ${hoveredIndex === index && !isLocked ? "scale-110 bg-white/10 text-primary" : "text-white"}`}>
                  <Icon className="w-8 h-8" />
                </div>

                {/* Content */}
                <div className="relative z-10 space-y-2">
                  <h3 className="font-bold text-xl text-white">{download.name}</h3>
                  <p className="text-sm text-white/60 leading-relaxed">{download.description}</p>
                  <p className="text-xs text-white/40 font-mono pt-2">{download.requirements}</p>
                </div>

                {/* Latest version badge */}
                {!isLocked && download.versions.length > 0 && (
                  <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between text-xs text-white/50 font-mono">
                    <span>{uiI18n.t('app.latest_v_a537a654')}{download.versions[0].version}</span>
                    <span className="text-primary font-semibold group-hover:underline flex items-center gap-1">
                      {uiI18n.t('app.download_a479c9c3')} <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                )}

                {/* Animated underline */}
                {!isLocked && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/10 overflow-hidden">
                    <div className={`h-full bg-white transition-all duration-500 ${hoveredIndex === index ? "w-full" : "w-0"}`} />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <Card className="mb-12" aria-labelledby="tatakai-server-download-title">
          <CardHeader>
            <CardTitle id="tatakai-server-download-title" className="flex items-center gap-2"><Server className="size-5" />Tatakai Server</CardTitle>
            <CardDescription>Host your own extension server and connect it to Tatakai. Get the server and setup instructions on GitHub.</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button asChild variant="outline"><a href="https://github.com/snozxyx/tatakaiserver" target="_blank" rel="noopener noreferrer">Get Tatakai Server<ExternalLink data-icon="inline-end" /></a></Button>
          </CardFooter>
        </Card>

        {/* Alternative install channels — sideload stores & open-source clients */}
        <div className="mb-20">
          <div className="flex items-end justify-between gap-4 mb-6">
            <div>
              <p className="text-xs font-mono uppercase tracking-widest text-white/40 mb-2">
                {uiI18n.t('app.sideload_open_source_92f9e3b4')}
              </p>
              <h2 className="text-2xl md:text-3xl font-display text-white">
                {uiI18n.t('app.more_ways_to_install_4cc1a51c')}
              </h2>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {ALT_INSTALLS.map((alt) => (
              <div
                key={alt.name}
                className="relative overflow-hidden p-6 border border-white/10 rounded-2xl bg-white/[0.03] hover:border-white/30 transition-all duration-500"
              >
                <span className="absolute top-4 right-4 text-[10px] font-mono px-2.5 py-1 rounded-full border bg-white/10 text-white/70 border-white/10">
                  {alt.tag}
                </span>
                <h3 className="font-bold text-lg text-white mb-2 pr-20">{alt.name}</h3>
                <p className="text-sm text-white/60 leading-relaxed mb-5">{alt.description}</p>
                <div className="flex items-center gap-3">
                  <a
                    href={alt.actionHref}
                    target={alt.actionHref.startsWith("http") ? "_blank" : undefined}
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                  >
                    {alt.actionLabel} <ArrowRight className="w-3.5 h-3.5" />
                  </a>
                  {"copyValue" in alt && alt.copyValue && (
                    <button
                      onClick={() => {
                        try {
                          void navigator.clipboard?.writeText(alt.copyValue as string);
                        } catch {
                          /* clipboard unavailable — user can long-press the link */
                        }
                      }}
                      className="text-xs font-mono text-white/50 hover:text-white border border-white/10 hover:border-white/30 rounded-full px-3 py-1.5 transition-colors"
                    >
                      {(alt as { copyLabel: string }).copyLabel}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-white/40 font-mono leading-relaxed">
            {uiI18n.t('app.source_url_for_altstore_sidestore_stikstore_79928438')} {ALTSTORE_SOURCE_URL} {uiI18n.t('app.trollstore_users_can_open_the_unsigned_ipa_from__c48a61f6')}
          </p>
        </div>

        {/* Bottom CTA section */}
        <div className={`py-16 border-t border-white/10 transition-all duration-1000 delay-500 ${isVisible ? "opacity-100" : "opacity-0"}`}>
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8 bg-white/[0.02] border border-white/10 rounded-3xl p-8 lg:p-12">
            <div>
              <h3 className="text-3xl font-display text-white mb-3">{uiI18n.t('app.ready_to_watch_tatakai_f72f031e')}</h3>
              <p className="text-white/60 max-w-md text-base leading-relaxed">
                {uiI18n.t('app.anime_playback_runs_in_the_native_app_install_it_31d79a6f')}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
              <Button
                size="lg"
                onClick={() => handleDownloadClick(downloadsList[0])}
                className="bg-white hover:bg-white/90 text-black px-8 h-14 text-base rounded-full group font-semibold shadow-lg"
              >
                <Download className="w-4 h-4 mr-2" />
                {uiI18n.t('app.download_desktop_app_305b6505')}
                <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
              </Button>
              <a href="/browse">
                <Button
                  size="lg"
                  variant="outline"
                  className="h-14 px-8 text-base rounded-full border-white/20 hover:bg-white/10 text-white font-medium"
                >
                  {uiI18n.t('app.browse_catalog_483d4cd3')}
                </Button>
              </a>
            </div>
          </div>
        </div>

        {/* Stats section */}
        <div className={`mt-12 pt-12 border-t border-white/10 pb-24 transition-all duration-1000 delay-700 ${isVisible ? "opacity-100" : "opacity-0"}`}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { value: stats.platforms, get label() { return uiI18n.t('app.supported_platforms_1a182e90'); } },
              { value: stats.downloads, get label() { return uiI18n.t('app.total_downloads_85b696f8'); } },
              { value: stats.stars, get label() { return uiI18n.t('app.github_stars_d00bd5ef'); } },
              { value: stats.version, get label() { return uiI18n.t('app.latest_version_2a2e9c3f'); } },
            ].map((stat) => (
              <div key={stat.label} className="flex flex-col">
                <span className="text-3xl md:text-4xl font-display text-white mb-1">{stat.value}</span>
                <span className="text-xs text-white/50 font-mono">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Download Dialog */}
      <Dialog open={!!selectedDownload} onOpenChange={(open) => !open && setSelectedDownload(null)}>
        <DialogContent className="max-w-md border border-white/20 bg-neutral-950/95 text-white backdrop-blur-xl rounded-2xl shadow-2xl">
          <DialogHeader className="pb-4 border-b border-white/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {selectedDownload?.icon && <selectedDownload.icon className="w-7 h-7 text-primary" />}
                <div>
                  <DialogTitle className="text-lg text-white font-bold">{selectedDownload?.name}</DialogTitle>
                  <p className="text-xs text-white/50 font-mono mt-0.5">{selectedDownload?.category}</p>
                </div>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Download Button */}
            <Button
              onClick={() => selectedDownload && handleDownloadClick(selectedDownload)}
              className="w-full bg-white hover:bg-white/90 text-black h-12 rounded-full font-bold shadow-lg text-sm"
            >
              <Download className="w-4 h-4 mr-2" />
              {uiI18n.t('app.download_for_395aac6a')} {selectedDownload?.name}
            </Button>

            {/* System Info */}
            <div className="grid grid-cols-2 gap-4 py-3 bg-white/5 rounded-xl px-4 border border-white/10">
              <div>
                <p className="text-[11px] text-white/50 font-mono mb-1">{uiI18n.t('app.system_requirements_0e1642f6')}</p>
                <p className="text-xs font-semibold text-white">{selectedDownload?.requirements}</p>
              </div>
              <div>
                <p className="text-[11px] text-white/50 font-mono mb-1">{uiI18n.t('app.latest_version_2a2e9c3f')}</p>
                <p className="text-xs font-semibold text-white">{selectedDownload?.versions[0]?.version ? uiI18n.t('app.vi18n_value_0_8bbf6534', { value0: selectedDownload.versions[0].version }) : "—"}</p>
              </div>
            </div>

            {/* Mobile install instructions */}
            {selectedDownload?.name === "Android TV" && (
              <p className="text-sm text-muted-foreground">
                Install the Android TV APK on your TV, then open tatakai.me/link on a signed-in phone or computer and approve the code displayed on the TV. The TV APK is separate from the phone app.
              </p>
            )}
            {selectedDownload?.category === "Mobile App" && (
              <div className="space-y-2 py-3 px-4 bg-amber-500/10 rounded-xl border border-amber-500/30">
                <p className="text-[11px] font-bold uppercase tracking-wider text-amber-300 font-mono">
                  {selectedDownload?.name === "Android" ? uiI18n.t('app.direct_install_486e6346') : uiI18n.t('app.unsigned_build_c68172f4')}
                </p>
                <p className="text-xs text-white/70 leading-relaxed">
                  {selectedDownload?.name === "Android"
                    ? uiI18n.t('app.download_the_apk_and_open_it_on_your_device_andr_3895708c')
                    : uiI18n.t('app.no_app_store_listing_sign_and_sideload_the_ipa_w_a2e21194')}
                </p>
              </div>
            )}

            {/* Features */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-white/50 font-mono">{uiI18n.t('app.app_highlights_4c0ed6fe')}</h4>
              <div className="space-y-2">
                <div className="flex items-center gap-2.5 text-sm text-white/80">
                  <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>{uiI18n.t('app.4k_hdr_high_bitrate_streaming_c8183de6')}</span>
                </div>
                <div className="flex items-center gap-2.5 text-sm text-white/80">
                  <DownloadCloud className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  <span>{uiI18n.t('app.offline_library_local_video_cache_c365c89f')}</span>
                </div>
                <div className="flex items-center gap-2.5 text-sm text-white/80">
                  <Shield className="w-4 h-4 text-purple-400 flex-shrink-0" />
                  <span>{uiI18n.t('app.ad_free_private_encrypted_streams_b9422b5c')}</span>
                </div>
              </div>
            </div>

            {/* Version History */}
            <div className="border-t border-white/10 pt-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-white/50 font-mono mb-3">{uiI18n.t('app.changelog_builds_f13f523b')}</h4>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {selectedDownload?.versions.map((version, idx) => (
                  <div
                    key={version.version + idx}
                    className={`p-3 rounded-xl border transition-all ${idx === 0
                        ? "bg-white/10 border-white/30"
                        : "bg-white/[0.02] border-white/10 hover:border-white/20"}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-xs font-bold text-white">v{version.version}</span>
                      <span className="text-[10px] font-mono text-white/50">{version.size}</span>
                    </div>
                    {version.notes && (
                      <p className="text-xs text-white/70 leading-relaxed mb-2">{version.notes}</p>
                    )}
                    <p className="text-[10px] text-white/40 flex items-center gap-2 font-mono">
                      <span>{version.date}</span>
                      {idx === 0 && <span className="px-1.5 py-0.5 bg-primary/20 text-primary border border-primary/30 rounded text-[9px] font-bold">{uiI18n.t('app.latest_build_4daaf853')}</span>}
                    </p>
                    {version.downloadUrl && (
                      <a
                        href={version.downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-[10px] font-mono text-primary hover:underline"
                      >
                        <Download className="w-3 h-3" /> {uiI18n.t('app.direct_download_9f5371fe')}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export default function DownloadPage() {
  useUiTranslation();
  return (
    <div className="min-h-screen bg-black text-white flex flex-col justify-between">
      <Navigation />
      <DownloadSection />
      <FooterSection />
    </div>
  );
}
