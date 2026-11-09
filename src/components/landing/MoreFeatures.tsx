"use client";

import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import {
  Palette,
  Bell,
  ScanSearch,
  PartyPopper,
  Trophy,
  MessagesSquare,
  ListOrdered,
  MonitorSmartphone,
  Bookmark,
  type LucideIcon,
} from "lucide-react";

interface Extra {
  icon: LucideIcon;
  title: string;
  body: string;
  accent: string;
}

// Features the media showcase above doesn't cover — the "there's more" list.
const extras: Extra[] = [
  { icon: Palette, get title() { return uiI18n.t('app.25_themes_3e75499d'); }, get body() { return uiI18n.t('app.light_dark_and_accented_looks_plus_a_lite_mode_t_ca61478a'); }, accent: "text-white/70" },
  { icon: Bell, get title() { return uiI18n.t('app.airing_calendar_37949cd3'); }, get body() { return uiI18n.t('app.seasonal_charts_and_airing_schedules_with_remind_260bb313'); }, accent: "text-white/70" },
  { icon: ScanSearch, get title() { return uiI18n.t('app.search_by_screenshot_12f98526'); }, get body() { return uiI18n.t('app.recognize_any_scene_with_image_search_powered_by_f0f8afcd'); }, accent: "text-white/70" },
  { icon: PartyPopper, get title() { return uiI18n.t('app.watch2together_cde01fad'); }, get body() { return uiI18n.t('app.host_sync_watch_parties_and_react_in_real_time_w_2b37577d'); }, accent: "text-white/70" },
  { icon: Trophy, get title() { return uiI18n.t('app.ranks_leaderboards_ef2ca515'); }, get body() { return uiI18n.t('app.climb_the_ranks_collect_badges_and_top_the_contr_4a47b4ac'); }, accent: "text-white/70" },
  { icon: MessagesSquare, get title() { return uiI18n.t('app.forums_threads_71864988'); }, get body() { return uiI18n.t('app.reddit_style_threaded_discussions_for_every_corn_7ff77bbb'); }, accent: "text-white/70" },
  { icon: ListOrdered, get title() { return uiI18n.t('app.tier_lists_bfe1b707'); }, get body() { return uiI18n.t('app.build_rank_and_share_your_definitive_takes_74672eb4'); }, accent: "text-white/70" },
  { icon: MonitorSmartphone, get title() { return uiI18n.t('app.web_desktop_mobile_f1509cd0'); }, get body() { return uiI18n.t('app.pick_up_on_the_browser_the_desktop_app_and_andro_7e19412b'); }, accent: "text-white/70" },
  { icon: Bookmark, get title() { return uiI18n.t('app.plan_to_watch_4a4ffa92'); }, get body() { return uiI18n.t('app.a_dedicated_backlog_for_everything_you_plan_to_w_d9b0d028'); }, accent: "text-white/70" },
];

// Breadth strip, kept honest against the feature list.
const marquee = [
  "Airing calendar", "Plan to watch", "Custom themes", "Web", "Desktop",
  "Android", "iOS", "trace.moe search", "Watch parties", "Tier lists",
  "Forums", "Leaderboards", "Playlists", "MAL & AniList sync", "Lite mode",
];

export function MoreFeatures() {
  useUiTranslation();

  return (
    <section className="py-16 lg:py-24">
      <div className="mb-12 max-w-2xl">
        <h2 className="font-display text-[clamp(1.9rem,4vw,3.25rem)] font-medium leading-[1.02] tracking-[-0.03em] text-white">
          {uiI18n.t('app.there_s_even_more_inside_245c026d')}
        </h2>
        <p className="mt-4 text-base leading-relaxed text-white/70 lg:text-lg">
          {uiI18n.t('app.the_showcase_only_scratches_the_surface_here_s_a_dd322cbb')}
        </p>
      </div>

      <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {extras.map((f) => {
          const Icon = f.icon;
          return (
            <div
              key={f.title}
              data-extra

              className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-colors duration-300 hover:border-white/25 hover:bg-white/[0.05]"
            >
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                <Icon className={`h-5 w-5 ${f.accent}`} />
              </div>
              <h3 className="mb-2 font-display text-lg font-medium text-white">{f.title}</h3>
              <p className="text-sm leading-relaxed text-white/70">{f.body}</p>
            </div>
          );
        })}
      </div>

      {/* Feature breadth, at a glance */}
      <div className="relative mt-8 overflow-hidden border-t border-white/10 py-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {marquee.map((label, i) => (
            <span key={i} className="flex items-center gap-3 whitespace-nowrap text-sm font-medium text-white/70">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white/35" />
              {label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
