import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Folder, Shield, ChevronRight, Check, Disc, Sparkles, ArrowLeft, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

// Video sources - local videos bundled with the app (in public/videos)
const VIDEO_SOURCES = [
  '/videos/1.mp4',
  '/videos/2.webm',
  '/videos/3.mp4',
  '/videos/5.mp4',
  '/videos/6.mp4',
];

// Text variations for the right side
const TEXT_VARIATIONS = [
  {
    title: "Your Anime Hub",
    desc: "Download, organize, and watch your favorite anime series - all in one beautiful app."
  },
  {
    title: "Watch Anywhere",
    desc: "Download episodes for offline viewing and never miss a moment of your favorite shows."
  },
  {
    title: "Your Collection",
    desc: "Build your personal anime library with easy downloads and seamless organization."
  },
];

// --- Micro Components ---

// iOS-style Toggle Switch
const Toggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
  <button
    onClick={() => onChange(!value)}
    className={cn(
      "w-12 h-7 rounded-full p-1 transition-colors duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary/20",
      value ? "bg-primary" : "bg-muted"
    )}
  >
    <motion.div
      className="w-5 h-5 bg-white rounded-full shadow-md"
      layout
      transition={{ type: "spring", stiffness: 700, damping: 30 }}
      animate={{ x: value ? 20 : 0 }}
    />
  </button>
);

// --- Main Page ---

export default function SetupPage() {
  const [step, setStep] = useState(1);
  const [downloadPath, setDownloadPath] = useState('');
  const [discordEnabled, setDiscordEnabled] = useState(true);
  const navigate = useNavigate();
  
  // Check if we're on mobile (Capacitor)
  const isMobile = Capacitor.isNativePlatform() && !!(window as any).Capacitor;
  const isDesktop = !!(window as any).electron;

  // Pick random video and text on mount
  const randomVideoSrc = useMemo(() => {
    return VIDEO_SOURCES[Math.floor(Math.random() * VIDEO_SOURCES.length)];
  }, []);

  const randomText = useMemo(() => {
    return TEXT_VARIATIONS[Math.floor(Math.random() * TEXT_VARIATIONS.length)];
  }, []);

  useEffect(() => {
    const initPath = async () => {
      if (isDesktop && (window as any).electron) {
        const path = await (window as any).electron.getDownloadsDir();
        setDownloadPath(path);
      } else if (isMobile) {
        // On Android, use the app's data directory
        setDownloadPath('App Data Directory (Internal)');
      }
    };
    initPath();
  }, [isDesktop, isMobile]);

  const handleSelectDir = async () => {
    if (isDesktop && (window as any).electron) {
      const selected = await (window as any).electron.selectDirectory();
      if (selected) setDownloadPath(selected);
    }
    // On mobile, we don't allow directory selection - files go to app directory
  };

  const handleComplete = () => {
    localStorage.setItem('tatakai_setup_complete', 'true');
    if (isDesktop) {
      localStorage.setItem('tatakai_download_path', downloadPath);
      localStorage.setItem('tatakai_discord_rpc', String(discordEnabled));
    }
    navigate('/');
  };

  // Animation variants for smooth sliding
  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 30 : -30,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction < 0 ? 30 : -30,
      opacity: 0,
    }),
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-background">
      {/* Left Side - Setup Form with opaque background */}
      <div className="w-full lg:w-1/2 min-h-screen bg-background flex flex-col justify-center items-center p-6 lg:p-12 relative">
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="w-full max-w-md"
        >
          {/* Logo/Brand */}
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg overflow-hidden">
                <img src="/tatakai-logo-square.png" alt="Tatakai logo" className="w-full h-full object-cover" />
              </div>
              <h1 className="font-display text-3xl font-bold gradient-text">Tatakai</h1>
            </div>

            <h2 className="text-2xl lg:text-3xl font-bold text-foreground mb-2">
              Welcome to Tatakai
            </h2>
            <p className="text-muted-foreground">
              Let's set up your anime experience in just a few steps.
            </p>
          </div>

          {/* Step Indicator */}
          <div className="flex items-center gap-3 mb-8">
            {[1, 2].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <motion.div 
                  initial={false}
                  animate={{ 
                    scale: step === i ? 1 : 0.9,
                    backgroundColor: step >= i ? 'hsl(var(--primary))' : 'hsl(var(--muted))'
                  }}
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors",
                    step >= i ? "text-primary-foreground" : "text-muted-foreground"
                  )}
                >
                  {step > i ? <Check className="w-4 h-4" /> : i}
                </motion.div>
                {i < 2 && (
                  <div className={cn(
                    "w-12 h-0.5 rounded-full transition-colors",
                    step > i ? "bg-primary" : "bg-muted"
                  )} />
                )}
              </div>
            ))}
          </div>

          {/* Setup Steps */}
          <div className="min-h-[300px]">
            <AnimatePresence mode="wait" custom={step}>
              {step === 1 && (
                <motion.div
                  key="step1"
                  custom={1}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="space-y-6"
                >
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center border",
                      isMobile ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-blue-500/10 border-blue-500/20 text-blue-400"
                    )}>
                      {isMobile ? <Smartphone className="w-5 h-5" /> : <Folder className="w-5 h-5" />}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">Storage Location</h3>
                      <p className="text-sm text-muted-foreground">
                        {isMobile ? "Your downloads will be saved securely" : "Where should your anime be saved?"}
                      </p>
                    </div>
                  </div>

                  {isMobile ? (
                    // Mobile: Show info about app storage
                    <div className="space-y-3">
                      <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                        <div className="flex items-center gap-3 mb-2">
                          <Check className="w-5 h-5 text-emerald-400" />
                          <span className="font-medium text-foreground">App Storage</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Downloads will be saved in the app's private storage. This keeps your files organized and secure.
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Tip: Files are accessible only through this app for security.
                      </p>
                    </div>
                  ) : (
                    // Desktop: Show directory picker
                    <div className="space-y-3">
                      <label className="text-sm font-medium text-foreground">Download Directory</label>
                      <div className="flex items-center gap-2 p-2 rounded-xl bg-muted/30 border border-border">
                        <div className="flex-1 px-3 py-2 text-sm font-mono text-muted-foreground truncate">
                          {downloadPath || 'Select a folder...'}
                        </div>
                        <Button 
                          variant="secondary"
                          size="sm"
                          onClick={handleSelectDir}
                        >
                          Browse
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">Usually ~2GB per anime series.</p>
                    </div>
                  )}

                  <Button 
                    onClick={() => isMobile ? handleComplete() : setStep(2)} 
                    className="w-full h-12 bg-gradient-to-r from-primary to-secondary hover:opacity-90 font-semibold shadow-lg shadow-primary/25"
                  >
                    {isMobile ? 'Get Started' : 'Continue'} <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div
                  key="step2"
                  custom={2}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="space-y-6"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20 text-purple-400">
                      <Shield className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">Privacy & Integration</h3>
                      <p className="text-sm text-muted-foreground">Customize your experience</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30 border border-border hover:border-primary/30 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-muted text-muted-foreground">
                           <Disc className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-foreground">Discord Rich Presence</span>
                          <span className="text-xs text-muted-foreground">Show what you're watching</span>
                        </div>
                      </div>
                      <Toggle value={discordEnabled} onChange={setDiscordEnabled} />
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Button 
                      variant="outline"
                      onClick={() => setStep(1)}
                      className="flex-1 h-12"
                    >
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      Back
                    </Button>
                    <Button 
                      onClick={handleComplete} 
                      className="flex-[2] h-12 bg-gradient-to-r from-primary to-secondary hover:opacity-90 font-semibold shadow-lg shadow-primary/25"
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      Start Watching
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer info */}
          <div className="mt-8 pt-6 border-t border-border/50">
            <p className="text-xs text-muted-foreground text-center">
              You can change these settings anytime in the app preferences.
            </p>
          </div>
        </motion.div>
      </div>

      {/* Right Side - Video with overlay */}
      <div className="hidden lg:block w-1/2 h-screen relative overflow-hidden">
        {/* Video Background */}
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        >
          <source src={randomVideoSrc} type={randomVideoSrc.endsWith('.webm') ? 'video/webm' : 'video/mp4'} />
        </video>
        
        {/* Dark Overlay (20%) */}
        <div className="absolute inset-0 bg-black/20" />
        
        {/* Content over video */}
        <div className="absolute inset-0 flex flex-col justify-end p-12">
          <motion.div 
            className="max-w-md"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.6 }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-6 h-6 text-white/80" />
            </div>
            <h3 className="text-3xl font-bold text-white mb-4 drop-shadow-lg">
              {randomText.title}
            </h3>
            <p className="text-white/80 text-lg drop-shadow-md leading-relaxed">
              {randomText.desc}
            </p>
          </motion.div>
        </div>

        {/* Gradient fade at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-black/50 to-transparent" />
      </div>
    </div>
  );
}