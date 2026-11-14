import { BrandLogo } from '@/components/branding/BrandLogo';
import '@/components/layout/catalog-polish.css';
import './setup-page.css';
import setupScene from '@/assets/landing-cherry-scene.webp';
import { useMotionPreference } from '@/hooks/ui/useMotionPreference';
import { backgroundVideo } from '@/lib/assets';
import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { rankSetupExtensions } from '@/core/extensions/setup-ranking';
import { usePersistentState } from '@/hooks/ui/usePersistentState';
import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  motion,
  AnimatePresence,
  MotionConfig,
} from 'framer-motion';

import {
  Folder,
  Shield,
  ChevronRight,
  Check,
  Disc,
  Play,
  ArrowLeft,
  Globe,
  Wifi,
  Puzzle,
  HardDrive,
  Lock,
  Zap,
  Star,
  ShieldCheck,
  Key,
  Heart,
  MessageCircle,
  Download,
  Loader2,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Capacitor } from '@capacitor/core';
import { useCountryPolicy } from '@/core/country-policy/useCountryPolicy';
import { FeatureFlag, setFlag } from '@/core/feature-flags';
import { DebridSettingsPanel } from '@/components/settings/DebridSettingsPanel';
import { useStoreCatalogue, useExtensionInstaller } from '@/hooks/api/useExtensionStore';
import { isIOS, isMobileNative } from '@/lib/platform/platform';

const VIDEO_SOURCES = ['1.mp4', '2.webm', '3.mp4', '5.mp4', '6.mp4'].map(backgroundVideo);

const STEP_META = [
  {
    icon: Folder,
    color: 'blue',
    get title() { return uiI18n.t('app.storage_9e092dda'); },
    get subtitle() { return uiI18n.t('app.where_should_your_anime_live_89e76c61'); },
  },
  {
    icon: Shield,
    color: 'purple',
    get title() { return uiI18n.t('app.privacy_cf01481f'); },
    get subtitle() { return uiI18n.t('app.control_your_integrations_97de6670'); },
  },
  {
    icon: Globe,
    color: 'red',
    get title() { return uiI18n.t('app.country_policy_346b76a4'); },
    get subtitle() { return uiI18n.t('app.legal_context_for_torrent_use_b287e22f'); },
  },
  {
    icon: Wifi,
    color: 'cyan',
    get title() { return uiI18n.t('app.network_53ebc572'); },
    get subtitle() { return uiI18n.t('app.secure_your_connection_c01b6aa8'); },
  },
  {
    icon: Puzzle,
    color: 'green',
    get title() { return uiI18n.t('app.extensions_656bcfe2'); },
    get subtitle() { return uiI18n.t('app.setup_extensions_subtitle'); },
  },
  {
    icon: Key,
    color: 'blue',
    get title() { return uiI18n.t('app.debrid_services_8677d82b'); },
    get subtitle() { return uiI18n.t('app.direct_high_speed_streaming_9eeef00e'); },
  },
  {
    icon: Heart,
    color: 'purple',
    get title() { return uiI18n.t('app.support_f32d5a3b'); },
    get subtitle() { return uiI18n.t('app.help_the_project_grow_115237c3'); },
  },
];

const COLOR_MAP: Record<string, string> = {
  blue: 'bg-muted border-border text-muted-foreground',
  purple: 'bg-muted border-border text-muted-foreground',
  red: 'bg-muted border-border text-muted-foreground',
  cyan: 'bg-muted border-border text-muted-foreground',
  green: 'bg-muted border-border text-muted-foreground',
};

function SetupStepTransition({ step, reduceMotion, children }: {
  step: number;
  reduceMotion: boolean;
  children: (stepIndex: number) => React.ReactNode;
}) {
  const sliderRef = useRef<HTMLDivElement>(null);
  const [transition, setTransition] = useState<{ step: number; page: 1 | 2; previous: number | null }>({ step, page: 1, previous: null });
  const [shownPage, setShownPage] = useState<1 | 2>(1);

  if (transition.step !== step) {
    setTransition({ step, page: transition.page === 1 ? 2 : 1, previous: transition.step });
  }

  useLayoutEffect(() => {
    const slider = sliderRef.current;
    if (!slider) return;
    // Paint the incoming page's resting state before flipping the CSS hook.
    void slider.offsetWidth;
    setShownPage(transition.page);
    if (transition.previous === null) return;

    if (slider.parentElement) slider.parentElement.scrollTop = 0;
    slider.querySelector<HTMLElement>(`#setup-step-title-${step}`)?.focus({ preventScroll: true });
    const styles = getComputedStyle(slider);
    const milliseconds = (property: string) => {
      const value = styles.getPropertyValue(property).trim();
      return (parseFloat(value) || 0) * (value.endsWith('ms') ? 1 : 1000);
    };
    const duration = reduceMotion ? 0 : Math.max(milliseconds('--page-slide-dur'), milliseconds('--page-fade-dur')) + milliseconds('--page-stagger');
    const timer = window.setTimeout(() => {
      setTransition(current => current.step === step ? { ...current, previous: null } : current);
    }, duration);
    return () => window.clearTimeout(timer);
  }, [step, transition.page, transition.previous, reduceMotion]);

  const direction = transition.previous === null || step > transition.previous ? 1 : -1;
  return (
    <div ref={sliderRef} className="t-page-slide" data-page={shownPage}>
      {[transition.previous, transition.step].filter((value): value is number => value !== null).map(stepIndex => {
        const active = stepIndex === transition.step;
        const page = active ? transition.page : transition.page === 1 ? 2 : 1;
        const fromRight = active ? direction > 0 : direction < 0;
        return (
          <section
            key={stepIndex}
            ref={element => { if (element) element.inert = !active; }}
            className="t-page"
            data-page-id={page}
            data-active={active}
            aria-hidden={!active}
            aria-labelledby={`setup-step-title-${stepIndex}`}
            style={{ '--t-page-from-x': fromRight ? 'var(--page-slide-distance)' : 'calc(var(--page-slide-distance) * -1)' } as React.CSSProperties}
          >
            {children(stepIndex)}
          </section>
        );
      })}
    </div>
  );
}

// --- Sub-components ---

const CustomCheckbox = ({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) => {
  const labelId = React.useId();
  return (
  <div className="flex items-start gap-2 group">
    <button type="button" role="checkbox" aria-checked={checked} aria-labelledby={labelId} onClick={() => onChange(!checked)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
    <motion.div
      className={cn(
        'w-5 h-5 rounded-[6px] flex items-center justify-center border transition-colors mt-0.5 flex-shrink-0',
        checked
          ? 'bg-primary border-primary'
          : 'bg-muted/50 border-border group-hover:border-primary/50'
      )}
      whileTap={{ scale: 0.9 }}
    >
      <AnimatePresence>
        {checked && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
          >
            <Check className="w-3.5 h-3.5 text-primary-foreground stroke-[3]" />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
    </button>
    <div id={labelId} className="select-none flex-1 pt-3" onClick={(event) => { if (event.target instanceof Element && event.target.closest('button,a,input')) return; onChange(!checked); }}>{children}</div>
  </div>
  );
};

const Toggle = ({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) => {
  useUiTranslation();
  return (
    <motion.button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={label}
      whileTap={{ scale: 0.9 }}
      onClick={() => onChange(!value)}
      className={cn(
        'setup-toggle relative w-11 h-6 rounded-full p-1 transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary/30',
        value ? 'bg-primary' : 'bg-muted-foreground/20'
      )}
    >
      <motion.div
        className="w-4 h-4 bg-white rounded-full shadow-sm relative z-10"
        layout
        transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
        animate={{ x: value ? 20 : 0 }}
      />
    </motion.button>
  );
};

function ProgressBar({ step, total }: { step: number; total: number }) {
  useUiTranslation();
  return (
    <div className="setup-progress" role="progressbar" aria-label={uiI18n.t('app.setup_label')} aria-valuemin={1} aria-valuemax={total} aria-valuenow={step} aria-valuetext={`${step} / ${total}: ${STEP_META[step - 1].title}`}>
      {Array.from({ length: total }).map((_, i) => {
        const n = i + 1;
        const done = step > n;
        const active = step === n;

        return (
          <div key={n} className="setup-progress-item" data-active={active} data-complete={done} aria-hidden="true">
            <div className="setup-progress-stop">
              {done ? (
                <Check className="w-3 h-3" />
              ) : (
                <span>{n}</span>
              )}
            </div>

            {n < total && (
              <div className="setup-progress-track" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function StepHeader({ stepIndex }: { stepIndex: number }) {
  useUiTranslation();
  const base = STEP_META[stepIndex - 1];
  const meta = isMobileNative() && stepIndex === 2
    ? { ...base, get subtitle() { return uiI18n.t('app.review_mobile_app_permissions_4c156817'); } }
    : isIOS() && stepIndex === 3
      ? { ...base, get title() { return uiI18n.t('app.region_0f217179'); }, get subtitle() { return uiI18n.t('app.regional_content_settings_76804b26'); } }
      : base;
  if (!meta) return null;
  const Icon = meta.icon;

  return (
    <div className="setup-step-header flex items-center gap-3 mb-6">
      <div
        className={cn('setup-step-icon w-11 h-11 rounded-xl flex items-center justify-center border', COLOR_MAP[meta.color])}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <h3
          id={`setup-step-title-${stepIndex}`}
          tabIndex={-1}
          className="text-xl font-medium text-foreground tracking-tight"
        >
          {meta.title}
        </h3>
        <p
          className="text-sm text-muted-foreground"
        >
          {meta.subtitle}
        </p>
      </div>
    </div>
  );
}

function ToggleRow({
  icon: Icon,
  title,
  desc,
  value,
  onChange,
}: {
  icon: React.ElementType;
  title: string;
  desc: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  useUiTranslation();
  return (
    <motion.div
      className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-card border border-border/50 hover:border-primary/30 shadow-sm transition-[color,background-color,border-color,opacity]"
    >
      <div className="min-w-0 flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-muted text-muted-foreground">
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
        </div>
      </div>
      <Toggle value={value} onChange={onChange} label={title} />
    </motion.div>
  );
}

function NavButtons({
  onBack,
  onNext,
  nextLabel,
  nextIcon: NextIcon,
  nextDisabled = false,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextIcon?: React.ElementType;
  nextDisabled?: boolean;
}) {
  useUiTranslation();
  return (
    <div className="setup-nav flex gap-3 pt-6">
      {onBack && (
        <Button
          variant="ghost"
          onClick={onBack}
          className="flex-1 h-12 gap-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-xl"
        >
          <ArrowLeft className="w-4 h-4" />
          {uiI18n.t('app.back_b52b36b7')}
        </Button>
      )}

      <motion.div className="flex-[2]"  whileTap={!nextDisabled ? { scale: 0.98 } : {}}>
        <Button
          onClick={onNext}
          disabled={nextDisabled}
          className="w-full h-12 rounded-[10px] bg-primary hover:bg-primary/90 text-primary-foreground font-medium gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {NextIcon && <NextIcon className="w-4 h-4" />}
          {nextLabel ?? uiI18n.t('app.continue_2e026239')}
          {!NextIcon && <ChevronRight className="w-4 h-4" />}
        </Button>
      </motion.div>
    </div>
  );
}

function SetupExtensionsList() {
  useUiTranslation();
  const { items, isLoading, isServiceConfigured } = useStoreCatalogue({ limit: 100 });
  const installer = useExtensionInstaller();
  const top = useMemo(() => rankSetupExtensions(items).slice(0, 5), [items]);

  if (!isServiceConfigured) return null;

  return (
    <motion.div className="space-y-3 pt-2">
      <p className="text-xs font-medium normal-case tracking-normal text-muted-foreground px-1">
        {uiI18n.t('app.popular_add_ons_c08a98f9')}
      </p>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-muted/40 animate-pulse border border-border/50" />
          ))}
        </div>
      ) : top.length === 0 ? (
        <p className="text-xs text-muted-foreground px-1">
          {uiI18n.t('app.no_extensions_available_right_now_add_them_later_23b7eebd')}
        </p>
      ) : (
        <div className="setup-scroll space-y-2 max-h-[220px] overflow-y-auto">
          {top.map((ext) => {
            const state = installer.stateFor(ext);
            const busy = state === 'installing';
            return (
              <div
                key={ext.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border/50 shadow-sm"
              >
                {ext.icon ? (
                  <img src={ext.icon} alt="" className="w-9 h-9 rounded-lg object-cover shadow-sm flex-shrink-0" loading="lazy" />
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Puzzle className="w-4 h-4 text-primary" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{ext.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{ext.author}</p>
                </div>
                {ext.isFeatured && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-medium flex-shrink-0">
                    {uiI18n.t('app.official_ac60fda7')}
                  </span>
                )}
                {state === 'installed' ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 px-2.5 text-xs gap-1 flex-shrink-0"
                    title={uiI18n.t('app.remove_this_extension_e70271d7')}
                    onClick={() => installer.toggle(ext)}
                  >
                    <Check className="w-3.5 h-3.5" />
                    {uiI18n.t('app.added_b68734c2')}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="h-8 px-2.5 text-xs gap-1 flex-shrink-0"
                    disabled={busy}
                    onClick={() => installer.toggle(ext)}
                  >
                    {busy ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    {busy ? uiI18n.t('app.adding_ffb2e628') : uiI18n.t('app.add_61cc55aa')}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

function openExternalUrl(url: string) {
  const bridge = (window as any).electron;
  if (bridge?.openExternal) void bridge.openExternal(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
}

// --- Main Page ---

export default function SetupPage() {
  useUiTranslation();
  const [savedStep, setStep] = usePersistentState('tatakai_setup_step', 1, 'local');
  const step = Number.isInteger(savedStep) ? Math.min(7, Math.max(1, savedStep)) : 1;

  // States
  const [downloadPath, setDownloadPath] = usePersistentState('tatakai_setup_draft:downloadPath', '', 'local');
  const [discordEnabled, setDiscordEnabled] = usePersistentState('tatakai_setup_draft:discordEnabled', true, 'local');
  const [countryAck, setCountryAck] = usePersistentState('tatakai_setup_draft:countryAck', false, 'local');
  const [enableWarp, setEnableWarp] = usePersistentState('tatakai_setup_draft:enableWarp', false, 'local');
  const [enableExtensions, setEnableExtensions] = usePersistentState('tatakai_setup_draft:enableExtensions', true, 'local');
  const [tcAccepted, setTcAccepted] = usePersistentState('tatakai_setup_draft:tcAccepted', false, 'local');

  const tcAcceptedRef = useRef(false);
  tcAcceptedRef.current = tcAccepted;
  const countryAckRef = useRef(false);
  countryAckRef.current = countryAck;

  const navigate = useNavigate();
  const shouldReduceMotion = useMotionPreference();
  const setupVideoRef = useRef<HTMLVideoElement>(null);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const countryPolicy = useCountryPolicy();

  const isMobile = Capacitor.isNativePlatform() && !!(window as any).Capacitor;
  const isIos = isIOS();
  const isDesktop = !!(window as any).electron;
  // Keep the same guided setup on mobile and desktop. The storage step already
  // adapts to Capacitor's managed app storage, while the remaining preferences
  // are safe to configure on every platform.
  const totalSteps = 7;

  const randomVideoSrc = useMemo(() => VIDEO_SOURCES[Math.floor(Math.random() * VIDEO_SOURCES.length)], []);

  useEffect(() => {
    const video = setupVideoRef.current;
    if (!video) return;
    if (shouldReduceMotion) video.pause();
    else void video.play().catch(() => undefined);
  }, [shouldReduceMotion]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const init = async () => {
      if (isDesktop && (window as any).electron) {
        try {
          const path = await (window as any).electron.getDownloadsDir();
          setDownloadPath(previous => previous || path);
        } catch {}
      } else if (isMobile) {
        setDownloadPath('App Data (Internal)');
      }
    };
    init();
  }, [isDesktop, isMobile]);

  const goTo = (next: number) => {
    setStep(next);
  };

  const handleContinue = () => {
    if (step === 3 && !isIos && !countryAckRef.current) return;
    if (step === totalSteps) handleComplete();
    else goTo(step + 1);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea, button, [contenteditable=true]')) return;
      if (e.key === 'Enter' && step !== totalSteps) {
        handleContinue();
      } else if (e.key === 'Enter' && step === totalSteps && tcAcceptedRef.current) {
        handleComplete();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [step]);

  const handleComplete = async () => {
    if (isDesktop && !tcAcceptedRef.current) return;

    localStorage.setItem('tatakai_setup_complete', 'true');
    localStorage.removeItem('tatakai_setup_step');
    for (const field of ['downloadPath', 'discordEnabled', 'countryAck', 'enableWarp', 'enableExtensions', 'tcAccepted']) {
      localStorage.removeItem(`tatakai_setup_draft:${field}`);
    }
    if (isDesktop) {
      localStorage.setItem('tatakai_download_path', downloadPath);
      localStorage.setItem('tatakai_discord_rpc', String(discordEnabled));
      localStorage.setItem('tatakai_country_ack', String(countryAck));
      localStorage.setItem('tatakai_enable_warp', String(enableWarp));
      localStorage.setItem('tatakai_enable_extensions', String(enableExtensions));
      localStorage.setItem('tatakai_tc_accepted', String(tcAccepted));

      try {
        if ((window as any).tatakaiRuntime?.toggleWarp) {
          await (window as any).tatakaiRuntime.toggleWarp(enableWarp);
          await (window as any).tatakaiRuntime.setWarpMode?.('auto');
        }
      } catch {}
    }

    setFlag(FeatureFlag.EXTENSION_SCRAPING, enableExtensions);
    navigate('/');
  };

  return (
    <MotionConfig reducedMotion={shouldReduceMotion ? 'always' : 'never'}>
    <div className="catalog-page setup-page bg-background relative selection:bg-primary/30" data-reduced-motion={shouldReduceMotion}>
      

      {/* LEFT COLUMN: Setup Interface */}
      <div className="setup-panel">
        <div className="setup-form">
          
          {/* Logo & Header */}
          <div className="setup-intro">
            <div className="setup-brand flex items-center gap-3">
              <motion.div

                className="w-12 h-12 rounded-xl flex items-center justify-center border border-border overflow-hidden"
              >
                <BrandLogo  alt={uiI18n.t('app.tatakai_28bda6bd')} className="w-full h-full object-cover" />
              </motion.div>
              <div>
                <h1 className="font-display text-2xl font-medium tracking-tight text-foreground">{uiI18n.t('app.tatakai_28bda6bd')}</h1>
                <p className="text-sm text-muted-foreground">{uiI18n.t('app.setup_label')}</p>
              </div>
            </div>

            <h2 className="text-3xl font-medium text-foreground mb-2 tracking-tight">
              {step === totalSteps ? uiI18n.t('app.almost_ready_9ba8fa05') : uiI18n.t('app.setup_heading')}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {step === 1 ? uiI18n.t('app.setup_description') : uiI18n.t('app.you_can_adjust_these_settings_later_in_preferenc_ca99e89f')}
            </p>
          </div>

          <ProgressBar step={step} total={totalSteps} />

          {/* Dynamic Content Area */}
          <div className="setup-step-content setup-scroll">
            <SetupStepTransition step={step} reduceMotion={shouldReduceMotion}>
              {(stepIndex) => (<>
              
              {/* STEP 1: Storage */}
              {stepIndex === 1 && (
                <motion.div key="s1">
                  <motion.div className="setup-step-body space-y-5">
                    <StepHeader stepIndex={1} />

                    {isMobile ? (
                      <motion.div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-4">
                        <div className="p-2 bg-emerald-500/20 rounded-xl"><Check className="w-4 h-4 text-emerald-500" /></div>
                        <div>
                          <p className="font-medium text-sm text-emerald-50">{uiI18n.t('app.app_storage_c4e44a5b')}</p>
                          <p className="text-xs text-emerald-200/70 mt-1 leading-relaxed">{uiI18n.t('app.downloads_are_safely_managed_inside_internal_app_5eccd7b7')}</p>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div className="space-y-3">
                        <label className="text-sm font-medium text-foreground ml-1">{uiI18n.t('app.download_directory_d625f3b5')}</label>
                        <motion.div  className="flex items-center gap-2 p-1.5 rounded-2xl bg-card border border-border/60 shadow-sm transition-[color,background-color,border-color,opacity] focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20">
                          <div className="p-2 bg-muted rounded-xl ml-1">
                            <HardDrive className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0 flex-1 px-2 text-sm font-mono text-foreground truncate select-none" title={downloadPath || undefined}>
                            {downloadPath || uiI18n.t('app.select_a_folder_d0ab0158')}
                          </div>
                          <Button
                            variant="secondary"
                            className="rounded-xl h-9 px-4 font-medium hover:bg-primary hover:text-primary-foreground transition-colors"
                            onClick={async () => {
                              if (isDesktop && (window as any).electron) {
                                const selected = await (window as any).electron.selectDirectory();
                                if (selected) setDownloadPath(selected);
                              }
                            }}
                          >
                            {uiI18n.t('app.browse_2f3b5c55')}
                          </Button>
                        </motion.div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5 ml-1">
                          <Zap className="w-3.5 h-3.5 text-amber-500" /> {uiI18n.t('app.requires_2_4_gb_per_series_in_1080p_84bfefba')}
                        </p>
                      </motion.div>
                    )}

                  </motion.div>
                </motion.div>
              )}

              {/* STEP 2: Privacy */}
              {stepIndex === 2 && (
                <motion.div key="s2">
                  <motion.div className="setup-step-body space-y-4">
                    <StepHeader stepIndex={2} />
                    {isMobile ? (
                      <motion.div className="p-4 rounded-2xl bg-card border border-border/50 flex items-start gap-4">
                        <div className="p-2 bg-primary/10 rounded-xl"><ShieldCheck className="w-4 h-4 text-primary" /></div>
                        <div>
                          <p className="font-medium text-sm text-foreground">{uiI18n.t('app.mobile_privacy_4feafb46')}</p>
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                            {uiI18n.t('app.tatakai_only_requests_device_permissions_when_a__55525b1a')}
                          </p>
                        </div>
                      </motion.div>
                    ) : (
                      <ToggleRow icon={Disc} title={uiI18n.t('app.discord_rich_presence_1ce59a08')} desc={uiI18n.t('app.setup_discord_description')} value={discordEnabled} onChange={setDiscordEnabled} />
                    )}
                  </motion.div>
                </motion.div>
              )}

              {/* STEP 3: Country Policy */}
              {stepIndex === 3 && (
                <motion.div key="s3">
                  <motion.div className="setup-step-body space-y-5">
                    <StepHeader stepIndex={3} />
                    {isIos ? (
                      <motion.div className="rounded-2xl bg-card border border-border/50 p-5 space-y-3 shadow-inner">
                        <div className="flex items-center gap-3">
                          <Globe className="w-5 h-5 text-primary" />
                          <p className="text-sm font-medium text-foreground">{uiI18n.t('app.regional_streaming_settings_8a2eafba')}</p>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {uiI18n.t('app.region_25cdc1ce')} <span className="font-medium text-foreground">{countryPolicy.countryName || countryPolicy.countryCode}</span>{uiI18n.t('app.tatakai_will_use_sources_available_for_this_regi_b8193616')}
                        </p>
                      </motion.div>
                    ) : (
                    <motion.div className="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-5 space-y-4 shadow-inner">
                      <div className="flex items-center gap-3">
                        <Globe className="w-5 h-5 text-amber-500" />
                        <p className="text-sm font-medium text-amber-50">{uiI18n.t('app.local_copyright_notice_370c3938')}</p>
                      </div>
                      
                      <div className="flex items-center justify-between bg-black/20 p-3 rounded-xl border border-white/5">
                        <span className="text-xs text-muted-foreground">
                          {uiI18n.t('app.region_25cdc1ce')} <span className="font-medium text-foreground ml-1">{countryPolicy.countryName || countryPolicy.countryCode}</span>
                        </span>
                        <span className={cn('text-xs px-2 py-1 rounded-md font-medium normal-case tracking-normal', countryPolicy.badge.tone)}>
                          {countryPolicy.badge.label}
                        </span>
                      </div>

                      <CustomCheckbox checked={countryAck} onChange={setCountryAck}>
                        <span className="text-sm text-foreground/90 leading-snug">
                          {uiI18n.t('app.i_acknowledge_my_local_region_s_policies_regardi_df3e17e1')}
                        </span>
                      </CustomCheckbox>
                    </motion.div>
                    )}
                  </motion.div>
                </motion.div>
              )}

              {/* STEP 4: Network */}
              {stepIndex === 4 && (
                <motion.div key="s4">
                  <motion.div className="setup-step-body space-y-4">
                    <StepHeader stepIndex={4} />
                    <ToggleRow icon={Lock} title={uiI18n.t('app.warp_dns_over_https_34b5ea5c')} desc={uiI18n.t('app.setup_network_description')} value={enableWarp} onChange={setEnableWarp} />
                    <AnimatePresence>
                      {enableWarp && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                          <div className="p-3.5 mt-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-200 flex items-center gap-3">
                            <ShieldCheck className="w-4 h-4 flex-shrink-0" />
                            <span>{uiI18n.t('app.warp_auto_routing_will_be_enabled_for_secure_con_54220c65')}</span>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                </motion.div>
              )}

              {/* STEP 5: Extensions */}
              {stepIndex === 5 && (
                <motion.div key="s5">
                  <motion.div className="setup-step-body space-y-4">
                    <StepHeader stepIndex={5} />
                    <ToggleRow icon={Puzzle} title={uiI18n.t('app.enable_extensions_94bbffe3')} desc={uiI18n.t('app.setup_extensions_description')} value={enableExtensions} onChange={setEnableExtensions} />
                    <AnimatePresence>
                      {enableExtensions && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                          <SetupExtensionsList />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                </motion.div>
              )}

              {/* STEP 6: Debrid Services */}
              {stepIndex === 6 && (
                <motion.div key="s6">
                  <motion.div className="setup-step-body space-y-4">
                    <StepHeader stepIndex={6} />
                    <motion.div className="bg-card p-4 rounded-2xl border border-border/50 shadow-sm">
                      <DebridSettingsPanel />
                    </motion.div>
                  </motion.div>
                </motion.div>
              )}

              {/* STEP 7: Support & Terms */}
              {stepIndex === 7 && (
                <motion.div key="s7">
                  <motion.div className="setup-step-body space-y-3">
                    <StepHeader stepIndex={7} />

                    <motion.button whileTap={{ scale: 0.99 }} onClick={() => openExternalUrl('https://github.com/snozxyx/tatakai')} className="w-full flex items-center gap-4 p-4 rounded-2xl bg-card border border-border/50 hover:border-amber-500/40 shadow-sm transition-[color,background-color,border-color,opacity] text-left group">
                      <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 group-hover:bg-amber-500 group-hover:text-amber-950 transition-colors"><Star className="w-4 h-4" /></div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">{uiI18n.t('app.star_on_github_9becc508')}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{uiI18n.t('app.support_the_open_source_development_8bdfafc3')}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-amber-500 transition-colors" />
                    </motion.button>

                    <motion.button whileTap={{ scale: 0.99 }} onClick={() => openExternalUrl('https://discord.gg/Mt2jG5QuGP')} className="w-full flex items-center gap-4 p-4 rounded-2xl bg-card border border-border/50 hover:border-indigo-500/40 shadow-sm transition-[color,background-color,border-color,opacity] text-left group">
                      <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-500 group-hover:text-indigo-50 transition-colors"><MessageCircle className="w-4 h-4" /></div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">{uiI18n.t('app.join_discord_7ec699b1')}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{uiI18n.t('app.get_news_updates_and_community_help_e2cff5e2')}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-indigo-500 transition-colors" />
                    </motion.button>

                    <motion.div className="pt-2">
                      <div className="p-4 rounded-2xl bg-muted/40 border border-border/40">
                        <CustomCheckbox checked={tcAccepted} onChange={setTcAccepted}>
                          <span className="text-sm text-foreground/90">
                            {uiI18n.t('app.i_accept_the_74b561d2')}{' '}
                            <button type="button" onClick={(e) => { e.preventDefault(); openExternalUrl('https://tatakai.app/terms'); }} className="text-primary font-medium hover:underline underline-offset-4">{uiI18n.t('app.terms_a55a275a')}</button>
                            {' '}{uiI18n.t('app.and_cffa50a3')}{' '}
                            <button type="button" onClick={(e) => { e.preventDefault(); openExternalUrl('https://tatakai.app/privacy'); }} className="text-primary font-medium hover:underline underline-offset-4">{uiI18n.t('app.privacy_policy_9db108ba')}</button>.
                          </span>
                        </CustomCheckbox>
                      </div>
                    </motion.div>

                  </motion.div>
                </motion.div>
              )}

              </>)}
            </SetupStepTransition>
          </div>
          <NavButtons
            onBack={step > 1 ? () => goTo(step - 1) : undefined}
            onNext={handleContinue}
            nextLabel={step === totalSteps ? uiI18n.t('app.setup_finish') : undefined}
            nextIcon={step === totalSteps ? ChevronRight : undefined}
            nextDisabled={(step === 3 && !isIos && !countryAck) || (step === totalSteps && !tcAccepted)}
          />
        </div>
      </div>

      {/* RIGHT COLUMN: Cinematic Video Background */}
      <aside className="setup-visual">
        <img src={setupScene} alt="" className="setup-scene" aria-hidden="true" />
        <video ref={setupVideoRef} autoPlay={!shouldReduceMotion} muted loop playsInline poster={setupScene} aria-hidden="true" className="setup-video" data-playing={videoPlaying && !shouldReduceMotion} onPlaying={() => setVideoPlaying(true)} onPause={() => setVideoPlaying(false)} onError={() => setVideoPlaying(false)}>
          <source src={randomVideoSrc} type={randomVideoSrc.endsWith('.webm') ? 'video/webm' : 'video/mp4'} />
        </video>

        <div className="setup-visual-content">
          <h2>
            {uiI18n.t('app.stream_download_and_organize_your_anime_e8d26a7c')}
          </h2>
          <div className="setup-features">
            <span><Play aria-hidden="true" />{uiI18n.t('app.streaming_1e832552')}</span>
            <span><Download aria-hidden="true" />{uiI18n.t('download.download')}</span>
            <span><Folder aria-hidden="true" />{uiI18n.t('app.library_b8100f5b')}</span>
          </div>
        </div>
      </aside>
    </div>
    </MotionConfig>
  );
}
