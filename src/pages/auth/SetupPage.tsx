import { backgroundVideo } from '@/lib/assets';
import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { rankSetupExtensions } from '@/core/extensions/setup-ranking';
import { usePersistentState } from '@/hooks/ui/usePersistentState';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  animate,
  useReducedMotion,
} from 'framer-motion';

import {
  Folder,
  Shield,
  ChevronRight,
  Check,
  Disc,
  Sparkles,
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
    get subtitle() { return uiI18n.t('app.power_up_your_experience_ff033ff4'); },
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
  blue: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
  purple: 'bg-purple-500/10 border-purple-500/20 text-purple-400',
  red: 'bg-red-500/10 border-red-500/20 text-red-400',
  cyan: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400',
  green: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
};

const containerVariants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.05, delayChildren: 0.02 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 15, filter: 'blur(8px)' },
  show: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.4, ease: [0.25, 0.4, 0.25, 1] as const },
  },
};

const slideVariants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 30 : -30,
    opacity: 0,
    scale: 0.96,
    filter: 'blur(8px)',
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
    filter: 'blur(0px)',
  },
  exit: (dir: number) => ({
    x: dir < 0 ? 30 : -30,
    opacity: 0,
    scale: 0.96,
    filter: 'blur(8px)',
  }),
};

// --- Sub-components ---

const CustomCheckbox = ({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) => (
  <div
    className="flex items-start gap-3 cursor-pointer group"
    onClick={() => onChange(!checked)}
  >
    <motion.div
      className={cn(
        'w-5 h-5 rounded-[6px] flex items-center justify-center border transition-colors mt-0.5 flex-shrink-0',
        checked
          ? 'bg-primary border-primary shadow-[0_0_12px_hsl(var(--primary)/0.4)]'
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
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          >
            <Check className="w-3.5 h-3.5 text-primary-foreground stroke-[3]" />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
    <div className="select-none flex-1">{children}</div>
  </div>
);

const Toggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => {
  useUiTranslation();
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={() => onChange(!value)}
      className={cn(
        'relative overflow-hidden w-11 h-6 rounded-full p-1 transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-primary/30',
        value ? 'bg-primary shadow-[0_0_12px_hsl(var(--primary)/0.4)]' : 'bg-muted-foreground/20'
      )}
    >
      <motion.div
        className="w-4 h-4 bg-white rounded-full shadow-sm relative z-10"
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        animate={{ x: value ? 20 : 0 }}
      />
    </motion.button>
  );
};

function ProgressBar({ step, total }: { step: number; total: number }) {
  useUiTranslation();
  return (
    <div className="flex items-center gap-1.5 mb-8">
      {Array.from({ length: total }).map((_, i) => {
        const n = i + 1;
        const done = step > n;
        const active = step === n;

        return (
          <div key={n} className="flex items-center gap-1.5 flex-1 max-w-[40px]">
            <motion.div
              animate={{
                backgroundColor: done || active ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
                scale: active ? 1.1 : 1,
              }}
              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold z-10 relative"
            >
              {active && (
                <motion.div
                  className="absolute inset-0 rounded-full bg-primary"
                  layoutId="activeStepGlow"
                  style={{ filter: 'blur(8px)', opacity: 0.5 }}
                />
              )}
              {done ? (
                <Check className="w-3 h-3 text-primary-foreground relative z-10" />
              ) : (
                <span className={cn('relative z-10', active ? 'text-primary-foreground' : 'text-muted-foreground')}>
                  {n}
                </span>
              )}
            </motion.div>

            {n < total && (
              <div className="relative flex-1 h-[2px] rounded-full bg-muted/50 overflow-hidden">
                <motion.div
                  className="absolute inset-y-0 left-0 bg-primary"
                  animate={{ width: step > n ? '100%' : '0%' }}
                  transition={{ ease: 'easeInOut', duration: 0.3 }}
                />
              </div>
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
    <div className="flex items-center gap-4 mb-6">
      <motion.div
        initial={{ scale: 0.8, opacity: 0, rotate: -10 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        className={cn('w-12 h-12 rounded-2xl flex items-center justify-center border shadow-sm', COLOR_MAP[meta.color])}
      >
        <Icon className="w-5 h-5" />
      </motion.div>
      <div>
        <motion.h3
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-xl font-bold text-foreground tracking-tight"
        >
          {meta.title}
        </motion.h3>
        <motion.p
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.05 }}
          className="text-sm text-muted-foreground"
        >
          {meta.subtitle}
        </motion.p>
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
      variants={itemVariants}
      whileHover={{ y: -1 }}
      className="flex items-center justify-between p-4 rounded-2xl bg-card border border-border/50 hover:border-primary/30 shadow-sm transition-all"
    >
      <div className="flex items-center gap-4">
        <div className="p-2.5 rounded-xl bg-muted text-muted-foreground">
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
        </div>
      </div>
      <Toggle value={value} onChange={onChange} />
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
    <div className="flex gap-3 pt-4">
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

      <motion.div className="flex-[2]" whileHover={!nextDisabled ? { scale: 1.01 } : {}} whileTap={!nextDisabled ? { scale: 0.98 } : {}}>
        <Button
          onClick={onNext}
          disabled={nextDisabled}
          className="w-full h-12 rounded-xl bg-gradient-to-r from-primary to-primary/80 hover:to-primary text-primary-foreground font-semibold shadow-[0_4px_14px_0_hsl(var(--primary)/30%)] border-t border-white/10 gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
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
    <motion.div variants={itemVariants} className="space-y-3 pt-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
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
        <div className="space-y-2 max-h-[220px] overflow-y-auto pr-2 custom-scrollbar">
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
                  <p className="text-sm font-semibold text-foreground truncate">{ext.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{ext.author}</p>
                </div>
                {ext.isFeatured && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-medium flex-shrink-0">
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
  const [dir, setDir] = useState(1);

  // States
  const [downloadPath, setDownloadPath] = usePersistentState('tatakai_setup_draft:downloadPath', '', 'local');
  const [discordEnabled, setDiscordEnabled] = usePersistentState('tatakai_setup_draft:discordEnabled', true, 'local');
  const [countryAck, setCountryAck] = usePersistentState('tatakai_setup_draft:countryAck', false, 'local');
  const [enableWarp, setEnableWarp] = usePersistentState('tatakai_setup_draft:enableWarp', false, 'local');
  const [enableExtensions, setEnableExtensions] = usePersistentState('tatakai_setup_draft:enableExtensions', true, 'local');
  const [tcAccepted, setTcAccepted] = usePersistentState('tatakai_setup_draft:tcAccepted', false, 'local');

  const tcAcceptedRef = useRef(false);
  tcAcceptedRef.current = tcAccepted;

  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();
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
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
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
    setDir(next > step ? 1 : -1);
    setStep(next);
  };

  const handleContinue = () => {
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
    <div className="min-h-[100dvh] overflow-x-hidden bg-background flex flex-col lg:h-screen lg:flex-row lg:overflow-hidden relative selection:bg-primary/30">
      
      {/* Subtle background noise texture */}
      <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />

      {/* Ambient glowing blobs */}
      <motion.div
        animate={shouldReduceMotion ? {} : { opacity: [0.15, 0.25, 0.15], scale: [1, 1.05, 1] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute -left-[10%] -top-[10%] w-[40vw] h-[40vw] rounded-full bg-primary/20 blur-[100px] pointer-events-none z-0"
      />

      {/* LEFT COLUMN: Setup Interface */}
      <div className="w-full lg:w-[45%] xl:w-[40%] h-[100dvh] flex flex-col justify-start lg:justify-center items-center overflow-y-auto p-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] lg:h-screen lg:p-12 relative z-20 bg-background/80 backdrop-blur-3xl lg:border-r border-border/30 shadow-2xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-[420px]">
          
          {/* Logo & Header */}
          <div className="mb-6 sm:mb-8">
            <div className="flex items-center gap-4 mb-8">
              <motion.div
                whileHover={{ scale: 1.05, rotate: 2 }}
                className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-[0_8px_16px_hsl(var(--primary)/0.25)] border-t border-white/20 overflow-hidden"
              >
                <img src={`${import.meta.env.BASE_URL}assets/logo/tatakai-logo-square.png`} alt={uiI18n.t('app.tatakai_28bda6bd')} className="w-full h-full object-cover" />
              </motion.div>
              <div>
                <h1 className="font-display text-2xl font-black tracking-tight text-foreground">{uiI18n.t('app.tatakai_28bda6bd')}</h1>
                <p className="text-sm text-muted-foreground font-medium">{uiI18n.t('app.setup_wizard_2d4c9fdb')}</p>
              </div>
            </div>

            <h2 className="text-3xl font-black text-foreground mb-2 tracking-tight">
              {step === 1 ? uiI18n.t('app.welcome_e52e5e6c') : step === totalSteps ? uiI18n.t('app.almost_ready_9ba8fa05') : uiI18n.t('app.step_i18n_value_0_of_i18n_value_1_c658e52f', { value0: step, value1: totalSteps })}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {step === 1 ? uiI18n.t('app.let_s_configure_tatakai_for_the_best_experience__73cec18a') : uiI18n.t('app.you_can_adjust_these_settings_later_in_preferenc_ca99e89f')}
            </p>
          </div>

          <ProgressBar step={step} total={totalSteps} />

          {/* Dynamic Content Area */}
          <div className="min-h-[360px] sm:min-h-[400px]">
            <AnimatePresence mode="wait" custom={dir}>
              
              {/* STEP 1: Storage */}
              {step === 1 && (
                <motion.div key="s1" custom={dir} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ type: 'spring', stiffness: 350, damping: 30 }}>
                  <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-5">
                    <StepHeader stepIndex={1} />

                    {isMobile ? (
                      <motion.div variants={itemVariants} className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-4">
                        <div className="p-2 bg-emerald-500/20 rounded-xl"><Check className="w-4 h-4 text-emerald-500" /></div>
                        <div>
                          <p className="font-semibold text-sm text-emerald-50">{uiI18n.t('app.app_storage_c4e44a5b')}</p>
                          <p className="text-xs text-emerald-200/70 mt-1 leading-relaxed">{uiI18n.t('app.downloads_are_safely_managed_inside_internal_app_5eccd7b7')}</p>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div variants={itemVariants} className="space-y-3">
                        <label className="text-sm font-semibold text-foreground ml-1">{uiI18n.t('app.download_directory_d625f3b5')}</label>
                        <motion.div whileHover={{ scale: 1.01 }} className="flex items-center gap-2 p-1.5 rounded-2xl bg-card border border-border/60 shadow-sm transition-all focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20">
                          <div className="p-2 bg-muted rounded-xl ml-1">
                            <HardDrive className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <div className="flex-1 px-2 text-sm font-mono text-foreground truncate select-none">
                            {downloadPath || uiI18n.t('app.select_a_folder_d0ab0158')}
                          </div>
                          <Button
                            variant="secondary"
                            className="rounded-xl h-9 px-4 font-semibold hover:bg-primary hover:text-primary-foreground transition-colors"
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

                    <NavButtons onNext={() => goTo(2)} nextLabel="Continue" />
                  </motion.div>
                </motion.div>
              )}

              {/* STEP 2: Privacy */}
              {step === 2 && (
                <motion.div key="s2" custom={dir} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ type: 'spring', stiffness: 350, damping: 30 }}>
                  <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-4">
                    <StepHeader stepIndex={2} />
                    {isMobile ? (
                      <motion.div variants={itemVariants} className="p-4 rounded-2xl bg-card border border-border/50 flex items-start gap-4">
                        <div className="p-2 bg-primary/10 rounded-xl"><ShieldCheck className="w-4 h-4 text-primary" /></div>
                        <div>
                          <p className="font-semibold text-sm text-foreground">{uiI18n.t('app.mobile_privacy_4feafb46')}</p>
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                            {uiI18n.t('app.tatakai_only_requests_device_permissions_when_a__55525b1a')}
                          </p>
                        </div>
                      </motion.div>
                    ) : (
                      <ToggleRow icon={Disc} title={uiI18n.t('app.discord_rich_presence_1ce59a08')} desc="Display the anime you're watching on your Discord profile" value={discordEnabled} onChange={setDiscordEnabled} />
                    )}
                    <NavButtons onBack={() => goTo(1)} onNext={() => goTo(3)} />
                  </motion.div>
                </motion.div>
              )}

              {/* STEP 3: Country Policy */}
              {step === 3 && (
                <motion.div key="s3" custom={dir} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ type: 'spring', stiffness: 350, damping: 30 }}>
                  <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-5">
                    <StepHeader stepIndex={3} />
                    {isIos ? (
                      <motion.div variants={itemVariants} className="rounded-2xl bg-card border border-border/50 p-5 space-y-3 shadow-inner">
                        <div className="flex items-center gap-3">
                          <Globe className="w-5 h-5 text-primary" />
                          <p className="text-sm font-medium text-foreground">{uiI18n.t('app.regional_streaming_settings_8a2eafba')}</p>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {uiI18n.t('app.region_25cdc1ce')} <span className="font-semibold text-foreground">{countryPolicy.countryName || countryPolicy.countryCode}</span>{uiI18n.t('app.tatakai_will_use_sources_available_for_this_regi_b8193616')}
                        </p>
                      </motion.div>
                    ) : (
                    <motion.div variants={itemVariants} className="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-5 space-y-4 shadow-inner">
                      <div className="flex items-center gap-3">
                        <Globe className="w-5 h-5 text-amber-500" />
                        <p className="text-sm font-medium text-amber-50">{uiI18n.t('app.local_copyright_notice_370c3938')}</p>
                      </div>
                      
                      <div className="flex items-center justify-between bg-black/20 p-3 rounded-xl border border-white/5">
                        <span className="text-xs text-muted-foreground">
                          {uiI18n.t('app.region_25cdc1ce')} <span className="font-bold text-foreground ml-1">{countryPolicy.countryName || countryPolicy.countryCode}</span>
                        </span>
                        <span className={cn('text-[10px] px-2 py-1 rounded-md font-semibold uppercase tracking-wider', countryPolicy.badge.tone)}>
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
                    <NavButtons onBack={() => goTo(2)} onNext={() => goTo(4)} nextDisabled={!isIos && !countryAck} />
                  </motion.div>
                </motion.div>
              )}

              {/* STEP 4: Network */}
              {step === 4 && (
                <motion.div key="s4" custom={dir} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ type: 'spring', stiffness: 350, damping: 30 }}>
                  <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-4">
                    <StepHeader stepIndex={4} />
                    <ToggleRow icon={Lock} title={uiI18n.t('app.warp_dns_over_https_34b5ea5c')} desc="Enhance privacy and bypass ISP blocks with Cloudflare" value={enableWarp} onChange={setEnableWarp} />
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
                    <NavButtons onBack={() => goTo(3)} onNext={() => goTo(5)} />
                  </motion.div>
                </motion.div>
              )}

              {/* STEP 5: Extensions */}
              {step === 5 && (
                <motion.div key="s5" custom={dir} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ type: 'spring', stiffness: 350, damping: 30 }}>
                  <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-4">
                    <StepHeader stepIndex={5} />
                    <ToggleRow icon={Puzzle} title={uiI18n.t('app.enable_extensions_94bbffe3')} desc="Unlock more sources using curated community add-ons" value={enableExtensions} onChange={setEnableExtensions} />
                    <AnimatePresence>
                      {enableExtensions && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                          <SetupExtensionsList />
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <NavButtons onBack={() => goTo(4)} onNext={() => goTo(6)} />
                  </motion.div>
                </motion.div>
              )}

              {/* STEP 6: Debrid Services */}
              {step === 6 && (
                <motion.div key="s6" custom={dir} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ type: 'spring', stiffness: 350, damping: 30 }}>
                  <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-4">
                    <StepHeader stepIndex={6} />
                    <motion.div variants={itemVariants} className="bg-card p-4 rounded-2xl border border-border/50 shadow-sm">
                      <DebridSettingsPanel />
                    </motion.div>
                    <NavButtons onBack={() => goTo(5)} onNext={() => goTo(7)} />
                  </motion.div>
                </motion.div>
              )}

              {/* STEP 7: Support & Terms */}
              {step === 7 && (
                <motion.div key="s7" custom={dir} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ type: 'spring', stiffness: 350, damping: 30 }}>
                  <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-3">
                    <StepHeader stepIndex={7} />

                    <motion.button variants={itemVariants} whileHover={{ y: -2, scale: 1.01 }} whileTap={{ scale: 0.99 }} onClick={() => openExternalUrl('https://github.com/snozxyx/tatakai')} className="w-full flex items-center gap-4 p-4 rounded-2xl bg-card border border-border/50 hover:border-amber-500/40 shadow-sm transition-all text-left group">
                      <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 group-hover:bg-amber-500 group-hover:text-amber-950 transition-colors"><Star className="w-4 h-4" /></div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-foreground">{uiI18n.t('app.star_on_github_9becc508')}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{uiI18n.t('app.support_the_open_source_development_8bdfafc3')}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-amber-500 transition-colors" />
                    </motion.button>

                    <motion.button variants={itemVariants} whileHover={{ y: -2, scale: 1.01 }} whileTap={{ scale: 0.99 }} onClick={() => openExternalUrl('https://discord.gg/Mt2jG5QuGP')} className="w-full flex items-center gap-4 p-4 rounded-2xl bg-card border border-border/50 hover:border-indigo-500/40 shadow-sm transition-all text-left group">
                      <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-500 group-hover:text-indigo-50 transition-colors"><MessageCircle className="w-4 h-4" /></div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-foreground">{uiI18n.t('app.join_discord_7ec699b1')}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{uiI18n.t('app.get_news_updates_and_community_help_e2cff5e2')}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-indigo-500 transition-colors" />
                    </motion.button>

                    <motion.div variants={itemVariants} className="pt-2">
                      <div className="p-4 rounded-2xl bg-muted/40 border border-border/40">
                        <CustomCheckbox checked={tcAccepted} onChange={setTcAccepted}>
                          <span className="text-sm text-foreground/90">
                            {uiI18n.t('app.i_accept_the_74b561d2')}{' '}
                            <button type="button" onClick={(e) => { e.preventDefault(); openExternalUrl('https://tatakai.me/terms'); }} className="text-primary font-medium hover:underline underline-offset-4">{uiI18n.t('app.terms_a55a275a')}</button>
                            {' '}{uiI18n.t('app.and_cffa50a3')}{' '}
                            <button type="button" onClick={(e) => { e.preventDefault(); openExternalUrl('https://tatakai.me/privacy'); }} className="text-primary font-medium hover:underline underline-offset-4">{uiI18n.t('app.privacy_policy_9db108ba')}</button>.
                          </span>
                        </CustomCheckbox>
                      </div>
                    </motion.div>

                    <NavButtons onBack={() => goTo(6)} onNext={handleComplete} nextLabel="Start Watching" nextIcon={Sparkles} nextDisabled={!tcAccepted} />
                  </motion.div>
                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      {/* RIGHT COLUMN: Cinematic Video Background */}
      <div className="hidden lg:block w-[55%] xl:w-[60%] h-screen relative overflow-hidden bg-black z-10">
        
        {/* Gradient fade to blend left and right panels */}
        <div className="absolute inset-y-0 left-0 w-48 bg-gradient-to-r from-background to-transparent z-20 pointer-events-none" />
        
        {/* Vignette effect for text readability and cinematic feel */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.8)_100%)] z-10 pointer-events-none" />

        <video autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-cover opacity-70 scale-105">
          <source src={randomVideoSrc} type={randomVideoSrc.endsWith('.webm') ? 'video/webm' : 'video/mp4'} />
        </video>

        <div className="absolute bottom-12 left-12 right-12 z-20 flex flex-col gap-2">
        
          <motion.h2 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 0.8 }} className="text-3xl lg:text-5xl font-black text-white max-w-xl leading-[1.1] tracking-tight">
            {uiI18n.t('app.stream_download_and_organize_your_anime_e8d26a7c')}
          </motion.h2>
        </div>
      </div>
    </div>
  );
}
