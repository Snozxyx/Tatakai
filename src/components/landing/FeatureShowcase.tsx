import { BRAND_ASSET_BASE } from '@/lib/assets';
import './landing-sections.css';
import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
"use client";

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/Reveal";
import { ShowcaseMedia } from "@/components/landing/ShowcaseMedia";
import { MobileShowcase } from "@/components/landing/MobileShowcase";
import { MoreFeatures } from "@/components/landing/MoreFeatures";
import { Integrations } from "@/components/landing/Integrations";
import { Extensions } from "@/components/landing/Extensions";
import { Progression } from "@/components/landing/Progression";
import { Translate } from "@/components/landing/Translate";
import { Enhancers } from "@/components/landing/Enhancers";
import { CustomizationShowcase } from "@/components/landing/CustomizationShowcase";

import {
  ArrowRight,
  ArrowUpRight,
  Download,
  Sparkles,
  Clapperboard,
  BookOpen,
  BarChart3,
  Archive,
  DownloadCloud,
  Users,
  MessageSquare,
  ListMusic,
  TrendingUp,
  RefreshCw,
  CalendarDays,
  Trophy,
  Heart,
  BookMarked,
  Gauge,
  MousePointer2,
  X,
  Maximize2,
  Check,
  type LucideIcon,
} from "lucide-react";

const BRAND = BRAND_ASSET_BASE;

interface Flagship {
  icon: LucideIcon;
  kicker: string;
  title: string;
  body: string;
  points: string[];
  media: string;
  accent: string;
}

const flagships: Flagship[] = [
  {
    icon: BookMarked,
    kicker: "Recommendations",
    get title() { return uiI18n.t('app.picks_that_actually_get_you_e15e6e8d'); },
    get body() { return uiI18n.t('app.a_hybrid_recommendation_engine_learns_from_every_6651bc2c'); },
    points: ["Personalized daily", "Learns as you go", "Anime & manga"],
    media: `${BRAND}/Recommendation.mp4`,
    accent: "text-muted-foreground",
  },
  {
    icon: Clapperboard,
    kicker: "Video player",
    get title() { return uiI18n.t('app.built_for_how_you_watch_7be46db6'); },
    get body() { return uiI18n.t('app.a_clean_player_for_episodes_you_own_custom_subti_169631c6'); },
    points: ["Custom subtitles", "Background playback", "Remembers progress"],
    media: `${BRAND}/Videoplayer.mp4`,
    accent: "text-muted-foreground",
  },
  {
    icon: BookOpen,
    kicker: "Manga reader",
    get title() { return uiI18n.t('app.read_the_way_you_like_e78bada9'); },
    get body() { return uiI18n.t('app.a_fast_comic_style_reader_with_per_device_settin_05aa8296'); },
    points: ["Custom keybinds", "Saved progress", "Manga · Manhwa · Comics"],
    media: `${BRAND}/MangaReader.mp4`,
    accent: "text-muted-foreground",
  },
  {
    icon: BookMarked,
    kicker: "Novel reader · Listern",
    get title() { return uiI18n.t('app.get_lost_in_every_chapter_4121cc1b'); },
    get body() { return uiI18n.t('app.a_focused_light_novel_reader_with_a_calm_reading_dd724057'); },
    points: ["Light novel support", "Custom keybinds", "Saved progress"],
    media: `${BRAND}/NovelReader.mp4`,
    accent: "text-muted-foreground",
  },
  {
    icon: BarChart3,
    kicker: "Profile & stats",
    get title() { return uiI18n.t('app.your_taste_in_numbers_58a29751'); },
    get body() { return uiI18n.t('app.activity_heatmaps_taste_breakdowns_and_rich_insi_88ac2d3a'); },
    points: ["Activity heatmaps", "Taste breakdown", "Shareable profile"],
    media: `${BRAND}/Profile_with_stats.mp4`,
    accent: "text-muted-foreground",
  },
];

interface OfflineCard {
  icon: LucideIcon;
  title: string;
  body: string;
  media: string;
  kind: "video" | "image";
  tag: string;
}

const offline: OfflineCard[] = [
  {
    icon: Archive,
    get title() { return uiI18n.t('app.offline_library_ac6cdd78'); },
    get body() { return uiI18n.t('app.everything_you_ve_saved_organized_in_one_place_r_c9f1a372'); },
    media: `${BRAND}/mobile_download.jpg`,
    kind: "image",
    tag: "Always ready",
  },
  {
    icon: DownloadCloud,
    get title() { return uiI18n.t('app.download_anime_c3a1be15'); },
    get body() { return uiI18n.t('app.keep_episodes_on_your_device_for_the_flight_the__8eca8f49'); },
    media: `${BRAND}/Animedownload.mp4`,
    kind: "video",
    tag: "Offline ready",
  },
  {
    icon: DownloadCloud,
    get title() { return uiI18n.t('app.download_manga_5dcbeaab'); },
    get body() { return uiI18n.t('app.take_whole_series_offline_and_read_directly_from_d19d3d85'); },
    media: `${BRAND}/Mangadownload.mp4`,
    kind: "video",
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
  description?: string;
}

const community: Tile[] = [
  {
    icon: Users,
    get title() { return uiI18n.t('app.a_feed_that_feels_alive_2fdd9fb5'); },
    get description() { return uiI18n.t('landingCommunity.feedDescription'); },
    img: `${BRAND}/Community.png`,
    eyebrow: "Social feed",
    layout: "col-span-2 row-span-2",
    featured: true,
  },
  {
    icon: BarChart3,
    get title() { return uiI18n.t('app.profiles_worth_following_fec2e75b'); },
    get description() { return uiI18n.t('landingCommunity.profileDescription'); },
    img: `${BRAND}/Profile.png`,
    eyebrow: "Profiles",
    layout: "col-span-2",
  },
  {
    icon: MessageSquare,
    get title() { return uiI18n.t('app.discuss_every_episode_e300a508'); },
    get description() { return uiI18n.t('landingCommunity.commentsDescription'); },
    img: `${BRAND}/Comment.png`,
    eyebrow: "Conversations",
    layout: "",
  },
  {
    icon: ListMusic,
    get title() { return uiI18n.t('app.curate_share_playlists_3ed754f8'); },
    img: `${BRAND}/Playlist.png`,
    eyebrow: "Collections",
    layout: "",
  },
  {
    icon: TrendingUp,
    get title() { return uiI18n.t('app.see_what_s_trending_68817930'); },
    img: `${BRAND}/Trending.png`,
    eyebrow: "Discover",
    layout: "",
  },
  {
    icon: RefreshCw,
    get title() { return uiI18n.t('app.sync_your_anime_history_d767489d'); },
    img: `${BRAND}/integration.png`,
    eyebrow: "Integrations",
    layout: "",
  },
  {
    icon: CalendarDays,
    get title() { return uiI18n.t('app.track_your_anime_journey_1f4c5fc6'); },
    img: `${BRAND}/Calendar.png`,
    eyebrow: "Calendar",
    layout: "",
  },
  {
    icon: Trophy,
    get title() { return uiI18n.t('app.build_your_own_tier_lists_94dec8bb'); },
    img: `${BRAND}/Tierlist.png`,
    eyebrow: "Tier lists",
    layout: "",
  },
  {
    icon: Heart,
    get title() { return uiI18n.t('app.keep_your_favorites_close_2dc8b8cf'); },
    img: `${BRAND}/Favorites.png`,
    eyebrow: "Favorites",
    layout: "",
  },
];

function CommunityPreview({ tile, onPreview, variant = 'compact' }: { tile: Tile; onPreview(tile: Tile): void; variant?: 'lead' | 'support' | 'compact' }) {
  const Icon = tile.icon;
  const lead = variant === 'lead';
  return <button type="button" data-community-preview={variant} onClick={() => onPreview(tile)} aria-label={uiI18n.t('app.preview_i18n_value_0_fc87427b', { value0: tile.title })}
    className={`community-preview group relative w-full overflow-hidden rounded-2xl border border-white/10 bg-[#111011] text-left transition-colors hover:border-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${lead ? 'flex h-full flex-col' : 'grid grid-cols-[96px_minmax(0,1fr)] items-center gap-4 p-4 sm:p-5'}`}>
    <div className={lead ? 'relative aspect-[16/10] min-h-0 overflow-hidden border-b border-white/10 lg:flex-1' : 'relative overflow-hidden rounded-lg border border-white/10'}>
      <img src={tile.img} alt="" loading="lazy" decoding="async" draggable={false} className={lead ? 'absolute inset-0 h-full w-full object-cover object-top' : `w-full object-cover object-top ${variant === 'support' ? 'aspect-[2/3]' : 'aspect-[4/3]'}`} />
      {lead && <span className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-lg border border-white/15 bg-black/70 text-white/80"><Maximize2 aria-hidden className="size-4" /></span>}
    </div>
    <div className={`min-w-0 ${lead ? 'p-5 sm:p-6' : ''}`}>
      <p className="mb-2 inline-flex items-center gap-2 text-xs font-medium text-white/60"><Icon aria-hidden className="size-4" />{tile.eyebrow}</p>
      <h3 className={`font-display font-medium text-white ${lead ? 'text-2xl' : variant === 'support' ? 'text-xl' : 'text-base'}`}>{tile.title}</h3>
      {tile.description && <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/70">{tile.description}</p>}
      {!lead && <ArrowUpRight aria-hidden className="mt-3 size-4 text-white/50 transition-colors group-hover:text-white" />}
    </div>
  </button>;
}

interface HighlightedFeature {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  body: string;
  accent: string;
  iconBackground: string;
}

const highlightedFeatures: HighlightedFeature[] = [
  {
    icon: Clapperboard,
    eyebrow: "Watch",
    get title() { return uiI18n.t('app.anime_support_81e29ece'); },
    get body() { return uiI18n.t('app.track_episodes_discover_what_to_watch_next_and_k_ccd83305'); },
    accent: "text-muted-foreground",
    iconBackground: "bg-violet-400/10",
  },
  {
    icon: BookOpen,
    eyebrow: "Read",
    get title() { return uiI18n.t('app.manga_support_9519cf8b'); },
    get body() { return uiI18n.t('app.follow_chapters_and_keep_every_series_close_from_26474c4f'); },
    accent: "text-muted-foreground",
    iconBackground: "bg-cyan-400/10",
  },
  {
    icon: BookMarked,
    eyebrow: "Discover",
    get title() { return uiI18n.t('app.novel_support_6ba427ff'); },
    get body() { return uiI18n.t('app.build_one_library_for_the_stories_you_watch_read_fd2ad593'); },
    accent: "text-muted-foreground",
    iconBackground: "bg-pink-400/10",
  },
  {
    icon: Gauge,
    eyebrow: "Performance",
    get title() { return uiI18n.t('app.fast_by_default_1a0e792e'); },
    get body() { return uiI18n.t('app.a_focused_interface_that_gets_out_of_the_way_and_79debffc'); },
    accent: "text-muted-foreground",
    iconBackground: "bg-amber-400/10",
  },
  {
    icon: MousePointer2,
    eyebrow: "Experience",
    get title() { return uiI18n.t('app.easy_to_use_a949e723'); },
    get body() { return uiI18n.t('app.simple_controls_clear_progress_and_thoughtful_de_81d959a4'); },
    accent: "text-muted-foreground",
    iconBackground: "bg-emerald-400/10",
  },
  {
    icon: Users,
    eyebrow: "Community",
    get title() { return uiI18n.t('app.find_your_people_69ec6132'); },
    get body() { return uiI18n.t('app.share_recommendations_discuss_favorites_and_foll_dcfdf409'); },
    accent: "text-muted-foreground",
    iconBackground: "bg-blue-400/10",
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
  useUiTranslation();
  return (
    <div className="mb-12 max-w-3xl lg:mb-16">
      <div className="mb-5 flex items-center gap-3 text-xs font-medium normal-case tracking-normal text-violet-200/80">
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
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/70 lg:text-lg">
          {sub}
        </p>
      ) : null}
    </div>
  );
}

export function FeatureShowcase() {
  useUiTranslation();
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
    <div className="landing-sections relative isolate w-full overflow-hidden">
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
              title={uiI18n.t('app.everything_anime_manga_novels_done_right_e51a9c11')}
              sub="One app for discovering, tracking, and sharing the stories you love — designed to stay out of your way."
            />
          </Reveal>

          <div className="space-y-6 lg:space-y-8">
            {flagships.map((feature, index) => {
              const Icon = feature.icon;
              const reversed = index % 2 === 1;

              return (
                <Reveal key={feature.title} delay={index * 0.04}>
                  <article className="group relative overflow-hidden rounded-2xl border border-white/[0.1] bg-[#0d0c13]/80 ">


                    <div className="relative grid overflow-hidden lg:grid-cols-[0.9fr_1.1fr]">
                      <div
                          className={`relative overflow-hidden p-6 sm:p-8 lg:p-10 ${reversed ? "lg:order-2" : ""}`}
                      >
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute -right-1 top-1 font-display text-7xl font-medium tracking-[-0.08em] text-white/[0.035] sm:text-8xl"
                        >
                          0{index + 1}
                        </span>

                        <div className="relative">
                          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5">
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
                            aria-label={uiI18n.t('app.i18n_value_0_capabilities_f43c69af', { value0: feature.title })}
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
                        className={`relative flex items-center border-t border-white/[0.08] bg-black/10 p-3 sm:p-4 lg:border-t-0 ${reversed
                            ? "lg:order-1 lg:border-r"
                            : "lg:border-l"}`}
                      >
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.035] to-transparent" />

                        <div className="relative w-full">
                          <ShowcaseMedia
                            type="video"
                            src={feature.media}
                            label={uiI18n.t('app.i18n_value_0_preview_86615b54', { value0: feature.title })}
                            className="rounded-[18px] border-white/10 bg-black/30 "
                          />

                          <div className="pointer-events-none absolute bottom-4 left-4 rounded-full border border-white/10 bg-black/45 px-3 py-1 text-xs font-medium normal-case tracking-normal text-white/60">
                            {uiI18n.t('app.feature_preview_2ef2eb94')}
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
            HIGHLIGHTED FEATURES
        ============================================================ */}
        <section
          className="border-t border-white/[0.08] py-16 lg:py-28"
          aria-labelledby="highlighted-features-heading"
        >
          <Reveal>
            <SectionHeading
              id="highlighted-features-heading"
              eyebrow="Why Tatakai"
              title={uiI18n.t('app.one_home_for_everything_you_love_9cbdbc33')}
              sub="Anime, manga, and novels come together with the speed and simplicity to make keeping up feel effortless."
            />
          </Reveal>

          <div className="grid gap-x-8 gap-y-6 md:grid-cols-2 lg:grid-cols-3">
            {highlightedFeatures.map(feature => {
              const Icon = feature.icon;
              return <article key={feature.title} data-landing-capability className="flex items-start gap-4 border-t border-white/10 pt-6">
                <Icon aria-hidden className="mt-1 size-[18px] shrink-0 text-white/60" />
                <div><p className="mb-2 text-xs font-medium text-white/60">{feature.eyebrow}</p>
                  <h3 className="font-display text-xl font-medium text-white">{feature.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-white/70">{feature.body}</p>
                </div>
              </article>;
            })}
          </div>
        </section>

        <Enhancers />

        {/* ============================================================
            MOBILE APP
        ============================================================ */}
        <div className="border-t border-white/[0.08]">
          <MobileShowcase />
        </div>

        {/* ============================================================
            OFFLINE LIBRARY
        ============================================================ */}
        <section
          className="border-t border-white/[0.08] py-16 lg:py-28"
          aria-labelledby="offline-heading"
        >
          <Reveal>
            <SectionHeading
              id="offline-heading"
              eyebrow="Take it with you"
              title={uiI18n.t('app.your_library_anywhere_even_offline_e7eabeeb')}
              sub="Keep your lists on-device for commutes, flights, and dead zones — your library travels with you."
            />
          </Reveal>

          <div data-landing-offline className="grid gap-6 md:grid-cols-[1.2fr_1fr_1fr]">
            {offline.map((card, index) => {
              const Icon = card.icon;

              return (
                <Reveal key={card.title} delay={index * 0.08}>
                  <article className="group h-full overflow-hidden rounded-2xl border border-white/[0.1] bg-white/[0.035]  transition-[color,background-color,border-color,opacity] duration-300  hover:border-white/20 hover:bg-white/[0.055]">
                    <div className="relative overflow-hidden border-b border-white/[0.08] p-2.5">
                      <div className="transition-transform duration-200 ">
                        <ShowcaseMedia
                          type={card.kind}
                          src={card.media}
                          label={uiI18n.t('app.i18n_value_0_preview_86615b54', { value0: card.title })}
                          ratio="16 / 10"
                          className="rounded-[14px] border-0 shadow-none"
                        />
                      </div>

                      <span className="absolute left-5 top-5 rounded-full border border-white/10 bg-black/50 px-2.5 py-1 text-xs font-medium normal-case tracking-normal text-white/70">
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

                      <p className="text-sm leading-relaxed text-white/70">
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
              title={uiI18n.t('app.built_for_the_community_93d55238')}
              sub={uiI18n.t('landingCommunity.description')}
            />
          </Reveal>

          <div className="community-showcase grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <CommunityPreview tile={community[0]} onPreview={setPreviewTile} variant="lead" />
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1">
              {community.slice(1, 3).map(tile => <CommunityPreview key={tile.img} tile={tile} onPreview={setPreviewTile} variant="support" />)}
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#111011] p-5 sm:col-span-2 lg:col-span-1">
                <p className="max-w-xs text-sm text-white/70">{uiI18n.t('landingCommunity.invitation')}</p>
                <Button onClick={() => navigate('/community')} className="h-11 shrink-0 rounded-lg bg-white px-4 text-sm font-medium text-black hover:bg-white/90">
                  {uiI18n.t('landingCommunity.openCommunity')}<ArrowRight aria-hidden className="ml-2 size-4" />
                </Button>
              </div>
            </div>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {community.slice(3).map(tile => <CommunityPreview key={tile.img} tile={tile} onPreview={setPreviewTile} />)}
          </div>
        </section>

        <CustomizationShowcase />

        {/* ============================================================
            INTEGRATIONS
        ============================================================ */}
        <Integrations />
        <Translate />


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
            <div data-landing-final-cta className="relative overflow-hidden rounded-2xl border border-white/[0.12] bg-[#111011] px-6 py-12 sm:px-10 lg:px-16 lg:py-16">






              <div className="relative mx-auto max-w-2xl">
                <h2 className="font-display text-[clamp(2rem,4vw,3.4rem)] font-medium leading-[1] tracking-[-0.045em] text-white">
                  {uiI18n.t('app.up_and_running_in_minutes_929787b0')}
                </h2>

                <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-white/60 lg:text-lg">
                  {uiI18n.t('app.install_the_app_sign_in_and_pick_up_right_where__95ef3bd0')}
                </p>

                <div data-landing-cta-actions className="mt-8 flex flex-wrap items-center gap-3">
                  <Button
                    size="lg"
                    onClick={() => navigate("/download")}
                    className="group h-12 rounded-full border border-white/20 bg-white px-7 text-sm font-medium text-black  transition-[color,background-color,border-color,opacity]  "
                  >
                    <Download className="mr-2 h-4 w-4" />
                    {uiI18n.t('app.download_app_dd7b83d1')}
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Button>

                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => navigate("/browse")}
                    className="h-12 rounded-full border border-white/15 bg-white/[0.05] px-7 text-sm font-medium text-white transition-[color,background-color,border-color,opacity] hover:border-white/30 hover:bg-white hover:text-black"
                  >
                    {uiI18n.t('app.browse_the_library_c6cfcdb1')}
                  </Button>
                </div>

                <p className="mt-6 text-xs text-white/70">
                  {uiI18n.t('app.free_amp_open_source_no_account_required_to_look_1501838c')}
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

            sm:p-6
          "
          role="dialog"
          aria-modal="true"
          aria-label={uiI18n.t('app.i18n_value_0_image_preview_9735781d', { value0: previewTile.title })}
        >
          {/* Backdrop */}
          <button
            type="button"
            aria-label={uiI18n.t('app.close_image_preview_c4d5897c')}
            className="absolute inset-0 h-full w-full cursor-default"
            onPointerDown={(event) => {
              event.preventDefault();
              setPreviewTile(null);
            }}
          />

          {/* Ambient preview glow */}


          {/* Close button */}
          <button
            type="button"
            aria-label={uiI18n.t('app.close_image_preview_c4d5897c')}
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


              transition-[color,background-color,border-color,opacity]
              duration-200

              hover:border-white/25
              hover:bg-white/10
              hover:text-white
              active:scale-[0.98]
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
              rounded-2xl
              border
              border-white/[0.12]
              bg-[#09090d]/95
              p-2

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

                  <span className="truncate text-xs font-medium normal-case tracking-normal text-violet-200/70">
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
                  text-xs
                  font-medium
                  normal-case
                  tracking-normal
                  text-white/70
                  sm:flex
                "
              >
                <Maximize2 className="h-3.5 w-3.5" />
                {uiI18n.t('app.preview_f1fbb2b4')}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
