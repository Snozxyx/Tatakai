import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import uiI18n from "@/lib/uiI18n";
import { useUiTranslation } from "@/hooks/ui/useUiTranslation";
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

type SupportStatus = "supported" | "desktop" | "not-supported" | "platform";

interface ExtensionType {
  ecosystem: string;
  icon: typeof Server;
  title: string;
  support: string;
  status: SupportStatus;
}

const extensionTypes: ExtensionType[] = [
  {
    ecosystem: "Tatakai",
    icon: Puzzle,
    get title() {
      return uiI18n.t("extensionUpdate.nativeTitle");
    },
    get support() {
      return uiI18n.t("extensionUpdate.nativeDetail");
    },
    status: "supported",
  },
  ...[
    ["CloudStream", "cloudTitle", "cloudDetail"],
    ["Mihon", "mihonTitle", "mihonDetail"],
    ["Aniyomi", "aniyomiTitle", "aniyomiDetail"],
    ["Sora", "soraTitle", "soraDetail"],
    ["Mangayomi", "mangayomiTitle", "mangayomiDetail"],
    ["Tatakai Server", "serverTitle", "serverDetail"],
  ].map(([ecosystem, title, support]) => ({
    ecosystem,
    icon:
      ecosystem === "Tatakai Server"
        ? Server
        : ecosystem === "Mihon"
        ? BookOpen
        : Puzzle,
    get title() {
      return uiI18n.t("extensionUpdate." + title);
    },
    get support() {
      return uiI18n.t("extensionUpdate." + support);
    },
    status: "platform" as const,
  })),
  {
    ecosystem: "Stremio",
    icon: Server,
    get title() {
      return uiI18n.t("app.http_json_streaming_addons_897cfc6e");
    },
    support: "Video sources, request headers, and torrent streams.",
    status: "supported",
  },
  {
    ecosystem: "Stremio",
    icon: Subtitles,
    get title() {
      return uiI18n.t("app.subtitle_addons_68177305");
    },
    support: "Custom subtitles available from the video's subtitle settings.",
    status: "supported",
  },
  {
    ecosystem: "Stremio",
    icon: Library,
    get title() {
      return uiI18n.t("app.catalog_metadata_and_stream_addons_c0d88895");
    },
    support: "Custom browsing through the + source menu.",
    status: "supported",
  },
  {
    ecosystem: "Seanime",
    icon: Clapperboard,
    get title() {
      return uiI18n.t("app.javascript_typescript_streaming_providers_a77481dd");
    },
    support: "Anime search, episodes, servers, and playback.",
    status: "supported",
  },
  {
    ecosystem: "Seanime",
    icon: BookOpen,
    get title() {
      return uiI18n.t("app.javascript_typescript_manga_providers_cbbd7610");
    },
    support: "Manga search, chapters, and reader pages.",
    status: "supported",
  },
  {
    ecosystem: "Seanime",
    icon: Router,
    get title() {
      return uiI18n.t("app.javascript_typescript_torrent_providers_78f97817");
    },
    support: "Torrent search plus magnet and hash resolution.",
    status: "supported",
  },
  {
    ecosystem: "Seanime",
    icon: Puzzle,
    get title() {
      return uiI18n.t("app.compatible_custom_source_providers_60802a65");
    },
    support: "Anime and manga browsing through the + source menu.",
    status: "supported",
  },
  {
    ecosystem: "Seanime Comix",
    icon: Terminal,
    get title() {
      return uiI18n.t("app.chromedp_based_manga_providers_2dfaf246");
    },
    support: "Desktop only, using Tatakai's browser host.",
    status: "desktop",
  },
];

const unsupportedTypes = [
  "Seanime Go extensions",
  "UI or system plugins",
  "Providers requiring unimplemented host APIs such as $scannerUtils, $torrentUtils, $habari, or CryptoJS",
];

const extensionFaqs = [
  ["qTypes", "aTypes"],
  ["qInstall", "aInstall"],
  ["qStacks", "aStacks"],
  ["qServers", "aServers"],
  ["qWorking", "aWorking"],
];
const faqJsonLd = extensionFaqs.map(([question, answer]) => ({
  "@type": "Question",
  get name() {
    return uiI18n.t("extensionUpdate." + question);
  },
  get acceptedAnswer() {
    return { "@type": "Answer", text: uiI18n.t("extensionUpdate." + answer) };
  },
}));

function StatusBadge({ status }: { status: SupportStatus }) {
  useUiTranslation();
  if (status === "platform")
    return (
      <Badge variant="outline" className="text-amber">
        {uiI18n.t("extensionUpdate.platform")}
      </Badge>
    );
  if (status === "desktop") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-200">
        <Smartphone className="h-3 w-3" />{" "}
        {uiI18n.t("app.desktop_only_06cea5ef")}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-200">
      <Check className="h-3 w-3" /> {uiI18n.t("app.supported_0bf8509b")}
    </span>
  );
}

export default function ExtensionSupportPage() {
  useUiTranslation();
  const isDesktopApp = useIsDesktopApp();
  const isMobile = useIsMobile();

  return (
    <>
      <Helmet>
        <title>
          {uiI18n.t("app.what_extensions_does_tatakai_support_15ce2a55") +
            " — Tatakai"}
        </title>
        <meta
          name="description"
          content="Explore Tatakai, Stremio, Seanime, CloudStream, Mihon, Aniyomi, Sora and Mangayomi extension compatibility, community stacks and server connections."
        />
        <meta
          name="keywords"
          content="Tatakai extension support, Stremio, Seanime, CloudStream, Mihon, Aniyomi, Sora, Mangayomi, Tatakai Server"
        />
        <link rel="canonical" href="https://tatakai.me/faq/extension-support" />
        <meta property="og:title" content="Tatakai Extension Support FAQ" />
        <meta
          property="og:description"
          content="A compatibility guide for Tatakai extensions, local runtimes, community stacks and self-hosted servers."
        />
        <meta property="og:type" content="article" />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            name: "Tatakai Extension Support FAQ",
            url: "https://tatakai.me/faq/extension-support",
            get description() {
              return uiI18n.t(
                "app.current_compatibility_guide_for_stremio_seanime__d25d4cc0"
              );
            },
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
            isDesktopApp ? "" : "md:pl-32"
          )}
        >
          <Link
            to="/welcome"
            className="mb-10 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />{" "}
            {uiI18n.t("app.back_to_welcome_ba6df5aa")}
          </Link>

          <header className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-primary">
              <Puzzle className="h-3.5 w-3.5" />{" "}
              {uiI18n.t("app.extension_faq_125f9788")}
            </span>
            <h1 className="mt-5 font-display text-4xl font-black tracking-tight sm:text-6xl">
              {uiI18n.t("app.what_extensions_does_tatakai_support_15ce2a55")}
            </h1>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground sm:text-lg">
              {uiI18n.t("extensionUpdate.faqIntro")}
            </p>
            <div className="mt-6 flex flex-wrap gap-2">{['Tatakai','Stremio','Seanime','CloudStream','Mihon','Aniyomi','Sora','Mangayomi','Tatakai Server'].map(name=><Badge key={name} variant="outline">{name}</Badge>)}</div>
          </header>

          <section
            className="mt-10"
            aria-label={uiI18n.t("app.extension_faq_125f9788")}
          >
            <Accordion type="single" collapsible>
              {extensionFaqs.map(([question, answer]) => (
                <AccordionItem key={question} value={question}>
                  <AccordionTrigger className="text-left">
                    {uiI18n.t("extensionUpdate." + question)}
                  </AccordionTrigger>
                  <AccordionContent className="leading-relaxed text-muted-foreground">
                    {uiI18n.t("extensionUpdate." + answer)}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>
          <section
            className="mt-14"
            aria-labelledby="supported-extension-types"
          >
            <div className="mb-6 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
                  {uiI18n.t("app.compatibility_matrix_dd9e5420")}
                </p>
                <h2
                  id="supported-extension-types"
                  className="mt-2 font-display text-2xl font-bold sm:text-3xl"
                >
                  {uiI18n.t("app.supported_extension_types_b0a481a2")}
                </h2>
              </div>
              <span className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
                <Info className="h-4 w-4" />{" "}
                {uiI18n.t("app.compatibility_can_vary_by_provider_9b76e464")}
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

          <section
            className="mt-16 grid gap-5 lg:grid-cols-2"
            aria-labelledby="extension-limitations"
          >
            <article className="rounded-2xl border border-rose-400/20 bg-rose-400/[0.04] p-6">
              <div className="flex items-center gap-3">
                <ShieldAlert className="h-5 w-5 text-rose-200" />
                <h2
                  id="extension-limitations"
                  className="font-display text-xl font-bold"
                >
                  {uiI18n.t("app.not_supported_right_now_dc92479c")}
                </h2>
              </div>
              <ul className="mt-5 space-y-3 text-sm leading-relaxed text-muted-foreground">
                {[
                  ...unsupportedTypes,
                  uiI18n.t("extensionUpdate.dartLimit"),
                ].map((item) => (
                  <li key={item} className="flex gap-3">
                    <X className="mt-0.5 h-4 w-4 shrink-0 text-rose-200" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-5 border-t border-rose-200/10 pt-4 text-xs leading-relaxed text-muted-foreground/80">
                {uiI18n.t(
                  "app.other_chromedp_providers_need_an_individual_comp_f6a29495"
                )}
              </p>
            </article>

            <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
              <div className="flex items-center gap-3">
                <Code2 className="h-5 w-5 text-primary" />
                <h2 className="font-display text-xl font-bold">
                  {uiI18n.t("app.host_and_troubleshooting_notes_c9e22ea6")}
                </h2>
              </div>
              <ul className="mt-5 space-y-4 text-sm leading-relaxed text-muted-foreground">
                <li className="flex gap-3">
                  <Router className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>
                    {uiI18n.t(
                      "app.torrents_require_a_torrent_capable_host_mobile_u_dbb09004"
                    )}
                  </span>
                </li>
                <li className="flex gap-3">
                  <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>
                    {uiI18n.t(
                      "app.a_supported_format_does_not_guarantee_a_working__99070f02"
                    )}
                  </span>
                </li>
                <li className="flex gap-3">
                  <Terminal className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>
                    {uiI18n.t(
                      "app.enable_developer_mode_to_see_each_provider_s_res_0351d250"
                    )}
                  </span>
                </li>
              </ul>
            </article>
          </section>

          <section className="mt-16 rounded-2xl border border-primary/20 bg-primary/[0.06] p-6 sm:p-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
                  {uiI18n.t("app.need_more_detail_9849d117")}
                </p>
                <h2 className="mt-2 font-display text-2xl font-bold">
                  {uiI18n.t("app.compare_tatakai_and_seanime_2d35c600")}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  {uiI18n.t(
                    "app.read_the_honest_feature_comparison_including_ext_1a6797eb"
                  )}
                </p>
              </div>
              <Link
                to="/faq/seanime-vs-tatakai"
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition-[background-color,transform] hover:brightness-110 motion-safe:active:scale-[0.97]"
              >
                {uiI18n.t("app.seanime_vs_tatakai_2432da7c")}{" "}
                <ArrowLeft className="h-4 w-4 rotate-180" />
              </Link>
            </div>
          </section>
        </main>

        <MobileNav />
      </div>
    </>
  );
}
