"use client";

import { useEffect, useRef, useState, useCallback, forwardRef } from "react";
import { useNavigate } from "react-router-dom";
import { animate, stagger } from "animejs";
import { useMotionPreference } from "@/hooks/ui/useMotionPreference";
import { Reveal } from "@/components/ui/Reveal";
import { AnimatedBeam } from "@/components/ui/animated-beam";
import { cn } from "@/lib/utils";
import {
  Archive,
  RefreshCw,
  Link2,
  Import,
  Plug,
  Puzzle,
  ArrowUpRight,
  BarChart3,
  Check,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const TATAKAI_LOGO = "/assets/logo/tatakai-logo.png";

interface Tracker {
  name: string;
  kind: string;
  body: string;
  logo: string;
  fallback: string;
  ring: string;
  dot: string;
  accent: string;
  tags: string[];
}

const trackers: Tracker[] = [
  {
    name: "AniList",
    kind: "Anime & manga tracking",
    body: "OAuth connect with ID-first import — your scores, statuses and progress land on the right entries.",
    logo: "https://cdn.simpleicons.org/anilist/02A9FF",
    fallback: "AL",
    ring: "hover:border-[#02A9FF]/40",
    dot: "bg-[#02A9FF]",
    accent: "#02A9FF",
    tags: ["OAuth", "2-way sync", "Smart import"],
  },
  {
    name: "MyAnimeList",
    kind: "Anime & manga tracking",
    body: "Bring years of MAL history along — stable mal_id mapping keeps rewatches and rereads matched.",
    logo: "https://cdn.simpleicons.org/myanimelist/2E51A2",
    fallback: "MAL",
    ring: "hover:border-[#2E51A2]/50",
    dot: "bg-[#2E51A2]",
    accent: "#2E51A2",
    tags: ["OAuth", "History import", "List sync"],
  },
  {
    name: "MangaBaka",
    kind: "Open manga & novel DB",
    body: "The community open database for manga, manhwa and light novels — chapters, volumes and notes in sync.",
    logo: "https://mangabaka.org/images/logo.png",
    fallback: "MB",
    ring: "hover:border-amber-300/40",
    dot: "bg-amber-300",
    accent: "#FCD34D",
    tags: ["OAuth", "300k+ series", "Open data"],
  },
];

interface EcoStep {
  icon: LucideIcon;
  title: string;
  body: string;
}

const syncSteps: EcoStep[] = [
  {
    icon: Link2,
    title: "Connect once",
    body: "Link AniList, MAL and MangaBaka with OAuth — no passwords stored.",
  },
  {
    icon: Import,
    title: "Import history",
    body: "ID-first mapping matches by mal_id / anilist_id, with manual override in review.",
  },
  {
    icon: RefreshCw,
    title: "Stay in sync",
    body: "Progress, scores and statuses follow you across every device.",
  },
];

interface Ecosystem {
  name: string;
  tag: string;
  body: string;
  logo: string;
  fallback: string;
  accent: string;
  accentColor: string;
  glow: string;
  points: string[];
  footnote: string;
}

const ecosystems: Ecosystem[] = [
  {
    name: "Seanime",
    tag: "JS / TS providers",
    body: "Streaming, torrent and manga providers from the Seanime ecosystem — paste a manifest and Tatakai wires up the Provider methods.",
    logo: "https://seanime.app/seanime-logo.png",
    fallback: "SE",
    accent: "text-white",
    accentColor: "#ffffff",
    glow: "bg-white/[0.04]",
    points: [
      "Seanime JSON manifest install",
      "TypeScript compiles at install",
      "Title-alias matching, saved per provider",
    ],
    footnote: "Enabled state, bundle code & prefs survive restart.",
  },
  {
    name: "Stremio",
    tag: "HTTP / JSON add-ons",
    body: "Any Stremio add-on becomes a Tatakai source — streams and subtitles over the open protocol, mapped to your library.",
    logo: "https://cdn.simpleicons.org/stremio/8A5CF6",
    fallback: "ST",
    accent: "text-violet-200",
    accentColor: "#8A5CF6",
    glow: "bg-violet-500/[0.06]",
    points: [
      "manifest.json URL or stremio:// link",
      "Streams + subtitles via protocol",
      "AniList-to-IMDb mapping, season-aware",
    ],
    footnote: "Configure upstream first, then paste the manifest URL.",
  },
];

const installInputs = [".kai file", "Public URL", "manifest.json", "stremio://", "Seanime JSON"];

const marqueeItems = [
  "Seanime providers",
  "Stremio add-ons",
  ".kai extensions",
  "TypeScript bundles",
  "HTTP manifests",
  "JSON configs",
  "Open protocol",
  "Community sources",
];

/* ------------------------------------------------------------------ */
/*  Utility Components                                                 */
/* ------------------------------------------------------------------ */

function SpotlightCard({
  children,
  className = "",
  spotlightColor = "rgba(255,255,255,0.04)",
  spotlightSize = 600,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & {
  spotlightColor?: string;
  spotlightSize?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState(false);

  const onMove = useCallback((e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={className}
      {...rest}
    >
      <div
        className="pointer-events-none absolute inset-0 z-[1] rounded-[inherit] transition-opacity duration-500"
        style={{
          opacity: hovered ? 1 : 0,
          background: `radial-gradient(${spotlightSize}px circle at ${pos.x}px ${pos.y}px, ${spotlightColor}, transparent 40%)`,
        }}
      />
      {children}
    </div>
  );
}

function LogoImg({
  src,
  alt,
  fallback,
  size = "h-11 w-11",
  rounded = "rounded-xl",
}: {
  src: string;
  alt: string;
  fallback: string;
  size?: string;
  rounded?: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      className={`relative flex ${size} shrink-0 items-center justify-center overflow-hidden ${rounded} border border-white/10 bg-white/[0.06]`}
    >
      <span className="font-display text-xs font-semibold tracking-tight text-white/80">
        {fallback}
      </span>
      {!failed && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full bg-[#0d0c13] object-contain p-1.5"
        />
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Animated sync map (magicui animated-beam, Tatakai-flavored)         */
/*  Left: AniList · MAL · MangaBaka → Center: Tatakai hub →            */
/*  Right: Library · Live sync. Beams are decorative pulse motion,     */
/*  gated off under prefers-reduced-motion (static hub layout kept).   */
/* ------------------------------------------------------------------ */

const BeamNode = forwardRef<
  HTMLDivElement,
  { className?: string; label: string; children?: React.ReactNode }
>(({ className, label, children }, ref) => {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        ref={ref}
        className={cn(
          "relative z-10 flex size-12 items-center justify-center rounded-full border border-white/15 bg-[#0d0c13] shadow-[0_0_24px_-8px_rgba(139,92,246,0.5)] sm:size-14",
          className,
        )}
      >
        {children}
      </div>
      <span className="z-10 whitespace-nowrap text-[9px] font-semibold uppercase tracking-[0.14em] text-white/40 sm:text-[10px]">
        {label}
      </span>
    </div>
  );
});

BeamNode.displayName = "BeamNode";

function BeamTrackerLogo({ index, name }: { index: number; name: string }) {
  const [failed, setFailed] = useState(false);
  const t = trackers[index];
  return (
    <>
      <span className="font-display text-[10px] font-bold tracking-tight text-white/70">
        {t.fallback}
      </span>
      {!failed && (
        <img
          src={t.logo}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full rounded-full bg-[#0d0c13] object-contain p-2.5"
        />
      )}
      <span className="sr-only">{name}</span>
    </>
  );
}

function IntegrationBeams() {
  const reduceMotion = useMotionPreference();
  const containerRef = useRef<HTMLDivElement>(null);
  const alRef = useRef<HTMLDivElement>(null);
  const malRef = useRef<HTMLDivElement>(null);
  const mbRef = useRef<HTMLDivElement>(null);
  const hubRef = useRef<HTMLDivElement>(null);
  const libRef = useRef<HTMLDivElement>(null);
  const syncRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label="Live sync map: AniList, MyAnimeList and MangaBaka flow into the Tatakai hub, then out to your library and live sync."
      className="relative mb-8 flex h-[460px] items-center justify-between gap-1 overflow-hidden rounded-2xl border border-white/[0.08] bg-black/40 px-3 backdrop-blur-md sm:h-[420px] sm:px-8"
    >
      {/* Backdrop */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-600/10 blur-[100px]" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      {/* Left — tracker sources */}
      <div className="flex h-full max-h-[330px] flex-col items-stretch justify-between py-2 sm:max-h-[300px]">
        <BeamNode ref={alRef} label="AniList">
          <BeamTrackerLogo index={0} name="AniList" />
        </BeamNode>
        <BeamNode ref={malRef} label="MyAnimeList">
          <BeamTrackerLogo index={1} name="MyAnimeList" />
        </BeamNode>
        <BeamNode ref={mbRef} label="MangaBaka">
          <BeamTrackerLogo index={2} name="MangaBaka" />
        </BeamNode>
      </div>

      {/* Center — Tatakai hub */}
      <div className="relative flex flex-col items-center gap-2">
        {!reduceMotion && (
          <span
            aria-hidden="true"
            className="absolute inset-x-4 top-2 -z-0 inline-flex aspect-square animate-ping rounded-full bg-violet-400 opacity-10 motion-reduce:animate-none sm:inset-x-5"
          />
        )}
        <div
          ref={hubRef}
          className="relative z-10 flex size-16 items-center justify-center rounded-full border border-violet-300/30 bg-[#141222]  sm:size-20"
        >
          <img
            src={TATAKAI_LOGO}
            alt="Tatakai"
            loading="lazy"
            decoding="async"
            className="h-9 w-9 object-contain sm:h-11 sm:w-11"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
        <span className="z-10 whitespace-nowrap text-[9px] font-semibold uppercase tracking-[0.14em] text-violet-200/70 sm:text-[10px]">
          Tatakai hub
        </span>
      </div>

      {/* Right — sync outputs */}
      <div className="flex h-full max-h-[220px] flex-col items-stretch justify-between py-2">
        <BeamNode ref={libRef} label="Library">
          <Archive className="h-5 w-5 text-cyan-200" />
        </BeamNode>
        <BeamNode ref={syncRef} label="Live sync">
          <BarChart3 className="h-5 w-5 text-emerald-200" />
        </BeamNode>
      </div>

      {/* Animated pulses — decorative, skipped under reduced motion */}
      {!reduceMotion && (
        <>
          <AnimatedBeam
            containerRef={containerRef}
            fromRef={alRef}
            toRef={hubRef}
            curvature={-70}
            duration={4}
            pathColor="white"
            pathOpacity={0.12}
            pathWidth={1.5}
            gradientStartColor={trackers[0].accent}
            gradientStopColor="#8B5CF6"
          />
          <AnimatedBeam
            containerRef={containerRef}
            fromRef={malRef}
            toRef={hubRef}
            duration={4.6}
            delay={0.5}
            pathColor="white"
            pathOpacity={0.12}
            pathWidth={1.5}
            gradientStartColor={trackers[1].accent}
            gradientStopColor="#8B5CF6"
          />
          <AnimatedBeam
            containerRef={containerRef}
            fromRef={mbRef}
            toRef={hubRef}
            curvature={70}
            duration={4.3}
            delay={1}
            pathColor="white"
            pathOpacity={0.12}
            pathWidth={1.5}
            gradientStartColor={trackers[2].accent}
            gradientStopColor="#8B5CF6"
          />
          <AnimatedBeam
            containerRef={containerRef}
            fromRef={hubRef}
            toRef={libRef}
            curvature={-45}
            duration={5}
            delay={1.5}
            pathColor="white"
            pathOpacity={0.12}
            pathWidth={1.5}
            gradientStartColor="#A78BFA"
            gradientStopColor="#67E8F9"
          />
          <AnimatedBeam
            containerRef={containerRef}
            fromRef={hubRef}
            toRef={syncRef}
            curvature={45}
            duration={5}
            delay={2}
            pathColor="white"
            pathOpacity={0.12}
            pathWidth={1.5}
            gradientStartColor="#A78BFA"
            gradientStopColor="#34D399"
          />
        </>
      )}

      {/* Caption */}
      <div className="absolute inset-x-0 bottom-3 z-10 flex flex-wrap items-center justify-center gap-2 px-4">
       
        <span className="flex items-center gap-1.5 rounded-full border border-emerald-300/20 bg-emerald-400/[0.07] px-3 py-1 text-[10px] font-semibold text-emerald-200">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
          3 connected
        </span>
      </div>
    </div>
  );
}

function SectionHeading({
  id,
  kicker,
  title,
  children,
}: {
  id: string;
  kicker: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Reveal>
      <div className="mb-12 max-w-3xl lg:mb-14">
        <div className="mb-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-violet-200/80">
          <span className="h-px w-8 bg-violet-300/60" />
          {kicker}
        </div>
        <h2
          id={id}
          className="font-display text-[clamp(2rem,4.2vw,3.5rem)] font-medium leading-[0.98] tracking-[-0.045em] text-white"
        >
          {title}
        </h2>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/55 lg:text-lg">
          {children}
        </p>
      </div>
    </Reveal>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function Integrations() {
  const navigate = useNavigate();
  const reduceMotion = useMotionPreference();
  const trackRef = useRef<HTMLDivElement>(null);
  const ecoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const grids: { el: HTMLDivElement | null; sel: string }[] = [
      { el: trackRef.current, sel: "[data-tracker]" },
      { el: ecoRef.current, sel: "[data-eco]" },
    ];
    const cleanups: (() => void)[] = [];
    grids.forEach(({ el, sel }) => {
      if (!el) return;
      const cards = Array.from(el.querySelectorAll<HTMLElement>(sel));
      if (!cards.length) return;
      if (reduceMotion) {
        cards.forEach((c) => {
          c.style.opacity = "1";
          c.style.transform = "none";
        });
        return;
      }
      let played = false;
      let entrance: ReturnType<typeof animate> | undefined;
      const io = new IntersectionObserver(
        ([entry]) => {
          if (!entry.isIntersecting || played) return;
          played = true;
          entrance = animate(cards, {
            opacity: [0, 1],
            translateY: [36, 0],
            scale: [0.95, 1],
            delay: stagger(120),
            duration: 850,
            ease: "out(3)",
          });
          io.disconnect();
        },
        { threshold: 0.15 },
      );
      io.observe(el);
      cleanups.push(() => {
        io.disconnect();
        entrance?.revert();
      });
    });
    return () => cleanups.forEach((fn) => fn());
  }, [reduceMotion]);

  return (
    <>
      <style>{`
        @keyframes int-float-a {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -20px) scale(1.04); }
          66% { transform: translate(-20px, 15px) scale(0.96); }
        }
        @keyframes int-float-b {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(-25px, 22px) scale(0.97); }
          66% { transform: translate(18px, -16px) scale(1.03); }
        }
        @keyframes int-pulse-soft {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.5); }
        }
        @keyframes int-orbit-ring {
          0%, 100% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.15); }
          50% { box-shadow: 0 0 30px 6px rgba(139, 92, 246, 0.08); }
        }
        @keyframes int-shimmer-bar {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        @keyframes int-marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes int-dash-flow {
          to { stroke-dashoffset: -16; }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-int-float] { animation: none !important; }
          [data-int-marquee] { animation: none !important; }
          [data-int-pulse] { animation: none !important; }
        }
      `}</style>

      {/* PART 1 — TRACKERS */}
      <section
        className="relative overflow-hidden border-t border-white/[0.06] py-20 lg:py-36"
        aria-labelledby="integrations-heading"
      >
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div
            data-int-float
            className="absolute -left-48 top-16 h-[650px] w-[650px] rounded-full bg-violet-600/[0.03] blur-[160px]"
            style={{ animation: "int-float-a 22s ease-in-out infinite" }}
          />
          <div
            data-int-float
            className="absolute -right-32 top-1/2 h-[500px] w-[500px] rounded-full bg-cyan-500/[0.02] blur-[140px]"
            style={{ animation: "int-float-b 28s ease-in-out infinite" }}
          />
          <div
            className="absolute inset-0 opacity-[0.015]"
            style={{
              backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
          />
        </div>

        <div className="relative">
          <SectionHeading
            id="integrations-heading"
            kicker="Integrations"
            title="Bring your list with you"
          >
            Tatakai plugs into the places you already track — connect once,
            import your history, and keep every list in sync.
          </SectionHeading>

          <Reveal>
            <IntegrationBeams />
          </Reveal>

          <div ref={trackRef} className="grid gap-4 md:grid-cols-3">
            {trackers.map((t) => (
              <SpotlightCard
                key={t.name}
                data-tracker
                className={`group relative flex h-full flex-col rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 backdrop-blur-sm transition-all duration-300 ease-out hover:-translate-y-2 hover:border-white/[0.15] hover:bg-white/[0.04] hover:shadow-[0_24px_80px_-24px_rgba(0,0,0,0.8)] motion-safe:active:scale-[0.97] motion-reduce:transition-none ${t.ring}`}
              >
                <div
                  className="pointer-events-none absolute -right-8 -top-16 h-40 w-40 rounded-full opacity-0 blur-[80px] transition-opacity duration-500 group-hover:opacity-100"
                  style={{ backgroundColor: `${t.accent}15` }}
                />

                <div className="relative mb-5 flex items-start justify-between gap-3">
                  <LogoImg src={t.logo} alt={`${t.name} logo`} fallback={t.fallback} />
                  <span className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-black/40 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">
                    <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />
                    OAuth ready
                  </span>
                </div>

                <h3 className="relative font-display text-xl font-medium tracking-[-0.02em] text-white">
                  {t.name}
                </h3>
                <p className="relative mt-0.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-white/30">
                  {t.kind}
                </p>
                <p className="relative mt-3 flex-1 text-sm leading-relaxed text-white/45">
                  {t.body}
                </p>

                <ul className="relative mt-5 flex flex-wrap gap-2" aria-label={`${t.name} capabilities`}>
                  {t.tags.map((tag) => (
                    <li
                      key={tag}
                      className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium text-white/55 transition-colors duration-200 group-hover:border-white/[0.12] group-hover:text-white/70"
                    >
                      <Check className="h-3 w-3 text-emerald-300/80" />
                      {tag}
                    </li>
                  ))}
                </ul>

                <div className="pointer-events-none absolute bottom-0 left-6 right-6 h-px overflow-hidden">
                  <div
                    className="h-full w-full opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                    style={{
                      background: `linear-gradient(90deg, transparent, ${t.accent}35, transparent)`,
                    }}
                  />
                </div>
              </SpotlightCard>
            ))}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {syncSteps.map((s, i) => {
              const Icon = s.icon;
              return (
                <Reveal key={s.title} delay={i * 0.06}>
                  <div className="group/step relative flex h-full items-start gap-3.5 overflow-hidden rounded-2xl border border-white/[0.06] bg-black/20 p-5 transition-all duration-300 hover:border-white/[0.1] hover:bg-black/30">
                    <span className="pointer-events-none absolute -right-2 -top-4 select-none font-display text-[72px] font-bold leading-none text-white/[0.02]">
                      {i + 1}
                    </span>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-300/15 bg-violet-400/[0.08] transition-colors duration-300 group-hover/step:bg-violet-400/[0.14]">
                      <Icon className="h-4 w-4 text-violet-300" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/25">
                        Step {i + 1}
                      </p>
                      <p className="font-display text-sm font-medium text-white">{s.title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-white/40">{s.body}</p>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* PART 2 — ECOSYSTEMS */}
      <section
        className="relative overflow-hidden border-t border-white/[0.06] py-20 lg:py-36"
        aria-labelledby="ecosystems-heading"
      >
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div
            data-int-float
            className="absolute left-1/3 top-0 h-[500px] w-[500px] rounded-full bg-cyan-500/[0.025] blur-[150px]"
            style={{ animation: "int-float-b 24s ease-in-out infinite" }}
          />
          <div
            data-int-float
            className="absolute -right-20 bottom-20 h-[400px] w-[400px] rounded-full bg-violet-500/[0.03] blur-[120px]"
            style={{ animation: "int-float-a 20s ease-in-out infinite" }}
          />
          <div
            className="absolute inset-0 opacity-[0.012]"
            style={{
              backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
          />
        </div>

        <div className="relative">
          <SectionHeading
            id="ecosystems-heading"
            kicker="Extension ecosystems"
            title="Now speaks Seanime & Stremio"
          >
            Install providers from the ecosystems you already use — streaming,
            torrent and manga sources, wired straight into your library.
          </SectionHeading>

          <Reveal>
            <div className="group/hub relative mb-8 overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-r from-white/[0.025] via-white/[0.04] to-white/[0.025] px-6 py-5 backdrop-blur-md">
              <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
                <div
                  className="h-full w-1/3 bg-gradient-to-r from-transparent via-white/[0.04] to-transparent opacity-0 transition-opacity duration-700 group-hover/hub:opacity-100"
                  style={{ animation: "int-shimmer-bar 3s ease-in-out infinite" }}
                />
              </div>

              <div className="relative flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5"
                    style={{ animation: "int-orbit-ring 4s ease-in-out infinite" }}
                  >
                    <Puzzle className="h-5 w-5 text-cyan-200" />
                  </span>
                  <div className="hidden items-center gap-1.5 sm:flex">
                    {ecosystems.map((e) => (
                      <span key={e.name} className="flex items-center gap-1.5">
                        <svg width="24" height="2" className="text-white/15" aria-hidden="true">
                          <line
                            x1="0"
                            y1="1"
                            x2="24"
                            y2="1"
                            stroke="currentColor"
                            strokeWidth="1"
                            strokeDasharray="3 3"
                            style={{ animation: "int-dash-flow 1.2s linear infinite" }}
                          />
                        </svg>
                        <LogoImg
                          src={e.logo}
                          alt={e.name}
                          fallback={e.fallback}
                          size="h-8 w-8"
                          rounded="rounded-lg"
                        />
                      </span>
                    ))}
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-sm font-medium text-white">
                    Paste a manifest — Tatakai reviews, then installs
                  </p>
                  <p className="truncate text-xs text-white/35">
                    Nothing installs silently · your action required
                  </p>
                </div>

                <span className="hidden items-center gap-1.5 rounded-full border border-cyan-300/20 bg-cyan-400/[0.07] px-3.5 py-1.5 text-[11px] font-semibold text-cyan-200 sm:flex">
                  <span className="relative flex h-1.5 w-1.5">
                    <span
                      data-int-pulse
                      className="absolute inline-flex h-full w-full rounded-full bg-cyan-300 opacity-75"
                      style={{ animation: "int-pulse-soft 2s ease-in-out infinite" }}
                    />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan-300" />
                  </span>
                  Open protocol
                </span>
              </div>
            </div>
          </Reveal>

          <div ref={ecoRef} className="grid gap-4 lg:grid-cols-2">
            {ecosystems.map((e) => (
              <SpotlightCard
                key={e.name}
                data-eco
                spotlightColor={`${e.accentColor}08`}
                spotlightSize={700}
                className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 backdrop-blur-sm transition-all duration-300 ease-out hover:-translate-y-2 hover:border-white/[0.15] hover:bg-white/[0.04] hover:shadow-[0_24px_80px_-24px_rgba(0,0,0,0.8)] motion-safe:active:scale-[0.97] motion-reduce:transition-none sm:p-7"
              >
                <div
                  className={`pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full blur-[80px] opacity-0 transition-opacity duration-500 group-hover:opacity-100 ${e.glow}`}
                />

                <div className="relative mb-5 flex items-start justify-between gap-3">
                  <LogoImg
                    src={e.logo}
                    alt={`${e.name} logo`}
                    fallback={e.fallback}
                    size="h-11 w-11"
                  />
                  <span className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-black/40 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: e.accentColor }}
                    />
                    {e.tag}
                  </span>
                </div>

                <h3 className="relative font-display text-xl font-medium tracking-[-0.02em] text-white">
                  {e.name}
                </h3>
                <p className="relative mt-3 flex-1 text-sm leading-relaxed text-white/45">
                  {e.body}
                </p>

                <ul aria-label={`${e.name} support details`} className="relative mt-5 grid gap-2">
                  {e.points.map((p) => (
                    <li key={p} className="flex items-center gap-2.5 text-sm text-white/55">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-emerald-300/15 bg-emerald-400/[0.06]">
                        <Check className="h-3 w-3 text-emerald-300/90" />
                      </span>
                      {p}
                    </li>
                  ))}
                </ul>

                <p className="relative mt-5 flex items-start gap-2 border-t border-white/[0.06] pt-4 text-xs leading-relaxed text-white/35">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300/60" />
                  {e.footnote}
                </p>

                <div className="pointer-events-none absolute bottom-0 left-6 right-6 h-px overflow-hidden">
                  <div
                    className="h-full w-full opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                    style={{
                      background: `linear-gradient(90deg, transparent, ${e.accentColor}35, transparent)`,
                    }}
                  />
                </div>
              </SpotlightCard>
            ))}
          </div>

          <Reveal>
            <div className="mt-6 overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-r from-white/[0.02] via-white/[0.035] to-white/[0.02] backdrop-blur-md">
              <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center">
                <div className="flex items-center gap-4 lg:min-w-0 lg:flex-1">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-400/[0.08]">
                    <Plug className="h-5 w-5 text-cyan-200" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-display text-sm font-medium text-white">
                      Add extension — paste, review, install
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Supported install inputs">
                      {installInputs.map((label) => (
                        <code
                          key={label}
                          className="rounded-md border border-white/[0.08] bg-black/40 px-2.5 py-0.5 font-mono text-[11px] text-white/50 transition-colors duration-200 hover:border-white/15 hover:text-white/65"
                        >
                          {label}
                        </code>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <p className="hidden text-xs text-white/30 xl:block">
                    Your action required — nothing installs silently.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate("/extensions")}
                    className="group/btn relative inline-flex h-12 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-full border border-white/20 bg-white px-7 text-sm font-semibold text-black transition-all duration-200 ease-out hover:shadow-[0_0_50px_-8px_rgba(255,255,255,0.4)] motion-safe:active:scale-[0.97] motion-reduce:transition-none"
                  >
                    <Plug className="relative h-4 w-4" />
                    <span className="relative">Open Extension Hub</span>
                    <ArrowUpRight className="relative h-4 w-4 transition-transform duration-200 group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5" />
                  </button>
                </div>
              </div>

              <div className="overflow-hidden border-t border-white/[0.05] py-3">
                <div
                  data-int-marquee
                  className="flex whitespace-nowrap"
                  style={{ animation: "int-marquee 35s linear infinite" }}
                >
                  {[0, 1].map((setIdx) => (
                    <div key={setIdx} className="flex shrink-0 items-center gap-8 pr-8">
                      {marqueeItems.map((item) => (
                        <span
                          key={`${setIdx}-${item}`}
                          className="flex items-center gap-2 text-[11px] font-medium text-white/20"
                        >
                          <Sparkles className="h-3 w-3 text-white/15" />
                          {item}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}