"use client";

import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Play, Download, Sparkles } from "lucide-react";
import { Navigation } from "@/components/ui/navbar";
import { useAuth } from "@/contexts/AuthContext";
import { useGitHubRepo, useLatestRelease, useAllReleases, platformForAsset, formatCompact, GITHUB_REPO_URL } from "@/lib/github";
import { supabase } from "@/integrations/supabase/client";
import { FeatureShowcase } from "@/components/landing/FeatureShowcase";

const words = ["explore", "discover", "immerse", "love"];

function BlurWord({ word, trigger }: { word: string; trigger: number }) {
  const letters = word.split("");
  const STAGGER = 45;
  const DURATION = 500;
  const GRADIENT_HOLD = STAGGER * letters.length + DURATION + 200;

  const [letterStates, setLetterStates] = useState<{ opacity: number; blur: number }[]>(
    letters.map(() => ({ opacity: 0, blur: 20 }))
  );
  const [showGradient, setShowGradient] = useState(true);
  const framesRef = useRef<number[]>([]);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    framesRef.current.forEach(cancelAnimationFrame);
    timersRef.current.forEach(clearTimeout);
    framesRef.current = [];
    timersRef.current = [];

    setLetterStates(letters.map(() => ({ opacity: 0, blur: 20 })));
    setShowGradient(true);

    letters.forEach((_, i) => {
      const t = setTimeout(() => {
        const start = performance.now();
        const tick = (now: number) => {
          const progress = Math.min((now - start) / DURATION, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          setLetterStates(prev => {
            const next = [...prev];
            next[i] = { opacity: eased, blur: 20 * (1 - eased) };
            return next;
          });
          if (progress < 1) {
            const id = requestAnimationFrame(tick);
            framesRef.current.push(id);
          }
        };
        const id = requestAnimationFrame(tick);
        framesRef.current.push(id);
      }, i * STAGGER);
      timersRef.current.push(t);
    });

    const gt = setTimeout(() => setShowGradient(false), GRADIENT_HOLD);
    timersRef.current.push(gt);

    return () => {
      framesRef.current.forEach(cancelAnimationFrame);
      timersRef.current.forEach(clearTimeout);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  const gradientColors = ["#eca8d6", "#a78bfa", "#67e8f9", "#fbbf24", "#eca8d6"];

  return (
    <>
      {letters.map((char, i) => {
        const colorIndex = (i / Math.max(letters.length - 1, 1)) * (gradientColors.length - 1);
        const lower = Math.floor(colorIndex);
        const upper = Math.min(lower + 1, gradientColors.length - 1);
        const t = colorIndex - lower;

        const hex2rgb = (hex: string) => {
          const r = parseInt(hex.slice(1, 3), 16);
          const g = parseInt(hex.slice(3, 5), 16);
          const b = parseInt(hex.slice(5, 7), 16);
          return [r, g, b];
        };
        const [r1, g1, b1] = hex2rgb(gradientColors[lower]);
        const [r2, g2, b2] = hex2rgb(gradientColors[upper]);
        const r = Math.round(r1 + (r2 - r1) * t);
        const g = Math.round(g1 + (g2 - g1) * t);
        const b = Math.round(b1 + (b2 - b1) * t);

        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity: letterStates[i]?.opacity ?? 0,
              filter: `blur(${letterStates[i]?.blur ?? 20}px)`,
              color: showGradient ? `rgb(${r},${g},${b})` : "white",
              transition: "color 0.4s ease",
            }}
          >
            {char}
          </span>
        );
      })}
    </>
  );
}

export default function LandingPage() {
  const [isVisible, setIsVisible] = useState(false);
  const [wordIndex, setWordIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  const repo = useGitHubRepo();
  const latest = useLatestRelease();
  const releases = useAllReleases();

  const [avatars, setAvatars] = useState<string[]>([]);

  // Real community members: sample recent public profiles that have an avatar
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("avatar_url")
        .eq("is_public", true)
        .not("avatar_url", "is", null)
        .order("updated_at", { ascending: false })
        .limit(30);
      if (cancelled || !data) return;
      const urls = (data as { avatar_url: string | null }[])
        .map((p) => p.avatar_url)
        .filter((u): u is string => !!u)
        .sort(() => Math.random() - 0.5)
        .slice(0, 5);
      setAvatars(urls);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const stars = repo ? formatCompact(repo.stargazers_count) : null;
  const forks = repo ? formatCompact(repo.forks_count) : null;
  const latestVersion = latest?.tag_name ? latest.tag_name.replace(/^v/i, "") : null;
  // Download counts across ALL releases (matches DownloadPage & admin analytics).
  // Split mobile out so the Android/iOS traction is visible on the hero, not just
  // folded into the desktop installer total.
  const { latestDownloads, mobileDownloads } = releases
    ? releases.reduce(
        (acc, r) => {
          r.assets.forEach((a) => {
            acc.latestDownloads += a.download_count || 0;
            const k = platformForAsset(a.name);
            if (k === "android" || k === "ios") acc.mobileDownloads += a.download_count || 0;
          });
          return acc;
        },
        { latestDownloads: 0, mobileDownloads: 0 },
      )
    : { latestDownloads: 0, mobileDownloads: 0 };

  const heroStats = [
    { value: stars ?? "—", label: "GitHub stars" },
    { value: latestVersion ? `v${latestVersion}` : "—", label: "latest release" },
    latestDownloads > 0
      ? { value: formatCompact(latestDownloads), label: "app downloads" }
      : { value: forks ?? "—", label: "GitHub forks" },
    mobileDownloads > 0
      ? { value: formatCompact(mobileDownloads), label: "mobile downloads" }
      : null,
  ].filter(Boolean) as { value: string; label: string }[];

  useEffect(() => {
    setMounted(true);
    setIsVisible(true);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setWordIndex((prev) => (prev + 1) % words.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black text-white">
      {/* ===================== HERO ===================== */}
      <section className="relative min-h-screen w-full overflow-hidden">
      {/* Animated gradient orb background */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute -top-32 -left-32 h-[500px] w-[500px] rounded-full bg-violet-600/20 blur-[120px] animate-pulse" />
        <div className="absolute top-1/2 -right-32 h-[600px] w-[600px] rounded-full bg-pink-500/15 blur-[140px] animate-pulse [animation-delay:1s]" />
        <div className="absolute bottom-0 left-1/3 h-[400px] w-[400px] rounded-full bg-cyan-500/15 blur-[120px] animate-pulse [animation-delay:2s]" />
      </div>

      {/* Background Video */}
      <div className="absolute inset-0 z-0">
        <video
          autoPlay
          muted
          loop
          playsInline
          aria-hidden="true"
          className="h-full w-full object-cover object-center opacity-50"
        >
          <source src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/bg-hero-0BnFGdr81Ifnj3WbBZoNt1KE4D5DMT.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/70 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_0%,_black_100%)]" />
      </div>

      {/* Subtle noise texture overlay */}
      <div
        className="pointer-events-none absolute inset-0 z-[1] opacity-[0.03] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Subtle Grid Lines */}
      <div className="pointer-events-none absolute inset-0 z-[2] overflow-hidden opacity-[0.08]">
        {[...Array(8)].map((_, i) => (
          <div
            key={`h-${i}`}
            className="absolute h-px w-full bg-gradient-to-r from-transparent via-white to-transparent"
            style={{ top: `${12.5 * (i + 1)}%` }}
          />
        ))}
        {[...Array(12)].map((_, i) => (
          <div
            key={`v-${i}`}
            className="absolute h-full w-px bg-gradient-to-b from-transparent via-white to-transparent"
            style={{ left: `${8.33 * (i + 1)}%` }}
          />
        ))}
      </div>

      {/* Top Header Navigation */}
      <div className="relative z-30">
        <Navigation />
      </div>

      {/* Main Content */}
      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1400px] flex-col justify-between px-6 pt-32 pb-10 lg:px-16">
        {/* Hero Section */}
        <div className="flex flex-1 flex-col justify-center">
          {/* Tag pill */}
          <div
            className={`mb-8 inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 backdrop-blur-md transition-all duration-700 ${
              mounted ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"
            }`}
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span className="text-xs font-medium tracking-wide text-white/80">
              Now in beta — v6.0 released
            </span>
            <Sparkles className="h-3 w-3 text-violet-300" />
          </div>

          {/* Main headline */}
          <h1
            className={`mb-8 max-w-4xl text-[clamp(2.4rem,6vw,5.5rem)] font-display font-medium leading-[0.95] tracking-[-0.04em] text-white transition-all duration-1000 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
            }`}
          >
            <span className="block whitespace-nowrap text-white/60">Your portal to</span>
            <span className="block whitespace-nowrap">
              anime &amp; manga
            </span>
            <span className="block whitespace-nowrap">
              you{" "}
              <span className="relative inline-block align-baseline">
                <BlurWord word={words[wordIndex]} trigger={wordIndex} />
                <svg
                  className="absolute -bottom-2 left-0 h-3 w-full text-violet-400"
                  viewBox="0 0 200 12"
                  fill="none"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path
                    d="M2 9 Q 50 2, 100 6 T 198 5"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    fill="none"
                  />
                </svg>
              </span>
            </span>
          </h1>

          {/* Subheadline */}
          <p
            className={`mb-10 max-w-xl text-base leading-relaxed text-white/60 transition-all duration-1000 delay-200 lg:text-lg ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
            }`}
          >
            Track, discover, and curate your personal library of anime & manga.
            Built for fans who want a beautiful, distraction-free experience.
          </p>

          {/* CTA Buttons */}
          <div
            className={`flex flex-wrap items-center gap-4 transition-all duration-1000 delay-300 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
            }`}
          >
            <Button
              size="lg"
              onClick={() => navigate("/download")}
              className="group relative h-12 overflow-hidden rounded-full border border-white/20 bg-white px-7 text-sm font-semibold text-black shadow-[0_0_30px_-5px_rgba(255,255,255,0.4)] transition-all hover:scale-[1.02] hover:shadow-[0_0_40px_-5px_rgba(255,255,255,0.6)] cursor-pointer"
            >
              <span className="relative z-10 flex items-center gap-2">
                <Download className="h-4 w-4" />
                <span>Download App</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </span>
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => navigate("/browse")}
              className="h-12 rounded-full border border-white/15 bg-white/5 px-7 text-sm font-semibold text-white backdrop-blur-md transition-all hover:border-white/30 hover:bg-white/10 cursor-pointer"
            >
              <Play className="mr-2 h-4 w-4 fill-current" />
              <span>Browse</span>
            </Button>
          </div>

          {/* Trust line */}
          <div
            className={`mt-10 flex items-center gap-4 text-xs text-white/40 transition-all duration-1000 delay-500 ${
              isVisible ? "opacity-100" : "opacity-0"
            }`}
          >
            <div className="flex -space-x-2">
              {avatars.length > 0
                ? avatars.map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      alt="Community member"
                      loading="lazy"
                      className="h-7 w-7 rounded-full border-2 border-black object-cover bg-white/10"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ))
                : ["#a78bfa", "#67e8f9", "#fbbf24", "#eca8d6"].map((c, i) => (
                    <div
                      key={i}
                      className="h-7 w-7 rounded-full border-2 border-black"
                      style={{ background: `linear-gradient(135deg, ${c}, #fff)` }}
                    />
                  ))}
            </div>
            <span className="font-medium">
              <span className="text-white">Free &amp; open source</span> — join the community
            </span>
            <span className="hidden h-3 w-px bg-white/20 sm:block" />
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden font-mono transition-colors hover:text-white sm:inline"
            >
              ★ {stars ?? "—"} on GitHub
            </a>
          </div>
        </div>

        {/* Bottom Stats Section */}
        <div
          className={`w-full border-t border-white/10 pt-6 transition-all duration-1000 delay-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="flex flex-wrap items-center gap-8 lg:gap-14">
              {heroStats.map((stat) => (
                <div key={stat.label} className="flex flex-col gap-1">
                  <span className="font-display text-3xl font-medium text-white lg:text-4xl">
                    {stat.value}
                  </span>
                  <span className="text-xs font-medium tracking-wide text-white/40">
                    {stat.label}
                  </span>
                </div>
              ))}
            </div>

            {/* Scroll indicator */}
            <div className="hidden items-center gap-3 text-xs font-mono text-white/40 md:flex">
              <span>SCROLL</span>
              <div className="relative h-px w-16 overflow-hidden bg-white/10">
                <div className="absolute inset-y-0 left-0 w-1/2 animate-[shimmer_2s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white to-transparent" />
              </div>
            </div>
          </div>
        </div>
      </main>
      </section>

      {/* ===================== FEATURE SHOWCASE ===================== */}
      <FeatureShowcase />

      {/* Custom shimmer keyframes */}
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  );
}