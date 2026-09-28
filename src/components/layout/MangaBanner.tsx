import {
  ArrowRight,
  BookOpen,
  Layers,
  Sparkles,
  SlidersHorizontal,
} from 'lucide-react';
import { Link } from 'react-router-dom';

const BANNER_IMAGE = '/assets/image/content/illustriation.jpg';

const FEATURES = [
  { icon: Sparkles, label: 'Weekly Spotlights' },
  { icon: Layers, label: 'Source Picker' },
  { icon: SlidersHorizontal, label: 'Smart Reader' },
] as const;

export function ReleaseV6Banner() {
  return (
    <section className="mb-10 md:mb-16">
      <Link
        to="/manga"
        className="group relative isolate block overflow-hidden rounded-[2rem] border border-white/10 bg-black shadow-2xl ring-1 ring-inset ring-white/5 transition-all duration-500 hover:border-white/20  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {/* ---------- Background layers ---------- */}

        {/* Image */}
        <div className="absolute inset-0 -z-10">
          <img
            src={BANNER_IMAGE}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover opacity-60 transition-transform duration-[1200ms] ease-out group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        </div>

        {/* Directional gradient (bottom on mobile, left on desktop) */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-background via-background/75 to-background/10 md:bg-gradient-to-r md:from-background md:via-background/70 md:to-transparent" />

        {/* Soft vignette */}
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.55)_100%)]" />

        {/* Subtle dot texture, faded toward the image side */}
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(rgba(255,255,255,0.07)_1px,transparent_1px)] [background-size:18px_18px] [mask-image:linear-gradient(to_right,black,transparent_60%)]" />

        {/* Accent glow */}
        <div className="absolute -left-32 -top-32 -z-10 h-80 w-80 rounded-full bg-primary/25 opacity-60 blur-3xl transition-opacity duration-700 group-hover:opacity-100" />

        {/* Top hairline highlight */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

        {/* Hover shine sweep */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -left-1/2 z-30 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 transition-all duration-1000 ease-out group-hover:left-[120%] group-hover:opacity-100 motion-reduce:hidden"
        />

        {/* ---------- Decorative page stack (desktop) ---------- */}
        <div
          aria-hidden
          className="pointer-events-none absolute right-12 top-1/2 z-10 hidden -translate-y-1/2 lg:block xl:right-20"
        >
          <div className="relative h-64 w-44 xl:h-72 xl:w-48">
            
            {/* Back page */}
            <div className="absolute inset-0 -translate-x-10 -rotate-12 rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm transition-transform duration-700 ease-out group-hover:-translate-x-16 group-hover:-rotate-[18deg]" />
            {/* Middle page */}
            
            <div className="absolute inset-0 -translate-x-5 -rotate-6 rounded-2xl border border-white/10 bg-white/[0.07] backdrop-blur-sm transition-transform duration-700 ease-out group-hover:-translate-x-8 group-hover:-rotate-[9deg]" />
            {/* Front page */}
            <div className="absolute inset-0 overflow-hidden rounded-2xl border border-white/15 shadow-2xl transition-transform duration-700 ease-out group-hover:-translate-y-2 group-hover:rotate-2">
              <img
                src="https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx172619-LSoXY45QAas4.jpg"
                alt=""
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-white/60">
                  Now Reading
                </p>
                <p className="mt-0.5 text-sm font-bold text-white">Chapter 142</p>
                <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/15">
                  <div className="h-full w-2/3 rounded-full bg-primary transition-all duration-700 group-hover:w-5/6" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ---------- Content ---------- */}
        <div className="relative z-20 flex min-h-[360px] flex-col justify-end p-6 sm:p-10 md:min-h-[400px] md:justify-center md:p-12 lg:max-w-[62%] lg:p-14">
          {/* Badge */}
          <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-primary/30 bg-primary/10 py-1 pl-1 pr-3 text-[10px] font-bold uppercase tracking-widest text-primary backdrop-blur-md">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-2 py-0.5 text-primary-foreground">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-75 motion-reduce:animate-none" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
              </span>
              New
            </span>
            <BookOpen className="h-3.5 w-3.5" />
            Tatakai V6 Update
          </div>

          {/* Headline */}
          <h2 className="font-display text-3xl font-black leading-[1.05] tracking-tight text-white [text-wrap:balance] sm:text-4xl md:text-5xl lg:text-6xl">
            Manga Hub{' '}
            <span className="bg-gradient-to-br from-primary via-primary to-primary/50 bg-clip-text text-transparent">
              V6
            </span>{' '}
            is live.
          </h2>

          {/* Description */}
          <p className="mt-4 max-w-xl text-sm font-medium leading-relaxed text-white/70 [text-wrap:pretty] sm:text-base md:text-lg">
            Discover weekly spotlights, pick chapter sources with confidence, and
            enjoy a completely rebuilt premium reader with smart controls.
          </p>

          {/* Feature chips */}
          <ul className="mt-6 flex flex-wrap gap-2">
            {FEATURES.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80 backdrop-blur-md"
              >
                <Icon className="h-3.5 w-3.5 text-primary" />
                {label}
              </li>
            ))}
          </ul>

          {/* CTA (visual only, since the whole card is the link) */}
          <div className="mt-8">
            <span className="inline-flex h-12 items-center gap-2.5 rounded-full bg-white pl-7 pr-2 text-sm font-bold text-black shadow-[0_8px_24px_-8px_rgba(255,255,255,0.5)] transition-all duration-300 group-hover:shadow-[0_10px_32px_-6px_rgba(255,255,255,0.6)] group-active:scale-[0.97]">
              Open Manga Hub
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-white transition-transform duration-300 group-hover:translate-x-0.5">
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:-rotate-45 motion-reduce:group-hover:rotate-0" />
              </span>
            </span>
          </div>
        </div>
      </Link>
    </section>
  );
}