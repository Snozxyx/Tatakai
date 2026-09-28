"use client";

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/Reveal";
import { ShowcaseMedia } from "@/components/landing/ShowcaseMedia";
import { MoreFeatures } from "@/components/landing/MoreFeatures";
import { Extensions } from "@/components/landing/Extensions";
import { Progression } from "@/components/landing/Progression";
import {
  ArrowRight,
  ArrowUpRight,
  Download,
  Sparkles,
  Clapperboard,
  BookOpen,
  BarChart3,
  Magnet,
  DownloadCloud,
  Users,
  MessageSquare,
  ListMusic,
  TrendingUp,
  RefreshCw,
  CalendarDays,
  Trophy,
  Heart,
  X,
  Maximize2,
  Check,
  type LucideIcon,
} from "lucide-react";

const BRAND = "/assets/brand";

interface Flagship {
  icon: LucideIcon;
  kicker: string;
  title: string;
  body: string;
  points: string[];
  media: string;
  accent: string;
  glow: string;
}

const flagships: Flagship[] = [
  {
    icon: Sparkles,
    kicker: "Recommendations",
    title: "Picks that actually get you",
    body: "A hybrid recommendation engine learns from everything you watch and read, then surfaces the next thing worth your time — without the endless scrolling.",
    points: ["Personalized daily", "Learns as you go", "Anime & manga"],
    media: `${BRAND}/Recommendation.mp4`,
    accent: "text-violet-200",
    glow: "bg-violet-500/20",
  },
  {
    icon: Clapperboard,
    kicker: "Video player",
    title: "Built for how you watch",
    body: "Drop in your own subtitles, switch tracks mid-scene, and keep an episode running in the background while you browse.",
    points: ["Custom subtitles", "Adaptive quality", "Background playback"],
    media: `${BRAND}/Videoplayer.mp4`,
    accent: "text-cyan-200",
    glow: "bg-cyan-500/20",
  },
  {
    icon: BookOpen,
    kicker: "Manga reader",
    title: "Read the way you like",
    body: "A fast, comic-style reader with per-device settings, custom keybinds, and progress that follows you across every session.",
    points: ["Custom keybinds", "Saved progress", "Manga · Manhwa · Comics"],
    media: `${BRAND}/MangaReader.mp4`,
    accent: "text-pink-200",
    glow: "bg-pink-500/20",
  },
  {
    icon: BarChart3,
    kicker: "Profile & stats",
    title: "Your taste, in numbers",
    body: "Activity heatmaps, taste breakdowns, and rich insights that turn your history into a profile worth following.",
    points: ["Activity heatmaps", "Taste breakdown", "Shareable profile"],
    media: `${BRAND}/Profile_with_stats.mp4`,
    accent: "text-amber-200",
    glow: "bg-amber-500/20",
  },
];

interface OfflineCard {
  icon: LucideIcon;
  title: string;
  body: string;
  media: string;
  tag: string;
}

const offline: OfflineCard[] = [
  {
    icon: Magnet,
    title: "Torrent streaming",
    body: "Stream torrents straight through the app — no separate client to manage.",
    media: `${BRAND}/Torrent.mp4`,
    tag: "Stream instantly",
  },
  {
    icon: DownloadCloud,
    title: "Download anime",
    body: "Save episodes for the flight, the commute, or unreliable Wi-Fi.",
    media: `${BRAND}/Animedownload.mp4`,
    tag: "Watch offline",
  },
  {
    icon: DownloadCloud,
    title: "Download manga",
    body: "Take whole series offline and read directly from your library.",
    media: `${BRAND}/Mangadownload.mp4`,
    tag: "Read anywhere",
  },
];

interface Tile {
  icon: LucideIcon;
  title: string;
  img: string;
  eyebrow: string;
  layout: string;
  featured?: boolean;
}

const community: Tile[] = [
  {
    icon: Users,
    title: "A feed that feels alive",
    img: `${BRAND}/Community.png`,
    eyebrow: "Social feed",
    layout: "col-span-2 row-span-2",
    featured: true,
  },
  {
    icon: BarChart3,
    title: "Profiles worth following",
    img: `${BRAND}/Profile.png`,
    eyebrow: "Profiles",
    layout: "col-span-2",
  },
  {
    icon: MessageSquare,
    title: "Discuss every episode",
    img: `${BRAND}/Comment.png`,
    eyebrow: "Conversations",
    layout: "",
  },
  {
    icon: ListMusic,
    title: "Curate & share playlists",
    img: `${BRAND}/Playlist.png`,
    eyebrow: "Collections",
    layout: "",
  },
  {
    icon: TrendingUp,
    title: "See what's trending",
    img: `${BRAND}/Trending.png`,
    eyebrow: "Discover",
    layout: "",
  },
  {
    icon: RefreshCw,
    title: "Sync your anime history",
    img: `${BRAND}/integration.png`,
    eyebrow: "Integrations",
    layout: "",
  },
  {
    icon: CalendarDays,
    title: "Track your anime journey",
    img: `${BRAND}/Calendar.png`,
    eyebrow: "Calendar",
    layout: "",
  },
  {
    icon: Trophy,
    title: "Build your own tier lists",
    img: `${BRAND}/Tierlist.png`,
    eyebrow: "Tier lists",
    layout: "",
  },
  {
    icon: Heart,
    title: "Keep your favorites close",
    img: `${BRAND}/Favorites.png`,
    eyebrow: "Favorites",
    layout: "",
  },
];

function SectionHeading({
  id,
  eyebrow,
  title,
  sub,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  sub?: string;
}) {
  return (
    <div className="mb-12 max-w-3xl lg:mb-16">
      <div className="mb-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-violet-200/80">
        <span className="h-px w-8 bg-violet-300/60" />
        {eyebrow}
      </div>

      <h2
        id={id}
        className="font-display text-[clamp(2rem,4.2vw,3.5rem)] font-medium leading-[0.98] tracking-[-0.045em] text-white"
      >
        {title}
      </h2>

      {sub ? (
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/55 lg:text-lg">
          {sub}
        </p>
      ) : null}
    </div>
  );
}

export function FeatureShowcase() {
  const navigate = useNavigate();
  const [previewTile, setPreviewTile] = useState<Tile | null>(null);

  useEffect(() => {
    if (!previewTile) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setPreviewTile(null);
      }
    };

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [previewTile]);

  return (
    <div className="relative isolate w-full overflow-hidden">
      {/* Ambient background lighting */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute left-[-14%] top-[4%] h-[480px] w-[480px] rounded-full bg-violet-600/10 blur-[150px]" />
        <div className="absolute right-[-12%] top-[31%] h-[560px] w-[560px] rounded-full bg-pink-500/10 blur-[170px]" />
        <div className="absolute bottom-[6%] left-[25%] h-[500px] w-[500px] rounded-full bg-cyan-500/10 blur-[160px]" />
      </div>

      <div className="relative mx-auto w-full max-w-[1440px] px-6 pb-28 pt-8 lg:px-16">
        {/* ============================================================
            FLAGSHIP FEATURES
        ============================================================ */}
        <section
          className="py-16 lg:py-28"
          aria-labelledby="flagship-features-heading"
        >
          <Reveal>
            <SectionHeading
              id="flagship-features-heading"
              eyebrow="The complete experience"
              title="Everything anime & manga, done right"
              sub="One app for discovering, watching, reading, and keeping track — designed to stay out of your way."
            />
          </Reveal>

          <div className="space-y-6 lg:space-y-8">
            {flagships.map((feature, index) => {
              const Icon = feature.icon;
              const reversed = index % 2 === 1;

              return (
                <Reveal key={feature.title} delay={index * 0.04}>
                  <article className="group relative overflow-hidden rounded-[30px] border border-white/[0.1] bg-[#0d0c13]/80 shadow-[0_32px_90px_-45px_rgba(0,0,0,0.95)]">
                    <div
                      className={`pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full blur-[100px] transition-opacity duration-700 group-hover:opacity-100 ${feature.glow}`}
                    />

                    <div className="relative grid overflow-hidden lg:grid-cols-[0.9fr_1.1fr]">
                      <div
                        className={`relative overflow-hidden p-7 sm:p-10 lg:p-12 ${
                          reversed ? "lg:order-2" : ""
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute -right-1 top-1 font-display text-7xl font-semibold tracking-[-0.08em] text-white/[0.035] sm:text-8xl"
                        >
                          0{index + 1}
                        </span>

                        <div className="relative">
                          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5 backdrop-blur-md">
                            <Icon
                              className={`h-3.5 w-3.5 ${feature.accent}`}
                            />

                            <span className="text-xs font-medium text-white/70">
                              {feature.kicker}
                            </span>
                          </div>

                          <h3 className="max-w-md font-display text-[clamp(1.7rem,3vw,2.75rem)] font-medium leading-[1.02] tracking-[-0.04em] text-white">
                            {feature.title}
                          </h3>

                          <p className="mt-5 max-w-md text-base leading-relaxed text-white/58">
                            {feature.body}
                          </p>

                          <ul
                            aria-label={`${feature.title} capabilities`}
                            className="mt-7 grid gap-2 sm:grid-cols-2"
                          >
                            {feature.points.map((point) => (
                              <li
                                key={point}
                                className="flex items-center gap-2 text-sm text-white/70"
                              >
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05]">
                                  <Check
                                    className={`h-3 w-3 ${feature.accent}`}
                                  />
                                </span>

                                {point}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      <div
                        className={`relative flex items-center border-t border-white/[0.08] bg-black/10 p-3 sm:p-4 lg:border-t-0 ${
                          reversed
                            ? "lg:order-1 lg:border-r"
                            : "lg:border-l"
                        }`}
                      >
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.035] to-transparent" />

                        <div className="relative w-full">
                          <ShowcaseMedia
                            type="video"
                            src={feature.media}
                            label={`${feature.title} — preview`}
                            className="rounded-[18px] border-white/10 bg-black/30 shadow-2xl"
                          />

                          <div className="pointer-events-none absolute bottom-4 left-4 rounded-full border border-white/10 bg-black/45 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/60 backdrop-blur-md">
                            Feature preview
                          </div>
                        </div>
                      </div>
                    </div>
                  </article>
                </Reveal>
              );
            })}
          </div>
        </section>

        {/* ============================================================
            OFFLINE / TORRENT
        ============================================================ */}
        <section
          className="border-t border-white/[0.08] py-16 lg:py-28"
          aria-labelledby="offline-heading"
        >
          <Reveal>
            <SectionHeading
              id="offline-heading"
              eyebrow="Take it with you"
              title="Watch and read anywhere — even offline"
              sub="Stream from torrents, or download whole series and take them with you."
            />
          </Reveal>

          <div className="grid gap-5 md:grid-cols-3">
            {offline.map((card, index) => {
              const Icon = card.icon;

              return (
                <Reveal key={card.title} delay={index * 0.08}>
                  <article className="group h-full overflow-hidden rounded-2xl border border-white/[0.1] bg-white/[0.035] shadow-[0_20px_60px_-35px_rgba(0,0,0,0.9)] transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.055]">
                    <div className="relative overflow-hidden border-b border-white/[0.08] p-2.5">
                      <div className="transition-transform duration-700 group-hover:scale-[1.025]">
                        <ShowcaseMedia
                          type="video"
                          src={card.media}
                          label={`${card.title} — preview`}
                          ratio="16 / 10"
                          className="rounded-[14px] border-0 shadow-none"
                        />
                      </div>

                      <span className="absolute left-5 top-5 rounded-full border border-white/10 bg-black/50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70 backdrop-blur-md">
                        {card.tag}
                      </span>
                    </div>

                    <div className="flex min-h-[150px] flex-col p-5">
                      <div className="mb-3 flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-300/15 bg-violet-400/10">
                          <Icon className="h-4 w-4 text-violet-200" />
                        </span>

                        <h3 className="font-display text-lg font-medium tracking-[-0.02em] text-white">
                          {card.title}
                        </h3>
                      </div>

                      <p className="text-sm leading-relaxed text-white/55">
                        {card.body}
                      </p>
                    </div>
                  </article>
                </Reveal>
              );
            })}
          </div>
        </section>

        {/* ============================================================
            COMMUNITY BENTO GALLERY
        ============================================================ */}
        <section
          className="border-t border-white/[0.08] py-16 lg:py-28"
          aria-labelledby="community-heading"
        >
          <Reveal>
            <SectionHeading
              id="community-heading"
              eyebrow="More than a library"
              title="Built for the community"
              sub="Follow people, talk about what you're into, and bring your MyAnimeList or AniList history along."
            />
          </Reveal>

          <div
            className="
              grid
              auto-rows-[155px]
              grid-cols-2
              gap-3.5
              sm:auto-rows-[185px]
              sm:gap-4
              lg:auto-rows-[200px]
              lg:gap-5
            "
          >
            {community.map((tile, index) => {
              const Icon = tile.icon;

              return (
                <Reveal
                  key={`${tile.title}-${index}`}
                  delay={(index % 4) * 0.05}
                  className={tile.layout}
                >
                  <button
                    type="button"
                    aria-label={`Preview ${tile.title}`}
                    onClick={() => setPreviewTile(tile)}
                    className="
                      group
                      relative
                      block
                      h-full
                      w-full
                      cursor-zoom-in
                      overflow-hidden
                      rounded-[22px]
                      border
                      border-white/[0.1]
                      bg-[#0d0c13]
                      text-left
                      shadow-[0_20px_65px_-35px_rgba(0,0,0,0.9)]
                      outline-none
                      transition-all
                      duration-500
                      hover:-translate-y-1
                      hover:border-white/[0.18]
                      hover:shadow-[0_30px_80px_-30px_rgba(0,0,0,0.95)]
                      focus-visible:ring-2
                      focus-visible:ring-violet-300/60
                      focus-visible:ring-offset-2
                      focus-visible:ring-offset-[#08070c]
                    "
                  >
                    {/* Main image */}
                    <img
                      src={tile.img}
                      alt={tile.title}
                      loading={index < 2 ? "eager" : "lazy"}
                      decoding="async"
                      draggable={false}
                      sizes={
                        tile.featured
                          ? "(max-width: 1024px) 100vw, 50vw"
                          : tile.layout.includes("col-span-2")
                            ? "(max-width: 1024px) 100vw, 50vw"
                            : "(max-width: 1024px) 50vw, 25vw"
                      }
                      className="
                        absolute
                        inset-0
                        h-full
                        w-full
                        object-cover
                        object-top
                        opacity-[0.9]
                        transition-all
                        duration-700
                        ease-[cubic-bezier(0.22,1,0.36,1)]
                        group-hover:scale-[1.045]
                        group-hover:opacity-100
                      "
                    />

                    {/* Base image contrast */}
                    <div className="absolute inset-0 bg-black/[0.08]" />

                    {/* Cinematic bottom gradient */}
                    <div
                      className="
                        absolute
                        inset-0
                        bg-gradient-to-t
                        from-[#050509]
                        via-[#050509]/35
                        to-transparent
                        opacity-95
                      "
                    />

                    {/* Violet ambient glow */}
                    <div
                      className="
                        pointer-events-none
                        absolute
                        inset-0
                        bg-[radial-gradient(circle_at_15%_0%,rgba(167,139,250,0.16),transparent_42%)]
                        opacity-60
                        transition-opacity
                        duration-500
                        group-hover:opacity-100
                      "
                    />

                    {/* Glass border */}
                    <div
                      className="
                        pointer-events-none
                        absolute
                        inset-0
                        rounded-[22px]
                        ring-1
                        ring-inset
                        ring-white/[0.04]
                        transition-all
                        duration-500
                        group-hover:ring-violet-200/[0.12]
                      "
                    />

                    {/* Top metadata */}
                    <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4 sm:p-5">
                      <div
                        className="
                          inline-flex
                          items-center
                          gap-2
                          rounded-full
                          border
                          border-white/[0.12]
                          bg-black/[0.36]
                          px-2.5
                          py-1.5
                          backdrop-blur-xl
                          shadow-[0_8px_24px_rgba(0,0,0,0.2)]
                        "
                      >
                        <Icon className="h-3.5 w-3.5 text-white/85" />

                        <span className="max-w-[150px] truncate text-[9px] font-semibold uppercase tracking-[0.15em] text-white/70 sm:text-[10px]">
                          {tile.eyebrow}
                        </span>
                      </div>

                      {/* Expand icon */}
                      <span
                        className="
                          flex
                          h-8
                          w-8
                          items-center
                          justify-center
                          rounded-full
                          border
                          border-white/[0.12]
                          bg-black/[0.3]
                          text-white/65
                          opacity-0
                          translate-y-1
                          backdrop-blur-xl
                          transition-all
                          duration-300
                          group-hover:translate-y-0
                          group-hover:opacity-100
                        "
                      >
                        <Maximize2 className="h-3.5 w-3.5" />
                      </span>
                    </div>

                    {/* Bottom content */}
                    <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
                      <div className="flex items-end justify-between gap-4">
                        <div className="min-w-0">
                          <div className="mb-2 flex items-center gap-2">
                            <span className="h-1 w-1 rounded-full bg-white/50" />

                            <span className="text-[9px] font-medium uppercase tracking-[0.16em] text-white/45">
                              Tatakai community
                            </span>
                          </div>

                          <h3
                            className={`font-display font-medium leading-[1.05] tracking-[-0.03em] text-white ${
                              tile.featured
                                ? "max-w-xl text-xl sm:text-2xl lg:text-[2rem]"
                                : tile.layout.includes("col-span-2")
                                  ? "max-w-md text-lg sm:text-xl"
                                  : "max-w-[95%] text-sm sm:text-base"
                            }`}
                          >
                            {tile.title}
                          </h3>
                        </div>

                        {/* Arrow */}
                        <span
                          className="
                            hidden
                            h-9
                            w-9
                            shrink-0
                            items-center
                            justify-center
                            rounded-full
                            border
                            border-white/[0.12]
                            bg-white/[0.07]
                            text-white/70
                            backdrop-blur-xl
                            transition-all
                            duration-300
                            group-hover:translate-x-0.5
                            group-hover:bg-white/[0.12]
                            sm:flex
                          "
                        >
                          <ArrowUpRight className="h-4 w-4" />
                        </span>
                      </div>
                    </div>

                    {/* Hover shine */}
                    <div
                      className="
                        pointer-events-none
                        absolute
                        inset-y-0
                        -left-1/2
                        w-1/3
                        -skew-x-12
                        bg-white/[0.04]
                        opacity-0
                        blur-2xl
                        transition-all
                        duration-700
                        group-hover:left-[115%]
                        group-hover:opacity-100
                      "
                    />
                  </button>
                </Reveal>
              );
            })}
          </div>
        </section>

        {/* ============================================================
            EXTENSIONS
        ============================================================ */}
        <div className="border-t border-white/[0.08]">
          <Extensions />
        </div>

        {/* ============================================================
            PROGRESSION / RANKS
        ============================================================ */}
        <div className="border-t border-white/[0.08]">
          <Progression />
        </div>

        {/* ============================================================
            MORE FEATURES
        ============================================================ */}
        <div className="border-t border-white/[0.08]">
          <MoreFeatures />
        </div>

        {/* ============================================================
            FINAL CTA
        ============================================================ */}
        <section className="border-t border-white/[0.08] py-16 lg:py-28">
          <Reveal>
            <div className="relative overflow-hidden rounded-[32px] border border-white/[0.12] bg-[#0c0b12] px-6 py-12 text-center shadow-[0_35px_100px_-45px_rgba(0,0,0,1)] sm:px-10 lg:px-16 lg:py-20">
              <div className="pointer-events-none absolute left-1/2 top-0 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/25 blur-[100px]" />

              <div className="pointer-events-none absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-cyan-500/15 blur-[100px]" />

              <div className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-pink-500/10 blur-[100px]" />

              <div className="relative mx-auto max-w-2xl">
                <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-white/70 backdrop-blur-md">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.9)]" />
                  Ready when you are
                </div>

                <h2 className="font-display text-[clamp(2rem,4vw,3.4rem)] font-medium leading-[1] tracking-[-0.045em] text-white">
                  Up and running in minutes
                </h2>

                <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-white/60 lg:text-lg">
                  Install the app, sign in, and pick up right where you left
                  off. Everything after setup is just watching and reading.
                </p>

                <div className="mx-auto mt-8 grid max-w-lg grid-cols-3 divide-x divide-white/10 rounded-2xl border border-white/[0.08] bg-white/[0.035] px-3 py-3 text-center">
                  <div className="px-2 text-xs font-medium text-white/60">
                    Discover
                  </div>

                  <div className="px-2 text-xs font-medium text-white/60">
                    Watch
                  </div>

                  <div className="px-2 text-xs font-medium text-white/60">
                    Read
                  </div>
                </div>

                <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                  <Button
                    size="lg"
                    onClick={() => navigate("/download")}
                    className="group h-12 rounded-full border border-white/20 bg-white px-7 text-sm font-semibold text-black shadow-[0_0_34px_-6px_rgba(255,255,255,0.45)] transition-all hover:scale-[1.02] hover:shadow-[0_0_45px_-6px_rgba(255,255,255,0.65)]"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download app
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Button>

                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => navigate("/browse")}
                    className="h-12 rounded-full border border-white/15 bg-white/[0.05] px-7 text-sm font-semibold text-white backdrop-blur-md transition-all hover:border-white/30 hover:bg-white hover:text-black"
                  >
                    Browse the library
                  </Button>
                </div>

                <p className="mt-6 text-xs text-white/40">
                  Free &amp; open source — no account required to look around.
                </p>
              </div>
            </div>
          </Reveal>
        </section>
      </div>

      {/* ================================================================
          COMMUNITY IMAGE PREVIEW
      ================================================================= */}
      {previewTile && (
        <div
          className="
            fixed
            inset-0
            z-[9999]
            flex
            items-center
            justify-center
            bg-black/80
            p-4
            backdrop-blur-2xl
            sm:p-6
          "
          role="dialog"
          aria-modal="true"
          aria-label={`${previewTile.title} image preview`}
        >
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Close image preview"
            className="absolute inset-0 h-full w-full cursor-default"
            onPointerDown={(event) => {
              event.preventDefault();
              setPreviewTile(null);
            }}
          />

          {/* Ambient preview glow */}
          <div
            className="
              pointer-events-none
              absolute
              left-1/2
              top-1/2
              h-[55vh]
              w-[55vw]
              -translate-x-1/2
              -translate-y-1/2
              rounded-full
              bg-violet-500/[0.08]
              blur-[120px]
            "
          />

          {/* Close button */}
          <button
            type="button"
            aria-label="Close image preview"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setPreviewTile(null);
            }}
            className="
              absolute
              right-4
              top-4
              z-[10001]
              flex
              h-11
              w-11
              cursor-pointer
              items-center
              justify-center
              rounded-full
              border
              border-white/[0.14]
              bg-black/50
              text-white/75
              shadow-[0_12px_40px_rgba(0,0,0,0.45)]
              backdrop-blur-xl
              transition-all
              duration-200
              hover:scale-105
              hover:border-white/25
              hover:bg-white/10
              hover:text-white
              active:scale-95
              focus:outline-none
              focus-visible:ring-2
              focus-visible:ring-violet-300/70
              sm:right-6
              sm:top-6
            "
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>

          {/* Preview shell */}
          <div
            className="
              relative
              z-[10000]
              w-full
              max-w-6xl
              overflow-hidden
              rounded-[28px]
              border
              border-white/[0.12]
              bg-[#09090d]/95
              p-2
              shadow-[0_40px_120px_-35px_rgba(0,0,0,0.95)]
              sm:p-3
            "
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
          >
            {/* Preview image */}
            <div
              className="
                relative
                flex
                min-h-[55vh]
                items-center
                justify-center
                overflow-hidden
                rounded-[21px]
                border
                border-white/[0.06]
                bg-black/40
              "
            >
              <img
                src={previewTile.img}
                alt={previewTile.title}
                className="
                  max-h-[78vh]
                  max-w-full
                  select-none
                  object-contain
                "
                draggable={false}
              />

              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
            </div>

            {/* Preview information */}
            <div className="flex items-center justify-between gap-4 px-3 pb-2 pt-4 sm:px-4 sm:pb-3">
              <div className="min-w-0">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="h-1 w-1 rounded-full bg-violet-300" />

                  <span className="truncate text-[9px] font-semibold uppercase tracking-[0.16em] text-violet-200/70">
                    {previewTile.eyebrow}
                  </span>
                </div>

                <h3 className="truncate font-display text-lg font-medium tracking-[-0.025em] text-white sm:text-xl">
                  {previewTile.title}
                </h3>
              </div>

              <div
                className="
                  hidden
                  shrink-0
                  items-center
                  gap-2
                  rounded-full
                  border
                  border-white/[0.08]
                  bg-white/[0.035]
                  px-3
                  py-2
                  text-[10px]
                  font-medium
                  uppercase
                  tracking-[0.12em]
                  text-white/40
                  sm:flex
                "
              >
                <Maximize2 className="h-3.5 w-3.5" />
                Preview
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}