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
  Download,
  Globe2,
  ShieldCheck,
  Key,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Capacitor } from '@capacitor/core';
import { useCountryPolicy } from '@/core/country-policy/useCountryPolicy';
import { FeatureFlag, setFlag } from '@/core/feature-flags';
import { DebridSettingsPanel } from '@/components/settings/DebridSettingsPanel';

const VIDEO_SOURCES = [
  './videos/1.mp4',
  './videos/2.webm',
  './videos/3.mp4',
  './videos/5.mp4',
  './videos/6.mp4',
];

const STEP_META = [
  {
    icon: Folder,
    color: 'blue',
    title: 'Storage',
    subtitle: 'Where should your anime live?',
  },
  {
    icon: Shield,
    color: 'purple',
    title: 'Privacy',
    subtitle: 'Control your integrations',
  },
  {
    icon: Globe,
    color: 'red',
    title: 'Country Policy',
    subtitle: 'Legal context for torrent use',
  },
  {
    icon: Wifi,
    color: 'cyan',
    title: 'Network',
    subtitle: 'Secure your connection',
  },
  {
    icon: Puzzle,
    color: 'green',
    title: 'Extensions',
    subtitle: 'Power up your experience',
  },
  {
    icon: Key,
    color: 'blue',
    title: 'Debrid Services',
    subtitle: 'Direct high-speed streaming',
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
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.05,
    },
  },
};

const itemVariants = {
  hidden: {
    opacity: 0,
    y: 10,
    filter: 'blur(4px)',
  },
  show: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: {
      duration: 0.35,
    },
  },
};

const slideVariants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 40 : -40,
    opacity: 0,
    scale: 0.985,
    filter: 'blur(12px)',
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
    filter: 'blur(0px)',
  },
  exit: (dir: number) => ({
    x: dir < 0 ? 40 : -40,
    opacity: 0,
    scale: 0.985,
    filter: 'blur(12px)',
  }),
};

function Counter({
  to,
  duration = 1.2,
  suffix = '',
}: {
  to: number;
  duration?: number;
  suffix?: string;
}) {
  const count = useMotionValue(0);
  const rounded = useTransform(
    count,
    (v) => `${Math.round(v).toLocaleString()}${suffix}`
  );

  useEffect(() => {
    const controls = animate(count, to, {
      duration,
      ease: 'easeOut',
    });

    return controls.stop;
  }, [count, duration, to]);

  return <motion.span>{rounded}</motion.span>;
}

const Toggle = ({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) => {
  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      onClick={() => onChange(!value)}
      className={cn(
        'relative overflow-hidden w-12 h-7 rounded-full p-1 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-primary/30',
        value
          ? 'bg-primary shadow-[0_0_18px_hsl(var(--primary)/0.45)]'
          : 'bg-muted'
      )}
    >
      <motion.div
        className="absolute inset-0 bg-white/20"
        animate={{
          opacity: value ? [0, 0.35, 0] : 0,
        }}
        transition={{
          duration: 0.5,
        }}
      />

      <motion.div
        className="w-5 h-5 bg-white rounded-full shadow-lg relative z-10"
        layout
        transition={{
          type: 'spring',
          stiffness: 700,
          damping: 30,
        }}
        animate={{
          x: value ? 20 : 0,
        }}
      />
    </motion.button>
  );
};

function StatPill({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ElementType;
  value: number;
  label: string;
}) {
  return (
    <motion.div
      whileHover={{
        y: -2,
      }}
      initial={{
        opacity: 0,
        scale: 0.9,
      }}
      animate={{
        opacity: 1,
        scale: 1,
      }}
      className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm"
    >
      <Icon className="w-4 h-4 text-white/70" />

      <div>
        <p className="text-white font-bold text-sm leading-none">
          <Counter to={value} />
        </p>

        <p className="text-white/50 text-[10px] leading-none mt-0.5">
          {label}
        </p>
      </div>
    </motion.div>
  );
}

function ProgressBar({
  step,
  total,
}: {
  step: number;
  total: number;
}) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: total }).map((_, i) => {
        const n = i + 1;

        const done = step > n;
        const active = step === n;

        return (
          <div key={n} className="flex items-center gap-2">
            <motion.div
              animate={{
                scale: active ? 1.08 : 1,
                backgroundColor:
                  done || active
                    ? 'hsl(var(--primary))'
                    : 'hsl(var(--muted))',

                boxShadow: active
                  ? '0 0 22px hsl(var(--primary) / 0.45)'
                  : '0 0 0px transparent',
              }}
              transition={{
                type: 'spring',
                stiffness: 350,
                damping: 28,
              }}
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
            >
              {done ? (
                <motion.div
                  initial={{
                    scale: 0,
                  }}
                  animate={{
                    scale: 1,
                  }}
                  transition={{
                    type: 'spring',
                    delay: 0.08,
                  }}
                >
                  <Check className="w-4 h-4 text-primary-foreground" />
                </motion.div>
              ) : (
                <span
                  className={cn(
                    active
                      ? 'text-primary-foreground'
                      : 'text-muted-foreground'
                  )}
                >
                  {n}
                </span>
              )}
            </motion.div>

            {n < total && (
              <div className="relative w-10 h-0.5 rounded-full bg-muted overflow-hidden">
                <motion.div
                  className="absolute inset-y-0 left-0 bg-primary rounded-full"
                  animate={{
                    width: step > n ? '100%' : '0%',
                  }}
                  transition={{
                    type: 'spring',
                    stiffness: 120,
                    damping: 20,
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StepHeader({
  stepIndex,
}: {
  stepIndex: number;
}) {
  const meta = STEP_META[stepIndex - 1];

  if (!meta) return null;

  const Icon = meta.icon;

  return (
    <div className="flex items-center gap-4 mb-6">
      <motion.div
        initial={{
          scale: 0,
          rotate: -20,
        }}
        animate={{
          scale: 1,
          rotate: 0,
        }}
        transition={{
          type: 'spring',
          stiffness: 400,
          damping: 20,
        }}
        className={cn(
          'w-12 h-12 rounded-xl flex items-center justify-center border',
          COLOR_MAP[meta.color]
        )}
      >
        <Icon className="w-5 h-5" />
      </motion.div>

      <div>
        <motion.h3
          initial={{
            opacity: 0,
            x: -10,
          }}
          animate={{
            opacity: 1,
            x: 0,
          }}
          transition={{
            delay: 0.1,
          }}
          className="text-lg font-bold text-foreground"
        >
          {meta.title}
        </motion.h3>

        <motion.p
          initial={{
            opacity: 0,
            x: -10,
          }}
          animate={{
            opacity: 1,
            x: 0,
          }}
          transition={{
            delay: 0.15,
          }}
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
  return (
    <motion.div
      variants={itemVariants}
      whileHover={{
        scale: 1.01,
        y: -2,
      }}
      whileTap={{
        scale: 0.99,
      }}
      className="flex items-center justify-between p-4 rounded-xl bg-muted/30 border border-border hover:border-primary/30 transition-all"
    >
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-muted text-muted-foreground">
          <Icon className="w-4 h-4" />
        </div>

        <div>
          <p className="text-sm font-medium text-foreground">
            {title}
          </p>

          <p className="text-xs text-muted-foreground">
            {desc}
          </p>
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
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextIcon?: React.ElementType;
}) {
  return (
    <div className="flex gap-3 pt-2">
      {onBack && (
        <Button
          variant="outline"
          onClick={onBack}
          className="flex-1 h-12 gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
      )}

      <motion.div
        whileHover={{
          y: -1,
        }}
        whileTap={{
          scale: 0.985,
        }}
        className="flex-[2]"
      >
        <Button
          onClick={onNext}
          className="w-full h-12 bg-gradient-to-r from-primary to-secondary hover:opacity-90 font-semibold shadow-lg shadow-primary/25 gap-2"
        >
          {NextIcon ? (
            <NextIcon className="w-4 h-4" />
          ) : null}

          {nextLabel ?? 'Continue'}

          {!NextIcon && (
            <ChevronRight className="w-4 h-4" />
          )}
        </Button>
      </motion.div>
    </div>
  );
}

export default function SetupPage() {
  const [step, setStep] = useState(1);
  const [dir, setDir] = useState(1);

  const [downloadPath, setDownloadPath] = useState('');
  const [discordEnabled, setDiscordEnabled] = useState(true);
  const [countryAck, setCountryAck] = useState(false);
  const [enableWarp, setEnableWarp] = useState(false);
  const [enableExtensions, setEnableExtensions] = useState(true);

  const navigate = useNavigate();

  const shouldReduceMotion = useReducedMotion();

  const countryPolicy = useCountryPolicy();

  const isMobile =
    Capacitor.isNativePlatform() &&
    !!(window as any).Capacitor;

  const isDesktop = !!(window as any).electron;

  const totalSteps = isDesktop ? 6 : 2;

  const randomVideoSrc = useMemo(
    () =>
      VIDEO_SOURCES[
        Math.floor(Math.random() * VIDEO_SOURCES.length)
      ],
    []
  );

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    const init = async () => {
      if (isDesktop && (window as any).electron) {
        try {
          const path =
            await (window as any).electron.getDownloadsDir();

          setDownloadPath(path);
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
    if (step === totalSteps) {
      handleComplete();
    } else {
      goTo(step + 1);
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleContinue();
      }
    };

    window.addEventListener('keydown', handler);

    return () =>
      window.removeEventListener('keydown', handler);
  }, [step]);

  const handleComplete = async () => {
    localStorage.setItem(
      'tatakai_setup_complete',
      'true'
    );

    if (isDesktop) {
      localStorage.setItem(
        'tatakai_download_path',
        downloadPath
      );

      localStorage.setItem(
        'tatakai_discord_rpc',
        String(discordEnabled)
      );

      localStorage.setItem(
        'tatakai_country_ack',
        String(countryAck)
      );

      localStorage.setItem(
        'tatakai_enable_warp',
        String(enableWarp)
      );

      localStorage.setItem(
        'tatakai_enable_extensions',
        String(enableExtensions)
      );

      try {
        if (
          (window as any).tatakaiRuntime?.toggleWarp
        ) {
          await (window as any).tatakaiRuntime.toggleWarp(
            enableWarp
          );

          await (window as any).tatakaiRuntime.setWarpMode?.(
            'auto'
          );
        }
      } catch {}
    }

    setFlag(
      FeatureFlag.EXTENSION_SCRAPING,
      enableExtensions
    );

    navigate('/');
  };

  return (
    <div className="h-screen overflow-hidden bg-background flex flex-col lg:flex-row relative">

      {/* ambient bg */}
      <motion.div
        animate={
          shouldReduceMotion
            ? {}
            : {
                opacity: [0.35, 0.6, 0.35],
                scale: [1, 1.08, 1],
              }
        }
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute left-[-150px] top-[-120px] w-[520px] h-[520px] rounded-full bg-primary/10 blur-3xl pointer-events-none"
      />

      {/* left */}
      <div className="w-full lg:w-1/2 h-screen flex flex-col justify-center items-center p-6 lg:p-12 relative z-10">
        <motion.div
          initial={{
            opacity: 0,
            y: 24,
          }}
          animate={{
            opacity: 1,
            y: 0,
          }}
          transition={{
            duration: 0.6,
          }}
          className="w-full max-w-md"
        >
          {/* logo */}
          <div className="mb-8">
            <motion.div
              animate={{
                opacity: [0.8, 1, 0.8],
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
              }}
              className="flex items-center gap-3 mb-6"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/30 overflow-hidden">
                <img
                  src="/tatakai-logo-square.png"
                  alt="Tatakai"
                  className="w-full h-full object-cover"
                />
              </div>

              <div>
                <h1 className="font-display text-2xl font-black gradient-text">
                  Tatakai
                </h1>

                <p className="text-xs text-muted-foreground">
                  Desktop Setup
                </p>
              </div>
            </motion.div>

            <h2 className="text-2xl lg:text-3xl font-black text-foreground mb-1">
              {step === 1
                ? 'Welcome!'
                : step === totalSteps
                ? 'Almost done.'
                : `Step ${step} of ${totalSteps}`}
            </h2>

            <p className="text-sm text-muted-foreground">
              {step === 1
                ? 'Set up Tatakai desktop in a few quick steps.'
                : 'You can change these settings any time in preferences.'}
            </p>

            {downloadPath && step > 1 && (
              <motion.div
                initial={{
                  opacity: 0,
                }}
                animate={{
                  opacity: 1,
                }}
                className="text-xs text-muted-foreground mt-3"
              >
                Downloads → {downloadPath}
              </motion.div>
            )}
          </div>

          <ProgressBar
            step={step}
            total={totalSteps}
          />

          <div className="min-h-[360px]">
            <AnimatePresence
              mode="wait"
              custom={dir}
            >

              {/* STEP 1 */}
              {step === 1 && (
                <motion.div
                  key="s1"
                  custom={dir}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{
                    type: 'spring',
                    stiffness: 340,
                    damping: 32,
                  }}
                >
                  <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                    className="space-y-5"
                  >
                    <StepHeader stepIndex={1} />

                    {isMobile ? (
                      <motion.div
                        variants={itemVariants}
                        className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-3"
                      >
                        <Check className="w-5 h-5 text-emerald-400 mt-0.5" />

                        <div>
                          <p className="font-medium text-sm">
                            App Storage
                          </p>

                          <p className="text-xs text-muted-foreground mt-1">
                            Downloads saved in private app
                            storage.
                          </p>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div
                        variants={itemVariants}
                        className="space-y-3"
                      >
                        <label className="text-sm font-medium text-foreground">
                          Download Directory
                        </label>

                        <motion.div
                          whileHover={{
                            y: -1,
                          }}
                          className="flex items-center gap-2 p-2 rounded-xl bg-muted/30 border border-border"
                        >
                          <HardDrive className="w-4 h-4 text-muted-foreground ml-2 flex-shrink-0" />

                          <div className="flex-1 px-2 py-1.5 text-sm font-mono text-muted-foreground truncate">
                            {downloadPath ||
                              'Select a folder…'}
                          </div>

                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={async () => {
                              if (
                                isDesktop &&
                                (window as any).electron
                              ) {
                                const selected =
                                  await (
                                    window as any
                                  ).electron.selectDirectory();

                                if (selected)
                                  setDownloadPath(
                                    selected
                                  );
                              }
                            }}
                          >
                            Browse
                          </Button>
                        </motion.div>

                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <Zap className="w-3 h-3" />
                          ~2–4 GB per anime series in 1080p
                        </p>
                      </motion.div>
                    )}

                    <NavButtons
                      onNext={() =>
                        isMobile
                          ? handleComplete()
                          : goTo(2)
                      }
                      nextLabel={
                        isMobile
                          ? 'Get Started'
                          : 'Continue'
                      }
                      nextIcon={
                        isMobile
                          ? Sparkles
                          : undefined
                      }
                    />
                  </motion.div>
                </motion.div>
              )}

              {/* STEP 2 */}
              {step === 2 && (
                <motion.div
                  key="s2"
                  custom={dir}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{
                    type: 'spring',
                    stiffness: 340,
                    damping: 32,
                  }}
                >
                  <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                    className="space-y-5"
                  >
                    <StepHeader stepIndex={2} />

                    <div className="space-y-3">
                      <ToggleRow
                        icon={Disc}
                        title="Discord Rich Presence"
                        desc="Show what you're watching on Discord"
                        value={discordEnabled}
                        onChange={setDiscordEnabled}
                      />
                    </div>

                    <NavButtons
                      onBack={() => goTo(1)}
                      onNext={() =>
                        isMobile
                          ? handleComplete()
                          : goTo(3)
                      }
                    />
                  </motion.div>
                </motion.div>
              )}

              {/* STEP 3 */}
              {step === 3 && isDesktop && (
                <motion.div
                  key="s3"
                  custom={dir}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{
                    type: 'spring',
                    stiffness: 340,
                    damping: 32,
                  }}
                >
                  <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                    className="space-y-5"
                  >
                    <StepHeader stepIndex={3} />

                    <motion.div
                      variants={itemVariants}
                      className="rounded-xl bg-amber-500/8 border border-amber-500/20 p-4 space-y-3"
                    >
                      <p className="text-sm text-muted-foreground">
                        Tatakai respects local copyright
                        laws.
                      </p>

                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          Country:{' '}
                          <span className="font-semibold text-foreground">
                            {countryPolicy.countryName ||
                              countryPolicy.countryCode}
                          </span>
                        </span>

                        <span
                          className={cn(
                            'px-2 py-1 rounded-full',
                            countryPolicy.badge.tone
                          )}
                        >
                          {countryPolicy.badge.label}
                        </span>
                      </div>

                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={countryAck}
                          onChange={(e) =>
                            setCountryAck(
                              e.target.checked
                            )
                          }
                          className="mt-0.5"
                        />

                        <span className="text-sm text-foreground">
                          I acknowledge my region's
                          policies regarding torrent usage.
                        </span>
                      </label>
                    </motion.div>

                    <NavButtons
                      onBack={() => goTo(2)}
                      onNext={() => goTo(4)}
                    />
                  </motion.div>
                </motion.div>
              )}

              {/* STEP 4 */}
              {step === 4 && isDesktop && (
                <motion.div
                  key="s4"
                  custom={dir}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{
                    type: 'spring',
                    stiffness: 340,
                    damping: 32,
                  }}
                >
                  <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                    className="space-y-5"
                  >
                    <StepHeader stepIndex={4} />

                    <ToggleRow
                      icon={Lock}
                      title="WARP / DoH"
                      desc="Improve privacy with Cloudflare encrypted DNS"
                      value={enableWarp}
                      onChange={setEnableWarp}
                    />

                    <AnimatePresence>
                      {enableWarp && (
                        <motion.div
                          initial={{
                            opacity: 0,
                            height: 0,
                          }}
                          animate={{
                            opacity: 1,
                            height: 'auto',
                          }}
                          exit={{
                            opacity: 0,
                            height: 0,
                          }}
                          className="overflow-hidden"
                        >
                          <div className="p-3 rounded-xl bg-cyan-500/8 border border-cyan-500/20 text-xs text-cyan-300 flex items-start gap-2">
                            <ShieldCheck className="w-3.5 h-3.5 mt-0.5" />
                            WARP auto-routing will be
                            enabled.
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <NavButtons
                      onBack={() => goTo(3)}
                      onNext={() => goTo(5)}
                    />
                  </motion.div>
                </motion.div>
              )}

              {/* STEP 5 */}
              {step === 5 && isDesktop && (
                <motion.div
                  key="s5"
                  custom={dir}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{
                    type: 'spring',
                    stiffness: 340,
                    damping: 32,
                  }}
                >
                  <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                    className="space-y-5"
                  >
                    <StepHeader stepIndex={5} />

                    <ToggleRow
                      icon={Puzzle}
                      title="Enable Extensions"
                      desc="Use curated .kai extensions for more sources"
                      value={enableExtensions}
                      onChange={setEnableExtensions}
                    />

                    <motion.div
                      variants={itemVariants}
                      className="p-3.5 rounded-xl bg-emerald-500/8 border border-emerald-500/20"
                    >
                      <p className="text-xs text-muted-foreground flex items-start gap-2">
                        <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5" />

                        Only signed .kai packages from
                        official Extension Hub.
                      </p>
                    </motion.div>

                    <NavButtons
                      onBack={() => goTo(4)}
                      onNext={() => goTo(6)}
                    />
                  </motion.div>
                </motion.div>
              )}

              {/* STEP 6 */}
              {step === 6 && isDesktop && (
                <motion.div
                  key="s6"
                  custom={dir}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{
                    type: 'spring',
                    stiffness: 340,
                    damping: 32,
                  }}
                >
                  <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                    className="space-y-5 relative"
                  >
                    <motion.div
                      animate={{
                        opacity: [0.3, 0.5, 0.3],
                        scale: [1, 1.04, 1],
                      }}
                      transition={{
                        duration: 6,
                        repeat: Infinity,
                      }}
                      className="absolute inset-0 bg-primary/5 blur-3xl pointer-events-none"
                    />

                    <StepHeader stepIndex={6} />

                    <motion.div
                      variants={itemVariants}
                      className="bg-muted/30 p-4 rounded-xl border border-border"
                    >
                      <DebridSettingsPanel />
                    </motion.div>

                    <NavButtons
                      onBack={() => goTo(5)}
                      onNext={handleComplete}
                      nextLabel="Start Watching"
                      nextIcon={Sparkles}
                    />
                  </motion.div>
                </motion.div>
              )}

            </AnimatePresence>
          </div>

          <div className="mt-8 pt-6 border-t border-border/40">
            <p className="text-xs text-muted-foreground text-center">
              You can change these settings anytime in
              preferences.
            </p>
          </div>
        </motion.div>
      </div>

      {/* right */}
      <div className="hidden lg:block w-1/2 h-screen relative overflow-hidden">

        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover scale-105"
        >
          <source
            src={randomVideoSrc}
            type={
              randomVideoSrc.endsWith('.webm')
                ? 'video/webm'
                : 'video/mp4'
            }
          />
        </video>

        <motion.div
          animate={{
            backgroundPosition: [
              '0% 0%',
              '100% 100%',
            ],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            repeatType: 'reverse',
            ease: 'linear',
          }}
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'radial-gradient(circle at center, rgba(255,255,255,0.15), transparent 60%)',
            backgroundSize: '200% 200%',
          }}
        />

        <div className="absolute inset-0 bg-black/30" />

        <div className="absolute top-8 right-8 flex flex-col gap-2">
          {[
            {
              icon: Download,
              value: 127842,
              label: 'downloads',
            },
            {
              icon: Star,
              value: 4891,
              label: 'extensions',
            },
            {
              icon: Globe2,
              value: 92,
              label: 'countries',
            },
          ].map((s, i) => (
            <motion.div
              key={s.label}
              initial={{
                opacity: 0,
                x: 20,
              }}
              animate={{
                opacity: 1,
                x: 0,
              }}
              transition={{
                delay: 0.3 + i * 0.12,
              }}
            >
              <StatPill {...s} />
            </motion.div>
          ))}
        </div>

      </div>
    </div>
  );
}