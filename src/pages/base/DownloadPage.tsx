"use client";

import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Monitor, Apple, Download, X, Smartphone, DownloadCloud, CheckCircle, Shield, Sparkles, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Navigation } from "@/components/ui/navbar";
import { FooterSection } from "@/components/ui/footer";
import { supabase } from "@/integrations/supabase/client";

interface DownloadItem {
  id?: string;
  name: string;
  category: string;
  icon: any;
  description: string;
  requirements: string;
  link: string;
  comingSoon?: boolean;
  versions: { version: string; date: string; size: string; notes?: string }[];
}

const DEFAULT_DOWNLOADS: DownloadItem[] = [
  {
    name: "Windows",
    category: "Desktop App",
    icon: Monitor,
    description: "Windows 10 / 11 Installer (.exe & Portable)",
    requirements: "Windows 10 or later (64-bit)",
    link: "https://github.com/snozxyx/tatakai/releases",
    versions: [
      { version: "5.2.0", date: "2025-01-20", size: "85 MB", notes: "Latest release with high performance streaming and native electron integration." },
      { version: "5.1.0", date: "2025-01-05", size: "82 MB", notes: "Improved torrent engine and background downloading." },
    ]
  },
  {
    name: "macOS",
    category: "Desktop App",
    icon: Apple,
    description: "Apple Silicon & Intel Macs (.dmg)",
    requirements: "macOS 11.0 Big Sur or later",
    link: "https://github.com/snozxyx/tatakai/releases",
    versions: [
      { version: "5.2.0", date: "2025-01-20", size: "88 MB", notes: "Universal binary supporting M1/M2/M3 and Intel CPUs." },
    ]
  },
  {
    name: "Linux",
    category: "Desktop App",
    icon: Monitor,
    description: "AppImage & Debian Package (.deb)",
    requirements: "Ubuntu 20.04+, Fedora 34+, Arch",
    link: "https://github.com/snozxyx/tatakai/releases",
    versions: [
      { version: "5.2.0", date: "2025-01-20", size: "79 MB", notes: "Includes hardware acceleration and MPV player backend support." },
    ]
  },
  {
    name: "Android",
    category: "Mobile App",
    icon: Smartphone,
    description: "APK / Google Play Store",
    requirements: "Android 8.0 or later",
    link: "https://github.com/snozxyx/tatakai/releases",
    versions: [
      { version: "5.2.0", date: "2025-01-18", size: "45 MB", notes: "Native mobile UI with offline video downloads and PIP mode." },
    ]
  },
  {
    name: "iOS",
    category: "Mobile App",
    icon: Smartphone,
    description: "TestFlight / App Store",
    requirements: "iOS 14.0 or later",
    link: "#",
    comingSoon: true,
    versions: []
  },
];

export function DownloadSection() {
  const [isVisible, setIsVisible] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [downloadsList, setDownloadsList] = useState<DownloadItem[]>(DEFAULT_DOWNLOADS);
  const [selectedDownload, setSelectedDownload] = useState<DownloadItem | null>(null);
  const [stats, setStats] = useState({ downloads: "50M+", activeUsers: "120K+", rating: "4.9★", platforms: "5+" });
  const [isLoadingSupabase, setIsLoadingSupabase] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

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

  // Fetch admin update policies from Supabase to keep download builds in sync with Supabase Admin Panel
  useEffect(() => {
    const fetchSupabaseUpdatePolicies = async () => {
      setIsLoadingSupabase(true);
      try {
        const { data: policies, error } = await supabase
          .from("update_policies")
          .select("*")
          .eq("active", true)
          .order("published_at", { ascending: false });

        if (!error && policies && policies.length > 0) {
          // Merge Supabase update policies with defaults
          const stablePolicy = policies.find((p: any) => p.channel === "stable") || policies[0];
          if (stablePolicy && stablePolicy.target_version) {
            const formattedDate = new Date(stablePolicy.published_at || Date.now()).toISOString().split("T")[0];
            setDownloadsList((prev) =>
              prev.map((item) => {
                if (!item.comingSoon) {
                  return {
                    ...item,
                    versions: [
                      {
                        version: stablePolicy.target_version,
                        date: formattedDate,
                        size: item.name === "Android" ? "45 MB" : "85 MB",
                        notes: stablePolicy.notes || `Admin update policy for ${stablePolicy.channel} channel`,
                      },
                      ...item.versions,
                    ],
                  };
                }
                return item;
              })
            );
          }
        }
      } catch (err) {
        console.warn("Could not load update policies from Supabase:", err);
      } finally {
        setIsLoadingSupabase(false);
      }
    };

    fetchSupabaseUpdatePolicies();
  }, []);

  const handleDownloadClick = async (downloadItem: DownloadItem) => {
    // Record download event in Supabase if online
    try {
      await supabase.from("analytics_events").insert({
        event_type: "download_click",
        event_data: {
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
      window.open("https://github.com/snozxyx/tatakai/releases", "_blank");
    }
  };

  return (
    <section id="downloads" ref={sectionRef} className="relative overflow-hidden pt-32 lg:pt-40 bg-black text-white">
      {/* Header */}
      <div className="relative z-10 text-center mb-16 px-6 lg:px-12">
        <span className={`inline-flex items-center gap-3 text-sm font-mono text-white/60 mb-8 transition-all duration-700 justify-center bg-white/5 border border-white/10 px-4 py-1.5 rounded-full ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}>
          <Sparkles className="w-4 h-4 text-primary" />
          Official Tatakai Clients
        </span>

        <h1 className={`text-5xl md:text-7xl lg:text-[110px] font-display tracking-tight leading-[0.9] transition-all duration-1000 ${
          isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        }`}>
          Get Tatakai
          <br />
          <span className="text-white/40">on every device.</span>
        </h1>

        <p className={`mt-8 text-lg md:text-xl text-white/60 leading-relaxed max-w-xl mx-auto transition-all duration-1000 delay-100 ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}>
          Enjoy 4K streaming, offline episode downloads, multi-language audio/subtitles, and community extension support across desktop and mobile.
        </p>
      </div>

      {/* Featured Image - Standard HTML img replacing next/image */}
      <div className={`w-full max-w-[1400px] mx-auto px-6 lg:px-12 mb-20 transition-all duration-1000 ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      }`}>
        <div className="relative h-64 md:h-96 lg:h-[480px] w-full overflow-hidden rounded-3xl border border-white/10 shadow-2xl bg-white/5">
          <img
            src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/connection-KeJwWPQvn6l0a7C48tCARYtNEdC92H.png"
            alt="Tatakai App Preview"
            className="w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-80" />
          <div className="absolute bottom-8 left-8 right-8 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
            <div>
              <span className="text-xs font-mono uppercase tracking-widest text-primary font-bold">Cross-Platform Sync</span>
              <h3 className="text-2xl font-bold text-white">Watch anywhere, resume anytime</h3>
            </div>
            <span className="text-xs text-white/50 font-mono bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
              Synced with Supabase Cloud
            </span>
          </div>
        </div>
      </div>

      {/* Download Grid */}
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-20">
          {downloadsList.map((download, index) => {
            const Icon = download.icon;
            return (
              <button
                key={download.name}
                onClick={() => !download.comingSoon && setSelectedDownload(download)}
                disabled={download.comingSoon}
                className={`group relative overflow-hidden p-8 border rounded-2xl transition-all duration-500 text-left ${
                  download.comingSoon ? "opacity-50 cursor-not-allowed bg-white/[0.02]" : "bg-white/[0.03] hover:bg-white/[0.07]"
                } ${
                  hoveredIndex === index && !download.comingSoon
                    ? "border-white/40 shadow-xl scale-[1.02]"
                    : "border-white/10 hover:border-white/30"
                } ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
                style={{
                  transitionDelay: `${index * 50 + 200}ms`,
                }}
                onMouseEnter={(e) => {
                  if (!download.comingSoon) {
                    setHoveredIndex(index);
                    const rect = e.currentTarget.getBoundingClientRect();
                    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                  }
                }}
                onMouseMove={(e) => {
                  if (!download.comingSoon) {
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
                <span className={`absolute top-4 right-4 text-[10px] font-mono px-2.5 py-1 rounded-full border transition-colors ${
                  hoveredIndex === index
                    ? "bg-white text-black border-white"
                    : "bg-white/10 text-white/70 border-white/10"
                }`}>
                  {download.category}
                </span>

                {/* Coming Soon Badge */}
                {download.comingSoon && (
                  <span className="absolute top-4 left-4 text-xs font-mono px-2.5 py-0.5 bg-amber-500/20 text-amber-300 rounded border border-amber-500/30">
                    SOON
                  </span>
                )}

                {/* Icon */}
                <div className={`mb-6 p-3 rounded-xl bg-white/5 border border-white/10 w-fit transition-transform ${
                  hoveredIndex === index && !download.comingSoon ? "scale-110 bg-white/10 text-primary" : "text-white"
                }`}>
                  <Icon className="w-8 h-8" />
                </div>

                {/* Content */}
                <div className="relative z-10 space-y-2">
                  <h3 className="font-bold text-xl text-white">{download.name}</h3>
                  <p className="text-sm text-white/60 leading-relaxed">{download.description}</p>
                  <p className="text-xs text-white/40 font-mono pt-2">{download.requirements}</p>
                </div>

                {/* Latest version badge */}
                {!download.comingSoon && download.versions.length > 0 && (
                  <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between text-xs text-white/50 font-mono">
                    <span>Latest: v{download.versions[0].version}</span>
                    <span className="text-primary font-semibold group-hover:underline flex items-center gap-1">
                      Download <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                )}

                {/* Animated underline */}
                {!download.comingSoon && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/10 overflow-hidden">
                    <div className={`h-full bg-white transition-all duration-500 ${
                      hoveredIndex === index ? "w-full" : "w-0"
                    }`} />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Bottom CTA section */}
        <div className={`py-16 border-t border-white/10 transition-all duration-1000 delay-500 ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}>
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8 bg-white/[0.02] border border-white/10 rounded-3xl p-8 lg:p-12">
            <div>
              <h3 className="text-3xl font-display text-white mb-3">Ready to watch Tatakai?</h3>
              <p className="text-white/60 max-w-md text-base leading-relaxed">
                Choose your platform above to download the native app or jump straight into web playback right in your browser.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
              <Button
                size="lg"
                onClick={() => handleDownloadClick(downloadsList[0])}
                className="bg-white hover:bg-white/90 text-black px-8 h-14 text-base rounded-full group font-semibold shadow-lg"
              >
                <Download className="w-4 h-4 mr-2" />
                Download Desktop App
                <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
              </Button>
              <a href="/browse">
                <Button
                  size="lg"
                  variant="outline"
                  className="h-14 px-8 text-base rounded-full border-white/20 hover:bg-white/10 text-white font-medium"
                >
                  Open Web Player
                </Button>
              </a>
            </div>
          </div>
        </div>

        {/* Stats section */}
        <div className={`mt-12 pt-12 border-t border-white/10 pb-24 transition-all duration-1000 delay-700 ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { value: stats.platforms, label: "Supported Platforms" },
              { value: stats.downloads, label: "Total Downloads" },
              { value: stats.rating, label: "Community Rating" },
              { value: stats.activeUsers, label: "Monthly Active Streamers" },
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
              Download for {selectedDownload?.name}
            </Button>

            {/* System Info */}
            <div className="grid grid-cols-2 gap-4 py-3 bg-white/5 rounded-xl px-4 border border-white/10">
              <div>
                <p className="text-[11px] text-white/50 font-mono mb-1">System Requirements</p>
                <p className="text-xs font-semibold text-white">{selectedDownload?.requirements}</p>
              </div>
              <div>
                <p className="text-[11px] text-white/50 font-mono mb-1">Latest Version</p>
                <p className="text-xs font-semibold text-white">v{selectedDownload?.versions[0]?.version || "5.2.0"}</p>
              </div>
            </div>

            {/* Features */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-white/50 font-mono">App Highlights</h4>
              <div className="space-y-2">
                <div className="flex items-center gap-2.5 text-sm text-white/80">
                  <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>4K HDR high-bitrate streaming</span>
                </div>
                <div className="flex items-center gap-2.5 text-sm text-white/80">
                  <DownloadCloud className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  <span>Offline library & local video cache</span>
                </div>
                <div className="flex items-center gap-2.5 text-sm text-white/80">
                  <Shield className="w-4 h-4 text-purple-400 flex-shrink-0" />
                  <span>Ad-free & private encrypted streams</span>
                </div>
              </div>
            </div>

            {/* Version History */}
            <div className="border-t border-white/10 pt-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-white/50 font-mono mb-3">Changelog & Builds</h4>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {selectedDownload?.versions.map((version, idx) => (
                  <div
                    key={version.version + idx}
                    className={`p-3 rounded-xl border transition-all ${
                      idx === 0
                        ? "bg-white/10 border-white/30"
                        : "bg-white/[0.02] border-white/10 hover:border-white/20"
                    }`}
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
                      {idx === 0 && <span className="px-1.5 py-0.5 bg-primary/20 text-primary border border-primary/30 rounded text-[9px] font-bold">Latest Build</span>}
                    </p>
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
  return (
    <div className="min-h-screen bg-black text-white flex flex-col justify-between">
      <Navigation />
      <DownloadSection />
      <FooterSection />
    </div>
  );
}
