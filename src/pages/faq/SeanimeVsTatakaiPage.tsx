import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Clapperboard,
  Cpu,
  Download,
  Equal,
  Github,
  HardDrive,
  Heart,
  Library,
  Minus,
  Play,
  Server,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { Background } from "@/components/layout/Background";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { Header } from "@/components/layout/Header";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useIsDesktopApp } from "@/hooks/ui/useIsNativeApp";
import { useIsMobile } from "@/hooks/ui/use-mobile";
import { cn } from "@/lib/utils";
import { GITHUB_REPO_URL } from "@/lib/github";

/**
 * FAQ — Tatakai vs Seanime, compared honestly.
 *
 * Data verified against Seanime v3.10.3 (Go backend, extension types, debrid/torrent clients, Nakama rooms) 
 * and Tatakai's repo specs (MPL-2.0 license, 27 built-in themes, 16 Mitsu ranks, 4-provider debrid orchestrator, 
 * trace.moe search, Capacitor + Electron shells).
 *
 * Bottom line up front: They are completely different species. Seanime is the ultimate 
 * self-hosted media server; Tatakai is the ultimate community and social tracking platform.
 */

type Edge = "tatakai" | "seanime" | "tie";

interface Dimension {
  name: string;
  tatakai: string;
  seanime: string;
  edge: Edge;
}

const DIMENSIONS: Dimension[] = [
  {
    name: "Core Identity",
    tatakai: "Social hub & tracking platform built for community feeds, custom rooms, and shared lists",
    seanime: "Self-hosted personal media server focused purely on your local files and stream setup",
    edge: "tie",
  },
  {
    name: "Open Source License",
    tatakai: "MPL-2.0 — File-level copyleft flexibility",
    seanime: "GPL-3.0 — Strong copyleft protection",
    edge: "tie",
  },
  {
    name: "Tracker Integrations",
    tatakai: "AniList + MyAnimeList + MangaBaka OAuth with seamless 2-way sync and smart ID import",
    seanime: "AniList-first; MAL support is limited to one-way progress pushes",
    edge: "tatakai",
  },
  {
    name: "Smart Recommendations",
    tatakai: "Custom hybrid engine analyzing taste profiles, collaborative similarity, and feedback loops",
    seanime: "None — relies entirely on basic AniList proxies and media relations",
    edge: "tatakai",
  },
  {
    name: "Social & Community",
    tatakai: "Rich ecosystem of feeds, forums, comments, follower graphs, polls, and live events",
    seanime: "None — limited to watch-party chat rooms",
    edge: "tatakai",
  },
  {
    name: "Profiles & Stats",
    tatakai: "Public profile cards, custom Wrapped/stats breakdowns, tier lists, and social playlists",
    seanime: "Local library metrics and standard AniList stats only",
    edge: "tatakai",
  },
  {
    name: "Ranks & Gamification",
    tatakai: "16 Mitsu ranks, collectible Chikra badges, global leaderboards, and active streaks",
    seanime: "None",
    edge: "tatakai",
  },
  {
    name: "Watch-Together Rooms",
    tatakai: "Synchronized rooms via host-streamed tunnels with live chat, countdowns, and host transfers",
    seanime: "Nakama relay rooms with shared library streaming capabilities",
    edge: "tie",
  },
  {
    name: "Video Player",
    tatakai: "Versatile Web, HLS, Torrent, Debrid, and Offline adapters with PiP and touch gestures",
    seanime: "Powerful dual-backend coordinator (web + libmpv), external player handoffs, and Anime4K shaders",
    edge: "seanime",
  },
  {
    name: "Manga & Novel Reader",
    tatakai: "Comick-inspired manga reader + dedicated light novel reader (4 providers) with custom keybinds",
    seanime: "Unified local and extension reader with automated download queues and source updates",
    edge: "tie",
  },
  {
    name: "Local Library Management",
    tatakai: "Lightweight file enumeration paired with robust offline synchronization",
    seanime: "Extremely deep — features an intelligent tolerant scanner, file watcher, and match review workflow",
    edge: "seanime",
  },
  {
    name: "Download Managers",
    tatakai: "Desktop download managers with mobile bridge support and automated downloader services",
    seanime: "Feature-rich qBittorrent/Transmission integration with advanced rules engines and dry-run simulations",
    edge: "seanime",
  },
  {
    name: "Torrent Streaming",
    tatakai: "Handled seamlessly through connected provider adapters",
    seanime: "Native torrent-to-HTTP streaming server featuring sequential downloading and smart preloading",
    edge: "seanime",
  },
  {
    name: "Debrid Integration",
    tatakai: "Real-Debrid and TorBox clients powered by an in-core 4-provider orchestrator",
    seanime: "Full abstraction layer supporting 4 major providers with instant-availability badges",
    edge: "seanime",
  },
  {
    name: "Transcoding Pipeline",
    tatakai: "Remux-focused setup utilizing direct ffmpeg/ffprobe wiring",
    seanime: "Full HLS ladder with hardware acceleration profiles, adaptive governors, and pre-transcoding",
    edge: "seanime",
  },
  {
    name: "Subtitle Support",
    tatakai: "Flexible selectors with automated VTT conversion pipelines",
    seanime: "End-to-end pipeline covering extraction, conversion, detection, and JASSUB/mpv rendering",
    edge: "seanime",
  },
  {
    name: "Extensions System",
    get tatakai() { return uiI18n.t('extensionUpdate.aTypes'); },
    seanime: "5 distinct types (torrent, manga, online stream, custom source, plugin) run via Goja VMs with a marketplace",
    edge: "tie",
  },
  {
    name: "Extension Security",
    tatakai: "Validation checks, community moderation, and kill-switches (renderer currently shares app privileges)",
    seanime: "Strict permission scopes, cryptographic hash-gated updates, and remote dev-mode blocking",
    edge: "seanime",
  },
  {
    name: "Screenshot Search",
    tatakai: "Instant frame search powered by trace.moe",
    seanime: "Not available",
    edge: "tatakai",
  },
  {
    name: "Airing Calendar",
    tatakai: "Dedicated calendar view with custom reminder alerts and push notifications",
    seanime: "Schedule view with quick filters for missed episodes and upcoming sequels",
    edge: "tie",
  },
  {
    name: "Custom Themes",
    tatakai: "27 gorgeous built-in themes plus community extension themes",
    seanime: "Custom themes supported via custom CSS overrides",
    edge: "tie",
  },
  {
    name: "Offline Experience",
    tatakai: "Full media file support across platforms backed by Dexie, desktop, and mobile shells",
    seanime: "Snapshot synchronization queues, Tenji offline client, and mobile server support",
    edge: "seanime",
  },
  {
    name: "Supported Platforms",
    tatakai: "Web (PWA) + Desktop (Electron) + Mobile (Capacitor for iOS & Android)",
    seanime: "Web + Denshi desktop client (Electron + mpv) + Tenji mobile app + dedicated mobile server",
    edge: "tatakai",
  },
  {
    name: "Self-Hosting Options",
    tatakai: "Partial setup (home server / Docker API; core requires managed Supabase backend)",
    seanime: "Fully self-hosted — single standalone binary with config.toml, SQLite, and Docker support",
    edge: "seanime",
  },
  {
    name: "Multi-User Support",
    tatakai: "Built-in user accounts, distinct roles, and individual tracking lists",
    seanime: "Single-user server architecture (though password-gated sharing is supported)",
    edge: "tatakai",
  },
  {
    name: "Localization (i18n)",
    tatakai: "Bilingual support for English and Japanese",
    seanime: "English only (no multi-language roadmap planned)",
    edge: "tatakai",
  },
  {
    name: "Content Stance",
    tatakai: "Aggregated catalogs accessed via API and extensions without direct in-app scraping",
    seanime: "Zero hosted content — strictly local files paired with your choice of independent extensions",
    edge: "tie",
  },
];

interface ScoreBar {
  label: string;
  icon: typeof Users;
  tatakai: number;
  seanime: number;
  note: string;
}

const SCOREBOARD: ScoreBar[] = [
  { get label() { return uiI18n.t('app.community_social_64787f21'); }, icon: Users, tatakai: 100, seanime: 8, note: "Feeds, forums & social rooms vs basic party chat" },
  { get label() { return uiI18n.t('app.tracking_sync_9b6e2576'); }, icon: Check, tatakai: 95, seanime: 55, note: "3 trackers with 2-way sync vs AniList-first approach" },
  { get label() { return uiI18n.t('app.discovery_taste_f77f7238'); }, icon: Heart, tatakai: 90, seanime: 35, note: "Hybrid taste engine vs basic relation proxies" },
  { get label() { return uiI18n.t('app.playback_depth_00905bff'); }, icon: Play, tatakai: 62, seanime: 95, note: "Versatile adapters vs robust mpv coordinator & shaders" },
  { get label() { return uiI18n.t('app.local_library_a4b3e0f3'); }, icon: Library, tatakai: 40, seanime: 95, note: "Lightweight sync vs deep tolerant file scanning" },
  { get label() { return uiI18n.t('app.server_power_a5ea3a1f'); }, icon: Server, tatakai: 45, seanime: 100, note: "Cloud-backed platform vs single-binary self-hosting" },
  { get label() { return uiI18n.t('app.downloads_debrid_a3c2505d'); }, icon: Download, tatakai: 60, seanime: 92, note: "Handy managers vs advanced rules engine & torrent core" },
  { get label() { return uiI18n.t('app.everywhere_apps_47c60056'); }, icon: Clapperboard, tatakai: 92, seanime: 60, note: "Polished PWA & Capacitor apps vs Denshi & Tenji" },
];

const ROADMAP: Array<{ tier: string; items: string[]; cls: string }> = [
  {
    tier: "P0 — Playback Depth",
    items: ["Torrent-stream server mode", "Capability probe in SourcePanel", "Source auto-select profiles"],
    cls: "border-destructive/30 bg-destructive/[0.04]",
  },
  {
    tier: "P1 — Trust & Social Playback",
    items: ["Extension permission scopes & update diffs", "Playground sandbox & staged installs", "Binge queue engine & airing notification loop"],
    cls: "border-amber-500/30 bg-amber-500/[0.04]",
  },
  {
    tier: "P2 — Everywhere Extras",
    items: ["External player handoff", "Chromecast sender support", "Full Discord Rich Presence", "Theme sharing marketplace", "Diagnostics export tool"],
    cls: "border-emerald-500/30 bg-emerald-500/[0.04]",
  },
];

function EdgeBadge({ edge }: { edge: Edge }) {
  useUiTranslation();
  if (edge === "tatakai")
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-primary border border-primary/20">
        <Check className="h-3 w-3" /> {uiI18n.t('app.tatakai_wins_07833704')}
      </span>
    );
  if (edge === "seanime")
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white/90 border border-white/10">
        <X className="h-3 w-3" /> {uiI18n.t('app.seanime_wins_71c749fc')}
      </span>
    );
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/5 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground border border-white/5">
      <Equal className="h-3 w-3" /> {uiI18n.t('app.tie_different_3d9bde33')}
    </span>
  );
}

export default function SeanimeVsTatakaiPage() {
  useUiTranslation();
  const isDesktopApp = useIsDesktopApp();
  const isMobile = useIsMobile();
  const reduceMotion = useReducedMotion();

  const tally = useMemo(() => {
    let t = 0;
    let s = 0;
    let tie = 0;
    for (const d of DIMENSIONS) {
      if (d.edge === "tatakai") t += 1;
      else if (d.edge === "seanime") s += 1;
      else tie += 1;
    }
    return { t, s, tie, total: DIMENSIONS.length };
  }, []);

  return (
    <>
      <Helmet>
        <title>{uiI18n.t('app.tatakai_vs_seanime_honest_feature_comparison_e5492f2c')}</title>
        <meta
          name="description"
          content="An honest, verified comparison between Tatakai (community tracking platform, MPL-2.0) and Seanime (self-hosted media server, GPL-3.0). Complete dimension breakdown and scoreboard."
        />
        <link rel="canonical" href="https://tatakai.me/faq/seanime-vs-tatakai" />
        <meta property="og:title" content="Tatakai vs Seanime — Honest Feature Comparison" />
        <meta
          property="og:description"
          content="Two different approaches to anime tech: the community tracking platform vs the personal media server compared feature by feature."
        />
        <meta property="og:type" content="article" />
      </Helmet>

      <div className="min-h-screen bg-background text-foreground overflow-x-hidden selection:bg-primary/30">
        <Background />
        {!isMobile && <Sidebar />}

        <main
          className={cn(
            "relative z-10 mx-auto max-w-[1100px] pb-28 pt-10",
            isDesktopApp ? "px-6" : "px-6 md:pl-32",
          )}
        >
          <Link
            to="/welcome"
            className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground motion-safe:active:scale-[0.98]"
          >
            <ArrowLeft className="h-4 w-4" /> {uiI18n.t('app.back_to_welcome_ba6df5aa')}
          </Link>

          {/* ── Hero Section ── */}
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="motion-reduce:animate-none"
          >
            <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-primary border border-primary/20">
              {uiI18n.t('app.honest_developer_faq_a6cda0a7')}
            </span>
            <h1 className="font-display mt-4 text-4xl font-black tracking-tight sm:text-6xl">
              {uiI18n.t('app.tatakai_28bda6bd')} <span className="text-muted-foreground font-light">{uiI18n.t('app.vs_691a77cd')}</span> {uiI18n.t('app.seanime_7dcb7ceb')}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              {uiI18n.t('app.they_are_built_for_entirely_different_workflows__97a791c5')}{" "}
              <span className="font-semibold text-foreground">{uiI18n.t('app.local_personal_media_server_13839447')}</span>{uiI18n.t('app.while_tatakai_is_engineered_to_be_your_6bd18882')}{" "}
              <span className="font-semibold text-foreground">{uiI18n.t('app.social_tracking_platform_and_community_home_5e89b97a')}</span>{uiI18n.t('app.we_ve_checked_every_single_feature_against_seani_e75bc4b4')}
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5 text-xs">
              <span className="rounded-full border border-white/10 bg-white/5 px-3.5 py-2 font-medium text-white/80">
                {uiI18n.t('app.seanime_v3_10_3_gpl_3_0_go_react_aa5271e5')}
              </span>
              <span className="rounded-full border border-primary/30 bg-primary/10 px-3.5 py-2 font-semibold text-primary">
                {uiI18n.t('app.tatakai_v6_1_0_mpl_2_0_typescript_supabase_4b3a54f7')}
              </span>
            </div>
          </motion.div>

          {/* ── Verdict Cards ── */}
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.45, ease: "easeOut" }}
            >
              <GlassPanel className="h-full border-primary/30 bg-gradient-to-b from-primary/[0.08] to-transparent p-7 shadow-xl">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-primary/20 p-2.5 text-primary">
                    <Users className="h-5 w-5" />
                  </div>
                  <h2 className="font-display text-xl font-black">{uiI18n.t('app.go_with_tatakai_if_f3fbbca2')}</h2>
                </div>
                <ul className="mt-5 space-y-3.5 text-sm leading-relaxed text-muted-foreground">
                  {[
                    "You want tracking, feeds, discussions, and friends all in one connected space.",
                    "You prefer using your mobile phone or web browser just as much as your desktop.",
                    "You love recommendation engines that actually learn your unique anime and manga taste.",
                    "You enjoy unlocking community ranks, badges, and leaderboards as you complete series.",
                  ].map((line, i) => (
                    <li key={i} className="flex gap-3">
                      <div className="mt-1 h-2 w-2 rounded-full bg-primary shrink-0" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </GlassPanel>
            </motion.div>

            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.45, ease: "easeOut", delay: 0.08 }}
            >
              <GlassPanel className="h-full border-white/10 bg-gradient-to-b from-white/[0.03] to-transparent p-7 shadow-xl">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-white/10 p-2.5 text-white/80">
                    <HardDrive className="h-5 w-5" />
                  </div>
                  <h2 className="font-display text-xl font-black">{uiI18n.t('app.go_with_seanime_if_905e0281')}</h2>
                </div>
                <ul className="mt-5 space-y-3.5 text-sm leading-relaxed text-muted-foreground">
                  {[
                    "You manage a large local anime and manga hard-drive library and want a centralized server.",
                    "You want native torrent streaming, advanced transcoding pipelines, and mpv video player integration.",
                    "You prefer self-hosting everything yourself via a single lightweight binary or Docker container.",
                    "You only need direct AniList tracking with zero interest in social feeds or community features.",
                  ].map((line, i) => (
                    <li key={i} className="flex gap-3">
                      <div className="mt-1 h-2 w-2 rounded-full bg-white/40 shrink-0" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </GlassPanel>
            </motion.div>
          </div>

          {/* ── Scoreboard Section ── */}
          <section className="mt-16" aria-label={uiI18n.t('app.scoreboard_5fbd163f')}>
            <div className="mb-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <div>
                <h2 className="font-display flex items-center gap-2.5 text-2xl font-black tracking-tight">
                  <Trophy className="h-6 w-6 text-primary" /> {uiI18n.t('app.feature_scoreboard_559f1854')}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {uiI18n.t('app.tatakai_leads_in_940c3aad')} {tally.t} {uiI18n.t('app.categories_seanime_leads_in_11bacfb4')} {tally.s}{uiI18n.t('app.and_8278d2ad')} {tally.tie} {uiI18n.t('app.are_tied_across_8d7098c4')} {tally.total} {uiI18n.t('app.dimensions_checked_fd651955')}
                </p>
              </div>
              <div className="flex items-center gap-5 text-xs font-bold">
                <span className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-primary shadow-sm shadow-primary/50" /> {uiI18n.t('app.tatakai_28bda6bd')}
                </span>
                <span className="flex items-center gap-2 text-muted-foreground">
                  <span className="h-3 w-3 rounded-full bg-white/30" /> {uiI18n.t('app.seanime_7dcb7ceb')}
                </span>
              </div>
            </div>

            <GlassPanel className="space-y-6 p-6 sm:p-8">
              {SCOREBOARD.map((row, i) => (
                <div key={row.label} className="group">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2.5 text-sm font-bold">
                      <row.icon className="h-4 w-4 text-primary" />
                      {row.label}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      <span className="font-black text-primary">{row.tatakai}%</span>
                      {uiI18n.t('app.vs_691a77cd')}
                      <span className="font-bold text-white/70">{row.seanime}%</span>
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.06] p-0.5">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70"
                        initial={reduceMotion ? false : { width: 0 }}
                        whileInView={{ width: `${row.tatakai}%` }}
                        viewport={{ once: true, margin: "-40px" }}
                        transition={{ duration: 0.7, delay: i * 0.04, ease: "easeOut" }}
                      />
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/[0.03] p-0.5">
                      <motion.div
                        className="h-full rounded-full bg-white/30"
                        initial={reduceMotion ? false : { width: 0 }}
                        whileInView={{ width: `${row.seanime}%` }}
                        viewport={{ once: true, margin: "-40px" }}
                        transition={{ duration: 0.7, delay: i * 0.04 + 0.06, ease: "easeOut" }}
                      />
                    </div>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground/80">{row.note}</p>
                </div>
              ))}
            </GlassPanel>
          </section>

          {/* ── Full Chart Section ── */}
          <section className="mt-16" aria-label={uiI18n.t('app.full_comparison_chart_f1e187ef')}>
            <h2 className="font-display flex items-center gap-2.5 text-2xl font-black tracking-tight">
              <Library className="h-6 w-6 text-primary" /> {uiI18n.t('app.dimension_by_dimension_breakdown_d3e71db9')}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {uiI18n.t('app.ties_indicate_different_design_philosophies_rath_7d54ebef')}
            </p>

            {/* Desktop Table View */}
            <GlassPanel className="mt-6 hidden overflow-hidden p-0 md:block">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="sticky top-0 z-20">
                  <tr className="border-b border-white/10 bg-black/60 text-[11px] font-black uppercase tracking-[0.16em] backdrop-blur-xl">
                    <th className="px-6 py-4 text-muted-foreground">{uiI18n.t('app.category_a3c686e7')}</th>
                    <th className="px-6 py-4 text-primary">{uiI18n.t('app.tatakai_28bda6bd')}</th>
                    <th className="px-6 py-4 text-white/80">{uiI18n.t('app.seanime_7dcb7ceb')}</th>
                    <th className="px-6 py-4 text-right text-muted-foreground">{uiI18n.t('app.advantage_5bf78ecb')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {DIMENSIONS.map((d, i) => (
                    <motion.tr
                      key={d.name}
                      initial={reduceMotion ? false : { opacity: 0 }}
                      whileInView={{ opacity: 1 }}
                      viewport={{ once: true, margin: "-20px" }}
                      transition={{ duration: 0.3 }}
                      className={cn(
                        "transition-colors hover:bg-white/[0.03]",
                        i % 2 === 1 && "bg-white/[0.01]",
                      )}
                    >
                      <td className="px-6 py-4 font-bold text-foreground/90">{d.name}</td>
                      <td className="px-6 py-4 leading-relaxed text-muted-foreground">{d.tatakai}</td>
                      <td className="px-6 py-4 leading-relaxed text-muted-foreground">{d.seanime}</td>
                      <td className="px-6 py-4 text-right">
                        <EdgeBadge edge={d.edge} />
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </GlassPanel>

            {/* Mobile Card View */}
            <div className="mt-6 space-y-4 md:hidden">
              {DIMENSIONS.map((d) => (
                <GlassPanel key={d.name} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-black text-foreground">{d.name}</h3>
                    <EdgeBadge edge={d.edge} />
                  </div>
                  <div className="mt-4 space-y-3 text-[13px] leading-relaxed">
                    <div className="rounded-lg bg-primary/[0.04] p-3 border border-primary/10">
                      <span className="font-bold text-primary block mb-1">{uiI18n.t('app.tatakai_28bda6bd')}</span>
                      <span className="text-muted-foreground">{d.tatakai}</span>
                    </div>
                    <div className="rounded-lg bg-white/[0.02] p-3 border border-white/5">
                      <span className="font-bold text-white/85 block mb-1">{uiI18n.t('app.seanime_7dcb7ceb')}</span>
                      <span className="text-muted-foreground">{d.seanime}</span>
                    </div>
                  </div>
                </GlassPanel>
              ))}
            </div>
          </section>

          {/* ── Roadmap / Borrowings Section ── */}
          <section className="mt-16" aria-label={uiI18n.t('app.roadmap_borrowings_1075ea34')}>
            <h2 className="font-display flex items-center gap-2.5 text-2xl font-black tracking-tight">
              <Cpu className="h-6 w-6 text-primary" /> {uiI18n.t('app.what_tatakai_is_borrowing_4a3959a1')}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {uiI18n.t('app.credit_where_credit_is_due_we_are_actively_bring_48523135')}
            </p>
            <div className="mt-6 grid gap-5 md:grid-cols-3">
              {ROADMAP.map((lane, i) => (
                <motion.div
                  key={lane.tier}
                  initial={reduceMotion ? false : { opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.4, delay: i * 0.08, ease: "easeOut" }}
                >
                  <GlassPanel className={cn("h-full p-6 border", lane.cls)}>
                    <h3 className="text-sm font-black text-foreground">{lane.tier}</h3>
                    <ul className="mt-4 space-y-2.5 text-[13px] leading-relaxed text-muted-foreground">
                      {lane.items.map((item) => (
                        <li key={item} className="flex gap-2.5">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </GlassPanel>
                </motion.div>
              ))}
            </div>
          </section>

          {/* ── Closing Call to Action ── */}
          <motion.section
            className="mt-16"
            aria-label={uiI18n.t('app.why_tatakai_8a938622')}
            initial={reduceMotion ? false : { opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <GlassPanel className="relative overflow-hidden border-primary/30 bg-gradient-to-b from-primary/[0.08] via-background to-background p-8 text-center sm:p-14 shadow-2xl">
              <div
                aria-hidden
                className="pointer-events-none absolute -top-32 left-1/2 h-64 w-[40rem] max-w-none -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]"
              />
              <BookOpen className="mx-auto h-12 w-12 text-primary" />
              <h2 className="font-display mx-auto mt-5 max-w-2xl text-3xl font-black tracking-tight sm:text-4xl">
                {uiI18n.t('app.tatakai_is_built_for_the_community_53eb5eb6')}
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                {uiI18n.t('app.tracking_lists_are_table_stakes_every_app_can_ma_c7d26923')} <span className="font-semibold text-foreground">{uiI18n.t('app.around_405928ee')}</span> {uiI18n.t('app.the_list_watch_rooms_shared_with_friends_recomme_9a1215ac')}
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3.5">
                <Link
                  to="/download"
                  className="inline-flex items-center gap-2.5 rounded-full bg-primary px-7 py-3.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-[background-color,transform] hover:brightness-110 motion-safe:active:scale-[0.97]"
                >
                  <Download className="h-4 w-4" /> {uiI18n.t('app.get_tatakai_e325f5d4')}
                </Link>
                <Link
                  to="/community"
                  className="inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/5 px-7 py-3.5 text-sm font-bold transition-[background-color,color,transform] hover:bg-white/10 motion-safe:active:scale-[0.97]"
                >
                  <Users className="h-4 w-4" /> {uiI18n.t('app.join_community_207f07a9')} <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href={GITHUB_REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2.5 rounded-full border border-white/10 px-7 py-3.5 text-sm font-bold text-muted-foreground transition-[color,transform] hover:text-foreground motion-safe:active:scale-[0.97]"
                >
                  <Github className="h-4 w-4" /> {uiI18n.t('app.star_on_github_9becc508')}
                </a>
              </div>
              <p className="mt-8 text-[11px] leading-relaxed text-muted-foreground/60 max-w-xl mx-auto">
                {uiI18n.t('app.verified_against_seanime_v3_10_3_source_code_go__025dc702')}
              </p>
            </GlassPanel>
          </motion.section>
        </main>

        <MobileNav />
      </div>
    </>
  );
}