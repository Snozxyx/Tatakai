import uiI18n from '@/lib/uiI18n';
import '@/components/layout/catalog-polish.css';
import landingScene from '@/assets/landing-cherry-scene.webp';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, Play, Download } from 'lucide-react';
import { Navigation } from '@/components/ui/navbar';
import { useGitHubRepo, useLatestRelease, useAllReleases, platformForAsset, formatCompact, GITHUB_REPO_URL } from '@/lib/github';
import { supabase } from '@/integrations/supabase/client';
import { FeatureShowcase } from '@/components/landing/FeatureShowcase';
import { FooterSection } from '@/components/ui/footer';
import { useMotionPreference } from '@/hooks/ui/useMotionPreference';

export default function LandingPage() {
  useUiTranslation();
  const navigate = useNavigate();
  const reducedMotion = useMotionPreference();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoReady, setVideoReady] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || reducedMotion) return;
    void video.play().catch(() => setVideoReady(false));
  }, [reducedMotion]);
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
    { value: stars ?? "—", get label() { return uiI18n.t('app.github_stars_54c57454'); } },
    { value: latestVersion ? `v${latestVersion}` : "—", get label() { return uiI18n.t('app.latest_release_f7b7a560'); } },
    latestDownloads > 0
      ? { value: formatCompact(latestDownloads), get label() { return uiI18n.t('app.app_downloads_ee2154fd'); } }
      : { value: forks ?? "—", get label() { return uiI18n.t('app.github_forks_868c5828'); } },
    mobileDownloads > 0
      ? { value: formatCompact(mobileDownloads), get label() { return uiI18n.t('app.mobile_downloads_ec3607f5'); } }
      : null,
  ].filter(Boolean) as { value: string; label: string }[];

  return (
    <div data-app-page-surface className="landing-page relative min-h-screen w-full overflow-hidden bg-black text-white">
      <section className="landing-hero relative min-h-screen w-full overflow-hidden" aria-labelledby="landing-heading">
        <div data-app-route-background className="landing-scene pointer-events-none absolute inset-0">
          <img src={landingScene} alt="" aria-hidden="true" fetchPriority="high" className={`absolute inset-0 h-full w-full object-cover object-right transition-opacity duration-200 ${videoReady && !reducedMotion ? 'opacity-0' : 'opacity-100'}`} />
          {!reducedMotion && <video ref={videoRef} autoPlay muted loop playsInline preload="metadata" aria-hidden="true" onLoadedData={() => setVideoReady(true)} onError={() => setVideoReady(false)} className="absolute inset-0 h-full w-full object-cover object-center opacity-50">
            <source src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/bg-hero-0BnFGdr81Ifnj3WbBZoNt1KE4D5DMT.mp4" type="video/mp4" />
          </video>}
          <div className="landing-scene-shade absolute inset-0" />
        </div>

        <div className="relative z-30"><Navigation /></div>

        <main className="landing-hero-content relative z-10 mx-auto flex min-h-screen w-full max-w-[1400px] flex-col justify-between px-6 pt-24 pb-8 lg:px-16 lg:pt-28 lg:pb-10">
          <div className="landing-copy flex flex-1 flex-col justify-center py-8 lg:py-12">
            {latestVersion && (
              <a href={GITHUB_REPO_URL + '/releases/latest'} target="_blank" rel="noopener noreferrer" className="mb-6 inline-flex w-fit items-center gap-2 text-xs text-white/70 transition-colors hover:text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
                {uiI18n.t('app.latest_release_f7b7a560')} · v{latestVersion}
              </a>
            )}
            <h1 id="landing-heading" className="mb-6 max-w-[42rem] font-display text-[clamp(2.5rem,5vw,4.5rem)] font-medium leading-[1.06] tracking-[-0.025em] text-white text-balance">
              {uiI18n.t('landingHero.headline')}
            </h1>
            <p className="mb-8 max-w-[32rem] text-base leading-relaxed text-white/70 lg:text-lg">
              {uiI18n.t('landingHero.description')}
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={() => navigate('/download')} className="group h-12 rounded-full bg-white px-6 text-sm font-medium text-black transition-colors hover:bg-white/90">
                <Download className="mr-2 h-4 w-4" />
                {uiI18n.t('landingHero.download')}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" onClick={() => navigate('/browse')} className="h-12 rounded-full border-white/15 bg-black/20 px-6 text-sm font-medium text-white transition-colors hover:bg-white/10">
                <Play className="mr-2 h-4 w-4" />
                {uiI18n.t('app.browse_2f3b5c55')}
              </Button>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3 text-xs text-white/70">
              {avatars.length > 0 && (
                <div className="flex -space-x-2" aria-hidden="true">
                  {avatars.map((url, index) => (
                    <img key={index} src={url} alt="" loading="lazy" className="h-7 w-7 rounded-full border-2 border-black object-cover bg-white/10" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
                  ))}
                </div>
              )}
              <span>{uiI18n.t('app.free_amp_open_source_351c1503')} {uiI18n.t('app.join_the_community_616a484e')}</span>
              <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer" className="font-mono text-white/80 transition-colors hover:text-white">
                ★ {stars ?? '—'} {uiI18n.t('app.on_github_f5ea2d2f')}
              </a>
            </div>
          </div>

          <div className="landing-hero-stats w-full border-t border-white/10 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-6">
              <div className="flex flex-wrap items-center gap-x-10 gap-y-5 lg:gap-x-16">
                {heroStats.map((stat) => (
                  <div key={stat.label} className="flex flex-col gap-1">
                    <span className="font-display text-3xl font-medium tabular-nums text-white">{stat.value}</span>
                    <span className="text-xs text-white/70">{stat.label}</span>
                  </div>
                ))}
              </div>
              <div className="hidden items-center gap-3 text-xs text-white/60 md:flex">
                <span>{uiI18n.t('app.scroll_da4313f4')}</span><span className="h-px w-12 bg-white/20" aria-hidden />
              </div>
            </div>
          </div>
        </main>
      </section>
      <FeatureShowcase />
      <FooterSection />
    </div>
  );
}
