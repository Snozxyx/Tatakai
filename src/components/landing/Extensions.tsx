import { BRAND_ASSET_BASE } from '@/lib/assets';
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import uiI18n from "@/lib/uiI18n";
import { useUiTranslation } from "@/hooks/ui/useUiTranslation";
("use client");

import { useEffect, useRef } from "react";
import { useMotionPreference } from "@/hooks/ui/useMotionPreference";
import { animate, stagger } from "animejs";
import { Reveal } from "@/components/ui/Reveal";
import { ShowcaseMedia } from "@/components/landing/ShowcaseMedia";
import {
  Puzzle,
  Palette,
  Layers,
  Boxes,
  type LucideIcon,
} from "lucide-react";

const BRAND = BRAND_ASSET_BASE;

interface Ext {
  icon: LucideIcon;
  name: string;
  kind: string;
  accent: string;
}

// The extension model, shown as an installed add-ons strip beneath the demo.
const sources: Ext[] = [
  {
    icon: Boxes,
    name: "Tatakai",
    get kind() {
      return uiI18n.t("extensionUpdate.nativeKind");
    },
    accent: "text-primary",
  },
  {
    icon: Puzzle,
    name: "Stremio · Seanime",
    get kind() {
      return uiI18n.t("extensionUpdate.remoteKind");
    },
    accent: "text-primary",
  },
  {
    icon: Layers,
    name: "CloudStream · Aniyomi",
    get kind() {
      return uiI18n.t("extensionUpdate.streamKind");
    },
    accent: "text-primary",
  },
  {
    icon: Palette,
    name: "Mihon · Sora · Mangayomi",
    get kind() {
      return uiI18n.t("extensionUpdate.readingKind");
    },
    accent: "text-primary",
  },
];

export function Extensions() {
  useUiTranslation();
  const reduceMotion = useMotionPreference();
  const listRef = useRef<HTMLDivElement>(null);

  // anime.js: slide the source cards in once, when the strip scrolls into view.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const rows = Array.from(el.querySelectorAll<HTMLElement>("[data-ext]"));
    if (!rows.length) return;

    if (reduceMotion) {
      rows.forEach((r) => {
        r.style.opacity = "1";
        r.style.transform = "none";
      });
      return;
    }

    let played = false;
    let entrance: ReturnType<typeof animate> | undefined;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || played) return;
        played = true;
        entrance = animate(rows, {
          opacity: [0, 1],
          translateY: [20, 0],
          delay: stagger(90),
          duration: 620,
          ease: "out(3)",
        });
        io.disconnect();
      },
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      entrance?.revert();
    };
  }, [reduceMotion]);

  return (
    <section className="py-16 lg:py-24">
      <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
        <Reveal className="lg:order-1">
          <ShowcaseMedia
            type="video"
            src={`${BRAND}/extension.mp4`}
            label={uiI18n.t("app.extensions_preview_729c8ac3")}
          />
        </Reveal>

        <Reveal className="lg:order-2">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 backdrop-blur-md">
              <Puzzle className="h-3.5 w-3.5 text-violet-300" />
              <span className="text-xs font-medium text-white/70">
                {uiI18n.t("app.extensions_656bcfe2")}
              </span>
            </div>
            <h2 className="mb-4 font-display text-[clamp(1.6rem,3vw,2.5rem)] font-medium leading-[1.05] tracking-[-0.03em] text-white">
              {uiI18n.t("extensionUpdate.landingTitle")}
            </h2>
            <p className="mb-6 max-w-md text-base leading-relaxed text-white/60">
              {uiI18n.t("extensionUpdate.landingBody")}
            </p>
            <ul className="flex flex-wrap gap-2">
              {[
                "Tatakai",
                "Stremio",
                "Seanime",
                "CloudStream",
                "Mihon",
                "Aniyomi",
                "Sora",
                "Mangayomi",
              ].map((name) => (
                <li
                  key={name}
                  className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground"
                >
                  {name}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              {uiI18n.t("extensionUpdate.compatibilityNote")}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild>
                <Link to="/extensions">
                  {uiI18n.t("extensionUpdate.browse")}
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/faq/extension-support">
                  {uiI18n.t("extensionUpdate.guide")}
                </Link>
              </Button>
            </div>
          </div>
        </Reveal>
      </div>

      <div
        ref={listRef}
        className="mt-10 grid gap-3 sm:grid-cols-2 lg:mt-12 lg:grid-cols-4"
      >
        {sources.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.name}
              data-ext
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-md transition-colors duration-300 hover:border-white/25 hover:bg-white/[0.05]"
            >
              <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                <Icon className={`h-5 w-5 ${s.accent}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-sm font-medium text-white">
                  {s.name}
                </p>
                <p className="truncate text-xs text-white/50">{s.kind}</p>
              </div>
              <span className="size-2 shrink-0 rounded-full bg-primary/60" aria-hidden="true" />
            </div>
          );
        })}
      </div>
    </section>
  );
}
