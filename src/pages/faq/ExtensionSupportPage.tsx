import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  Check,
  Clapperboard,
  Code2,
  Info,
  Library,
  MessageSquare,
  Puzzle,
  Server,
  ShieldAlert,
  Smartphone,
  Subtitles,
  Terminal,
  Router,
  X,
} from "lucide-react";
import { Background } from "@/components/layout/Background";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { FooterSection } from "@/components/ui/footer";
import { useIsDesktopApp } from "@/hooks/ui/useIsNativeApp";
import { useIsMobile } from "@/hooks/ui/use-mobile";
import { cn } from "@/lib/utils";

type SupportStatus = "supported" | "desktop" | "not-supported";

interface ExtensionType {
  ecosystem: "Stremio" | "Seanime" | "Seanime Comix";
  icon: typeof Server;
  title: string;
  support: string;
  status: SupportStatus;
}

const extensionTypes: ExtensionType[] = [
  {
    ecosystem: "Stremio",
    icon: Server,
    title: "HTTP/JSON streaming addons",
    support: "Video sources, request headers, and torrent streams.",
    status: "supported",
  },
  {
    ecosystem: "Stremio",
    icon: Subtitles,
    title: "Subtitle addons",
    support: "Custom subtitles available from the video's subtitle settings.",
    status: "supported",
  },
  {
    ecosystem: "Stremio",
    icon: Library,
    title: "Catalog, metadata, and stream addons",
    support: "Custom browsing through the + source menu.",
    status: "supported",
  },
  {
    ecosystem: "Seanime",
    icon: Clapperboard,
    title: "JavaScript / TypeScript streaming providers",
    support: "Anime search, episodes, servers, and playback.",
    status: "supported",
  },
  {
    ecosystem: "Seanime",
    icon: BookOpen,
    title: "JavaScript / TypeScript manga providers",
    support: "Manga search, chapters, and reader pages.",
    status: "supported",
  },
  {
    ecosystem: "Seanime",
    icon: Router,
    title: "JavaScript / TypeScript torrent providers",
    support: "Torrent search plus magnet and hash resolution.",
    status: "supported",
  },
  {
    ecosystem: "Seanime",
    icon: Puzzle,
    title: "Compatible custom-source providers",
    support: "Anime and manga browsing through the + source menu.",
    status: "supported",
  },
  {
    ecosystem: "Seanime Comix",
    icon: Terminal,
    title: "ChromeDP-based manga providers",
    support: "Desktop only, using Tatakai's browser host.",
    status: "desktop",
  },
];

const unsupportedTypes = [
  "Seanime Go extensions",
  "UI or system plugins",
  "Providers requiring unimplemented host APIs such as $scannerUtils, $torrentUtils, $habari, or CryptoJS",
];

const faqJsonLd = [
  {
    "@type": "Question",
    name: "What extension types does Tatakai support?",
    acceptedAnswer: {
      "@type": "Answer",
      text: "Tatakai supports Stremio HTTP/JSON streaming, subtitle, catalog, metadata, and stream addons; JavaScript and TypeScript Seanime anime, manga, torrent, and compatible custom-source providers; and desktop-only Seanime Comix ChromeDP manga providers.",
    },
  },
  {
    "@type": "Question",
    name: "Does Tatakai support Seanime Go extensions?",
    acceptedAnswer: {
      "@type": "Answer",
      text: "No. Seanime Go extensions, UI/system plugins, and providers requiring unimplemented host APIs are not currently supported.",
    },
  },
  {
    "@type": "Question",
    name: "Do all supported extensions work in Tatakai?",
    acceptedAnswer: {
      "@type": "Answer",
      text: "No. A supported format does not guarantee a working source. Site blocks, outdated provider code, configuration, missing title matches, CORS, and host capabilities can still cause failures.",
    },
  },
];

function StatusBadge({ status }: { status: SupportStatus }) {
  if (status === "desktop") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-200">
        <Smartphone className="h-3 w-3" /> Desktop only
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-200">
      <Check className="h-3 w-3" /> Supported
    </span>
  );
}

export default function ExtensionSupportPage() {
  const isDesktopApp = useIsDesktopApp();
  const isMobile = useIsMobile();

  return (
    <>
      <Helmet>
        <title>Tatakai Extension Support FAQ — Stremio, Seanime & Comix</title>
        <meta
          name="description"
          content="See which Stremio, Seanime JavaScript/TypeScript, and Seanime Comix extensions Tatakai supports, including streaming, manga, novels, subtitles, torrents, and custom sources."
        />
        <meta
          name="keywords"
          content="Tatakai extension support, Tatakai Stremio addons, Tatakai Seanime extensions, Seanime JS providers, Seanime manga providers, Seanime Comix"
        />
        <link rel="canonical" href="https://tatakai.me/faq/extension-support" />
        <meta property="og:title" content="Tatakai Extension Support FAQ" />
        <meta
          property="og:description"
          content="A current compatibility guide for Stremio, Seanime, and Seanime Comix extensions in Tatakai."
        />
        <meta property="og:type" content="article" />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            name: "Tatakai Extension Support FAQ",
            url: "https://tatakai.me/faq/extension-support",
            description:
              "Current compatibility guide for Stremio, Seanime, and Seanime Comix extensions in Tatakai.",
            mainEntity: faqJsonLd,
          })}
        </script>
      </Helmet>

      <div className="min-h-screen overflow-x-hidden bg-background text-foreground selection:bg-primary/30">
        <Background />
        {!isMobile && <Sidebar />}

        <main
          className={cn(
            "relative z-10 mx-auto max-w-[1160px] px-6 pb-24 pt-10 md:pb-32",
            isDesktopApp ? "" : "md:pl-32",
          )}
        >
          <Link
            to="/welcome"
            className="mb-10 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Welcome
          </Link>

          <header className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-primary">
              <Puzzle className="h-3.5 w-3.5" /> Extension FAQ
            </span>
            <h1 className="mt-5 font-display text-4xl font-black tracking-tight sm:text-6xl">
              What extensions does Tatakai support?
            </h1>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground sm:text-lg">
              Tatakai can connect to several extension ecosystems for anime, manga,
              novels, subtitles, and streams. This page describes the formats and
              host APIs that are currently supported.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70">
                Stremio addons
              </span>
              <span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
                Seanime JavaScript / TypeScript
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70">
                Seanime Comix
              </span>
            </div>
          </header>

          <section className="mt-14" aria-labelledby="supported-extension-types">
            <div className="mb-6 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
                  Compatibility matrix
                </p>
                <h2 id="supported-extension-types" className="mt-2 font-display text-2xl font-bold sm:text-3xl">
                  Supported extension types
                </h2>
              </div>
              <span className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
                <Info className="h-4 w-4" /> Compatibility can vary by provider
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {extensionTypes.map((extension) => {
                const Icon = extension.icon;
                return (
                  <article
                    key={`${extension.ecosystem}-${extension.title}`}
                    className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 transition-colors hover:border-white/20 hover:bg-white/[0.055]"
                  >
                    <div className="flex items-start gap-4">
                      <div className="rounded-xl border border-primary/20 bg-primary/10 p-2.5 text-primary">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">
                            {extension.ecosystem}
                          </span>
                          <StatusBadge status={extension.status} />
                        </div>
                        <h3 className="mt-2 font-display text-lg font-bold text-white">
                          {extension.title}
                        </h3>
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                          {extension.support}
                        </p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="mt-16 grid gap-5 lg:grid-cols-2" aria-labelledby="extension-limitations">
            <article className="rounded-2xl border border-rose-400/20 bg-rose-400/[0.04] p-6">
              <div className="flex items-center gap-3">
                <ShieldAlert className="h-5 w-5 text-rose-200" />
                <h2 id="extension-limitations" className="font-display text-xl font-bold">
                  Not supported right now
                </h2>
              </div>
              <ul className="mt-5 space-y-3 text-sm leading-relaxed text-muted-foreground">
                {unsupportedTypes.map((item) => (
                  <li key={item} className="flex gap-3">
                    <X className="mt-0.5 h-4 w-4 shrink-0 text-rose-200" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-5 border-t border-rose-200/10 pt-4 text-xs leading-relaxed text-muted-foreground/80">
                Other ChromeDP providers need an individual compatibility check.
              </p>
            </article>

            <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
              <div className="flex items-center gap-3">
                <Code2 className="h-5 w-5 text-primary" />
                <h2 className="font-display text-xl font-bold">Host and troubleshooting notes</h2>
              </div>
              <ul className="mt-5 space-y-4 text-sm leading-relaxed text-muted-foreground">
                <li className="flex gap-3">
                  <Router className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>Torrents require a torrent-capable host. Mobile uses native transport; browser operation depends on CORS.</span>
                </li>
                <li className="flex gap-3">
                  <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>A supported format does not guarantee a working source. Blocks, outdated provider code, configuration, or missing title matches can still cause failures.</span>
                </li>
                <li className="flex gap-3">
                  <Terminal className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>Enable Developer Mode to see each provider's results and errors when diagnosing a source.</span>
                </li>
              </ul>
            </article>
          </section>

          <section className="mt-16 rounded-2xl border border-primary/20 bg-primary/[0.06] p-6 sm:p-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Need more detail?</p>
                <h2 className="mt-2 font-display text-2xl font-bold">Compare Tatakai and Seanime</h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  Read the honest feature comparison, including extension architecture, playback, community features, and platform differences.
                </p>
              </div>
              <Link
                to="/faq/seanime-vs-tatakai"
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition-[background-color,transform] hover:brightness-110 motion-safe:active:scale-[0.97]"
              >
                Seanime vs Tatakai <ArrowLeft className="h-4 w-4 rotate-180" />
              </Link>
            </div>
          </section>
        </main>

        <MobileNav />
      </div>
    </>
  );
}
