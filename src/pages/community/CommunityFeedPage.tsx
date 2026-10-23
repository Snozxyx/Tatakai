import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useState, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  X,
  Hash,
  Plus,
  Bookmark,
  Trophy,
  Radio,
  Layers,
  Music2,
  Sparkles,
} from 'lucide-react';
import { CommunitySidebar } from '@/components/community/feed/CommunitySidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useIsDesktopApp } from '@/hooks/ui/useIsNativeApp';
import { type FeedTab, type FeedPostType } from '@/hooks/community/useFeed';
import { useFeedRealtime } from '@/hooks/community/useFeedRealtime';
import { useAuth } from '@/contexts/AuthContext';
import { FeedList } from '@/components/community/feed/FeedList';
import { CommunitiesShowcase } from '@/components/community/feed/CommunitiesShowcase';
import { CreateCommunityDialog } from '@/components/community/feed/CreateCommunityDialog';
import { FeedTabs, type CommunityTab } from '@/components/community/feed/FeedTabs';
import { AnimeNewsStrip } from '@/components/community/feed/AnimeNewsStrip';
import { CommunityEventsSection } from '@/components/community/feed/CommunityEventsSection';
import { LeaderboardSheet } from '@/components/community/LeaderboardSheet';
import { CommunitySearch } from '@/components/community/feed/CommunitySearch';
import { CommunitySearchResults } from '@/components/community/feed/CommunitySearchResults';
import { CommunityRightRail } from '@/components/community/feed/CommunityRightRail';
import { useCommunityPresence } from '@/hooks/community/useCommunityPresence';

export default function CommunityFeedPage() {
  useUiTranslation();
  const isDesktopApp = useIsDesktopApp();
  const { isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tag = searchParams.get('tag') || undefined;
  const [tab, setTab] = useState<CommunityTab>('foryou');
  const [postType, setPostType] = useState<FeedPostType | undefined>(undefined);
  const [createOpen, setCreateOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchActive = searchQuery.trim().length >= 2;

  useFeedRealtime();
  const { onlineCount, onlineUserIds, onlineUsers } = useCommunityPresence();

  const clearFilters = useCallback(() => {
    if (tag) setSearchParams({});
  }, [tag, setSearchParams]);

  const handleTabChange = useCallback((newTab: CommunityTab) => {
    setTab(newTab);
    if (tag) setSearchParams({});
  }, [tag, setSearchParams]);

  const filtering = !!tag;
  const feedTab: FeedTab = tab === 'schedule' ? 'foryou' : (tab as FeedTab);

  return (
    <div className="relative min-h-screen bg-background text-foreground antialiased selection:bg-primary/20 selection:text-primary">
      {/* ── Ambient Background Mesh ── */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden transform-gpu">
        <div className="community-aurora-primary absolute -top-[12%] left-1/2 h-[640px] w-[1280px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,hsl(var(--primary)/0.14),hsl(var(--secondary)/0.08),transparent)] blur-3xl" />
        <div className="community-aurora-secondary absolute top-[24%] -left-[12%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(closest-side,hsl(var(--secondary)/0.12),transparent)] blur-3xl" />
        <div className="community-aurora-secondary absolute -right-[8%] bottom-[8%] h-[460px] w-[460px] rounded-full bg-[radial-gradient(closest-side,hsl(347_100%_65%/0.08),transparent)] blur-3xl" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/80 to-background" />
      </div>

      <CommunitySidebar />

      {/* Desktop app: the CommunitySidebar is a solid 80px fixed rail, so the
          content needs a fixed left clearance at every width (window minWidth is
          1000px, below the lg breakpoint). Mobile app hides the rail (pl-0);
          web uses the floating pill offset. */}
      <main className={cn('relative z-10 w-full transition-[color,background-color,border-color,opacity,transform] duration-300', isDesktopApp ? 'pl-24 lg:pl-28' : 'pl-0 md:pl-24 lg:pl-28')}>
        <div className="community-page mx-auto max-w-[1536px] px-4 pt-6 md:px-8 md:pt-10">

          {/* ── HEADER & DISCOVERY SECTION ── */}
          <div className="mb-8 space-y-8">

            {/* Main Header */}
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-2.5">
                <div className="flex items-center gap-3">
                  <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl text-foreground">
                    {uiI18n.t('app.community_bfd58ee3')}
                  </h1>

                  {/* Live online-count pill (Item 9 presence) */}
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-foreground backdrop-blur-md ">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                    </span>
                    <span className="tabular-nums">{onlineCount}</span> {uiI18n.t('app.online_2dbc2fd2')}
                  </span>
                </div>

                <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
                  {uiI18n.t('app.join_discussions_host_watchrooms_create_tier_lis_d545d561')}
                </p>
              </div>
{/* Header Actions */}
<div className="flex items-center gap-2.5 self-start sm:self-auto">
  {/* Desktop Search */}
  <div className="hidden lg:block">
    <CommunitySearch
      value={searchQuery}
      onValueChange={setSearchQuery}
      suppressDropdown
      expandOnFocus
      className="
        w-[min(28vw,300px)]
        transition-[color,background-color,border-color,opacity,transform] duration-300

      "
    />
  </div>
  </div>

  {/* Community creation is restricted to platform admins. */}
  {isAdmin && (
    <Button
      onClick={() => setCreateOpen(true)}
      size="icon"
      className="
        h-10 w-10 shrink-0
        rounded-full
        border border-white/[0.08]
        bg-white/[0.05]
        text-foreground
        backdrop-blur-xl
        shadow-[0_8px_30px_rgba(0,0,0,0.15)]
        transition-[color,background-color,border-color,opacity,transform] duration-300

        hover:bg-primary
        hover:text-primary-foreground
        hover:border-primary/40
        hover:shadow-[0_0_25px_rgba(var(--primary),0.3)]
        hover:-translate-y-0.5

        active:scale-95
      "
    >
      <Plus className="h-4 w-4" />
    </Button>
  )}
</div>

{/* Mobile Search */}
<div className="lg:hidden">
  <CommunitySearch
    value={searchQuery}
    onValueChange={setSearchQuery}
    suppressDropdown
    className="
      w-full
      [&>div]:w-full
    "
  />
</div>
            {!searchActive && (
              <>
                {/* Communities Carousel */}
                <div id="communities" className="scroll-mt-24"><CommunitiesShowcase /></div>

                {/* Mobile Quick-Access Bar */}
                <div className="flex gap-2.5 overflow-x-auto pb-2 xl:hidden no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 scroll-smooth">
                  <button
                    type="button"
                    onClick={() => setLeaderboardOpen(true)}
                    className="flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-bold text-foreground backdrop-blur-md shrink-0 transition-[color,background-color,border-color,opacity,transform] hover:bg-amber-500/20 duration-150 active:scale-[0.98]"
                  >
                    <Trophy className="h-4 w-4 text-foreground" /> {uiI18n.t('app.leaderboard_0381247a')}
                  </button>

                  <Link
                    to="/isshoni"
                    className="flex items-center gap-2 rounded-full border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-bold text-foreground backdrop-blur-md shrink-0 transition-[color,background-color,border-color,opacity,transform] hover:bg-rose-500/20 duration-150 active:scale-[0.98]"
                  >
                    <Radio className="h-4 w-4 text-foreground" /> {uiI18n.t('app.watch_together_195732a6')}
                  </Link>

                  <Link
                    to="/tierlists"
                    className="flex items-center gap-2 rounded-full border border-border bg-muted/40 px-4 py-2 text-sm font-bold text-foreground backdrop-blur-md shrink-0 transition-[color,background-color,border-color,opacity,transform] hover:border-amber-500/40 hover:bg-muted/60 active:scale-95 hover:text-foreground"
                  >
                    <Layers className="h-4 w-4" /> {uiI18n.t('app.tier_lists_86752701')}
                  </Link>

                  <Link
                    to="/playlists"
                    className="flex items-center gap-2 rounded-full border border-border bg-muted/40 px-4 py-2 text-sm font-bold text-foreground backdrop-blur-md shrink-0 transition-[color,background-color,border-color,opacity,transform] hover:border-violet-500/40 hover:bg-muted/60 active:scale-95 hover:text-foreground"
                  >
                    <Music2 className="h-4 w-4" /> {uiI18n.t('app.playlists_77b69f32')}
                  </Link>
                </div>

                {/* Filter Navigation Tabs */}
                <FeedTabs value={tab} onChange={handleTabChange} />
              </>
            )}
          </div>

          {/* ── MAIN TWO-COLUMN FEED LAYOUT ── */}
          {searchActive ? (
            <CommunitySearchResults query={searchQuery} />
          ) : (
          <div className="flex items-start gap-8 xl:gap-12 pb-12">

            {/* Main Feed Column */}
            <div className="w-full min-w-0 flex-1 max-w-[960px]">

              {/* Active Filter Pill */}
              {filtering && (
                <div className="mb-6 flex items-center justify-between rounded-2xl border border-primary/25 bg-primary/10 px-5 py-3 backdrop-blur-xl shadow-lg transition-[color,background-color,border-color,opacity,transform] animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/20">
                      <Hash className="h-4 w-4 text-primary" />
                    </div>
                    <span className="text-sm font-bold text-foreground">
                      {uiI18n.t('app.filtering_by_3abae343')} <span className="text-primary">#{tag}</span>
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={clearFilters}
                    className="flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-[color,background-color,border-color,opacity,transform] hover:bg-white/10 hover:text-foreground"
                  >
                    {uiI18n.t('app.clear_719ea396')} <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Post-type filter chips (item 11) */}
              {(tab === 'foryou' || tab === 'following') && (
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  {([
                    { value: undefined, get label() { return uiI18n.t('app.all_6a720856'); }, icon: Sparkles },
                    { value: 'playlist' as const, get label() { return uiI18n.t('app.playlists_77b69f32'); }, icon: Music2 },
                    { value: 'tierlist' as const, get label() { return uiI18n.t('app.tier_lists_86752701'); }, icon: Layers },
                    { value: 'watchroom' as const, get label() { return uiI18n.t('app.watchrooms_8b19ed3b'); }, icon: Radio },
                  ]).map(({ value, label, icon: Icon }) => {
                    const active = postType === value;
                    return (
                      <button
                        key={label}
                        aria-pressed={active}
                        type="button"
                        onClick={() => setPostType(value)}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-[color,background-color,border-color,opacity,transform]',
                          active
                            ? 'border-primary/40 bg-primary/15 text-primary'
                            : 'border-border bg-white/[0.03] text-muted-foreground hover:border-white/20 hover:text-foreground',
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Feed Content Switching */}
              {tab === 'schedule' ? (
                <CommunityEventsSection />
              ) : tab === 'news' ? (
                <div className="space-y-8">
                  <FeedList tab="news" tag={tag} showComposer={false} />
                </div>
              ) : (
                <FeedList tab={feedTab} tag={tag} postType={postType} />
              )}
            </div>

            {/* Right Sidebar — shared X-style follow-along rail */}
            <CommunityRightRail
              onlineUsers={onlineUsers}
              onlineUserIds={onlineUserIds}
              onOpenLeaderboard={() => setLeaderboardOpen(true)}
            />

          </div>
          )}

        </div>
      </main>

      {/* Global Modals & Navigation Overlays */}
      <LeaderboardSheet open={leaderboardOpen} onOpenChange={setLeaderboardOpen} />
      <CreateCommunityDialog open={createOpen} onOpenChange={setCreateOpen} />
      <MobileNav />
    </div>
  );
}
