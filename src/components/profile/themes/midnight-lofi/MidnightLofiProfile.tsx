import { lazy, Suspense, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  Flame,
  Heart,
  History,
  Layers,
  Library,
  Settings2,
  Sparkles,
  Trophy,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Seo } from '@/components/seo/Seo';
import { useSettingsModal } from '@/contexts/SettingsModalContext';
import { MidnightLofiScene } from './MidnightLofiScene';
import {
  FrostedCard,
  LofiEmpty,
  LofiMediaCard,
  LofiNameDisplay,
  LofiPortrait,
  PillStat,
} from './MidnightLofiComponents';
import { defaultMidnightLofiConfig, readMidnightLofiConfig } from './config';
import type { ProfileThemeData, ThemeRendererProps } from '../types';
import './midnight-lofi.css';
import { LofiMusic } from './LofiMusic';

const Vault = lazy(() => import('./MidnightLofiVault'));

function LofiStreakCard({ data }: { data: ProfileThemeData }) {
  const current = data.canViewHistory ? data.stats.streak : '—';
  const longest = data.canViewHistory ? data.stats.longestStreak : '—';
  return (
    <FrostedCard className="p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-amber-400 font-bold flex items-center gap-1.5">
          <Flame size={15} />
          <span>Watch Streak</span>
        </span>
        <span className="text-xl font-extrabold text-white">{current} days</span>
      </div>
      <p className="text-xs text-slate-400">
        {data.canViewHistory
          ? `Personal record: ${longest} consecutive days`
          : 'Watch activity is private.'}
      </p>
      <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full bg-amber-400 rounded-full transition-all duration-500"
          style={{
            width: `${
              data.canViewHistory && data.stats.longestStreak
                ? Math.min(100, (data.stats.streak / data.stats.longestStreak) * 100)
                : 0
            }%`,
          }}
        />
      </div>
    </FrostedCard>
  );
}

function LofiOverview({ data }: { data: ProfileThemeData }) {
  return (
    <div className="ml-overview-grid">
      {/* Frosted Pill Stats Strip (Animanga inspired) */}
      <div className="ml-stats-strip">
        <PillStat
          label="Anime Library"
          value={data.canViewLibrary ? data.stats.anime : '—'}
          sub="titles"
          arrow
        />
        <PillStat
          label="Manga Library"
          value={data.canViewLibrary ? data.stats.manga : '—'}
          sub="titles"
          arrow
        />
        <PillStat
          label="Episodes"
          value={data.canViewHistory ? data.stats.episodes : '—'}
          sub="watched"
        />
        <PillStat
          label="Devotion Time"
          value={data.canViewHistory ? `${data.stats.hours}h` : '—'}
          highlight
        />
      </div>

      {/* Recent Watch Activity */}
      <section className="space-y-4">
        <header className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <History size={18} className="text-amber-400" />
            <span>Recent Activity</span>
          </h3>
          <span className="text-xs text-slate-400">Latest episodes & updates</span>
        </header>
        {!data.canViewHistory ? (
          <LofiEmpty privateState>Watch activity is private.</LofiEmpty>
        ) : data.activity.length ? (
          <div className="ml-media-grid">
            {data.activity.slice(0, 6).map(item => (
              <LofiMediaCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <LofiEmpty>No recent activity logged yet.</LofiEmpty>
        )}
      </section>

      {/* Favorite Characters */}
      <section className="space-y-4">
        <header className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Heart size={18} className="text-rose-400" />
            <span>Favorites</span>
          </h3>
          <span className="text-xs text-slate-400">Pinned characters</span>
        </header>
        {data.favorites.length ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {data.favorites.slice(0, 6).map(item => (
              <Link
                key={item.id}
                to={item.href}
                className="group relative flex flex-col items-center rounded-[18px] border border-white/10 bg-slate-900/50 p-2.5 transition-all hover:bg-slate-900/80 hover:border-white/20 hover:shadow-lg"
              >
                <div className="relative aspect-square w-full overflow-hidden rounded-[14px] bg-slate-950">
                  <img
                    src={item.image}
                    alt={item.title}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
                <span className="mt-2 text-center text-xs font-semibold text-slate-200 line-clamp-1 group-hover:text-white">
                  {item.title}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <LofiEmpty>No favorite characters pinned yet.</LofiEmpty>
        )}
      </section>
    </div>
  );
}

export default function MidnightLofiProfile({ data, configuration, onBack }: ThemeRendererProps) {
  const config = readMidnightLofiConfig(configuration) ?? defaultMidnightLofiConfig();
  const { openSettings } = useSettingsModal();
  const [params, setSearchParams] = useSearchParams();

  const name = data.owner.display_name || data.owner.username || 'User';
  const tabs = data.tabs ?? [{ id: 'overview', label: 'Overview', summary: '' }];
  const requested = params.get('tab');
  const activeTab = tabs.some(t => t.id === requested) ? requested! : 'overview';

  const openTab = (id: string) => {
    setSearchParams(
      p => {
        if (id === 'overview') p.delete('tab');
        else p.set('tab', id);
        return p;
      },
      { replace: true }
    );
  };

  const collections = {
    watchlist: data.canViewLibrary ? data.sections?.watchlist ?? data.library : [],
    'manga-readlist': data.canViewLibrary ? data.sections?.manga ?? [] : [],
    'novel-readlist': data.isOwner ? data.sections?.novels ?? [] : [],
    history: data.canViewHistory ? [...data.activity, ...(data.sections?.readingHistory ?? [])] : [],
  };

  return (
    <main className="ml-profile" style={{ '--ml-accent': config.accent === 'amber' ? '#f1cc91' : config.accent === 'violet' ? '#c5b8f3' : '#a9cce7', '--ml-glow': config.glowIntensity } as CSSProperties}>
      <Seo title={name} description={`${name}'s Midnight Lo-Fi profile on Tatakai.`} />

      {/* Top Bar */}
      <header className="ml-topbar">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-slate-300 hover:text-white">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          <span>Back</span>
        </Button>
        <Link to="/" className="ml-wordmark">
          TATAKAI
          <span>@{data.owner.username || name}</span>
        </Link>
        <div className="flex items-center gap-2">
          {data.isOwner && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => openSettings('profile-store')}
              className="border-white/10 bg-slate-900/60 hover:bg-slate-800 text-slate-200"
            >
              <Settings2 className="mr-1.5 h-3.5 w-3.5" />
              <span>Themes & Store</span>
            </Button>
          )}
        </div>
      </header>

      {/* Cinematic Hero Banner Scene */}
      <section className="ml-hero" aria-label={`${name}'s profile banner`}>
        <MidnightLofiScene
          paused={!config.motion}
          scanlines={config.scanlines}
          japaneseAccents={config.japaneseAccents}
        />
        <div className="ml-hero-content">
          <div className="ml-hero-title">
            <span className="ml-hero-eyebrow">
              <Sparkles size={13} />
              <span>夜の記録 · A little world after dark</span>
            </span>
            <h1 className="ml-hero-name">
              <LofiNameDisplay userId={data.owner.user_id} name={name} />
            </h1>
          </div>
          <div className="hidden sm:flex ml-hero-stats">
            <div className="rounded-full border border-white/15 bg-slate-950/70 backdrop-blur-md px-4 py-1.5 text-xs font-semibold text-slate-200">
              {data.followers} Followers
            </div>
            {data.canViewHistory && (
              <div className="rounded-full border border-amber-400/30 bg-amber-950/30 backdrop-blur-md px-4 py-1.5 text-xs font-semibold text-amber-200">
                {data.stats.hours}h Devoted
              </div>
            )}
          </div>
        </div>
      </section>

      <LofiMusic music={config.music} />
      {/* Page Body Grid */}
      <div className="ml-body">
        {/* Left Sidebar */}
        <aside className="ml-identity">
          <FrostedCard className="ml-identity-card">
            <div className="ml-identity-avatar-wrap">
              <LofiPortrait
                userId={data.owner.user_id}
                avatar={data.owner.avatar_url ?? undefined}
                name={name}
                size="lg"
              />
            </div>
            <h2 className="ml-identity-name">
              <LofiNameDisplay userId={data.owner.user_id} name={name} />
            </h2>
            <p className="ml-identity-handle">@{data.owner.username || 'wanderer'}</p>

            {data.owner.bio && <p className="ml-identity-bio">{data.owner.bio}</p>}

            {/* Badges */}
            {data.badges.length > 0 && (
              <div className="ml-identity-badges">
                {data.badges.map(b => (
                  <img key={b.key} src={b.image} alt={b.label} title={b.label} />
                ))}
              </div>
            )}

            {/* Follow Button (Image 2 style solid white/gold or frosted) */}
            {!data.isOwner && (
              <button
                type="button"
                className="mt-6 w-full rounded-full bg-white text-slate-950 hover:bg-slate-100 font-bold text-xs py-3 px-5 transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2"
                disabled={data.followPending}
                onClick={data.onFollow}
              >
                {data.following ? (
                  <>
                    <UserCheck className="h-4 w-4 text-slate-950" />
                    <span>Following</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 text-slate-950" />
                    <span>Follow</span>
                  </>
                )}
              </button>
            )}

            {/* Social Links */}
            {data.links.length > 0 && (
              <div className="mt-5 flex flex-col gap-2 w-full pt-4 border-t border-white/10">
                {data.links.map(link => (
                  <a
                    key={link.label}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between text-xs text-slate-300 hover:text-white transition-colors py-1.5 px-3 rounded-full hover:bg-white/5"
                  >
                    <span>{link.label}</span>
                    <ArrowUpRight size={13} className="text-amber-400" />
                  </a>
                ))}
              </div>
            )}
          </FrostedCard>

          {/* Watch Streak Widget */}
          <LofiStreakCard data={data} />
        </aside>

        {/* Right Main Content */}
        <div className="flex flex-col min-w-0">
          {/* Navigation Tabs */}
          <nav className="ml-tabs-nav"  aria-label="Profile Sections">
            {tabs.map(tab => (
              <button
                key={tab.id}
                type="button"
                aria-current={activeTab === tab.id ? 'page' : undefined}
                data-active={activeTab === tab.id}
                onClick={() => openTab(tab.id)}
                className="ml-tab-btn"
              >
                {tab.id === 'overview' && <Sparkles size={14} />}
                {tab.id === 'watchlist' && <Library size={14} />}
                {tab.id === 'manga-readlist' && <Bookmark size={14} />}
                {tab.id === 'history' && <History size={14} />}
                {tab.id === 'streaks' && <Trophy size={14} />}
                {tab.id === 'vault' && <Layers size={14} />}
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>

          {/* Tab Panel */}
          <div>
            {data.loading ? (
              <p className="text-center py-16 text-slate-400" role="status">
                Loading archive…
              </p>
            ) : data.error ? (
              <p className="text-center py-16 text-rose-400" role="alert">
                Could not load profile data.
              </p>
            ) : activeTab === 'overview' ? (
              <LofiOverview data={data} />
            ) : activeTab in collections ? (
              <section className="space-y-4">
                <header className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-white">
                    {tabs.find(t => t.id === activeTab)?.label || activeTab}
                  </h3>
                  <span className="text-xs text-slate-400">
                    {collections[activeTab as keyof typeof collections].length} items
                  </span>
                </header>
                {collections[activeTab as keyof typeof collections].length ? (
                  <div className="ml-media-grid">
                    {collections[activeTab as keyof typeof collections].map(item => (
                      <LofiMediaCard key={item.id} item={item} />
                    ))}
                  </div>
                ) : (
                  <LofiEmpty>No items saved to this collection yet.</LofiEmpty>
                )}
              </section>
            ) : activeTab === 'streaks' ? (
              <div className="space-y-6">
                <LofiStreakCard data={data} />
                <FrostedCard className="p-6">
                  <h3 className="text-base font-bold text-white mb-4">Achievements</h3>
                  {data.canViewHistory && data.achievements?.length ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {data.achievements.map(a => (
                        <div
                          key={a.id}
                          className="flex items-start gap-3 p-3 rounded-2xl border border-white/5 bg-slate-900/40"
                        >
                          <Trophy
                            size={20}
                            className={a.unlocked ? 'text-amber-400' : 'text-slate-600'}
                          />
                          <div>
                            <h4 className="text-sm font-semibold text-white">{a.title}</h4>
                            <p className="text-xs text-slate-400">{a.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <LofiEmpty>No unlocked achievements yet.</LofiEmpty>
                  )}
                </FrostedCard>
              </div>
            ) : activeTab === 'vault' ? (
              <Suspense fallback={<p className="text-center py-12 text-slate-400">Loading vault…</p>}>
                <Vault data={data} />
              </Suspense>
            ) : (
              <LofiEmpty>Select a section from the navigation.</LofiEmpty>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
