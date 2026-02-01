import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Folder, Shield, ChevronRight, Check, Disc, Sparkles } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utility for Tailwind ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Micro Components ---

// iOS-style Toggle Switch
const Toggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
  <button
    onClick={() => onChange(!value)}
    className={cn(
      "w-12 h-7 rounded-full p-1 transition-colors duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary/20",
      value ? "bg-primary" : "bg-zinc-700/50"
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

// Glass Card Container
const GlassCard = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn(
    "relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-900/60 backdrop-blur-2xl shadow-2xl",
    className
  )}>
    {/* Subtle gradient noise/sheen overlay */}
    <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
    <div className="relative z-10">{children}</div>
  </div>
);

// --- Main Page ---

export default function SetupPage() {
  const [step, setStep] = useState(1);
  const [downloadPath, setDownloadPath] = useState('');
  const [discordEnabled, setDiscordEnabled] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const initPath = async () => {
      if ((window as any).electron) {
        const path = await (window as any).electron.getDownloadsDir();
        setDownloadPath(path);
      }
    };
    initPath();
  }, []);

  const handleSelectDir = async () => {
    if ((window as any).electron) {
      const selected = await (window as any).electron.selectDirectory();
      if (selected) setDownloadPath(selected);
    }
  };

  const handleComplete = () => {
    localStorage.setItem('tatakai_setup_complete', 'true');
    localStorage.setItem('tatakai_download_path', downloadPath);
    localStorage.setItem('tatakai_discord_rpc', String(discordEnabled));
    navigate('/');
  };

  // Animation variants for smooth sliding
  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 50 : -50,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction < 0 ? 50 : -50,
      opacity: 0,
    }),
  };

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-6 overflow-hidden relative selection:bg-primary/30">
      
      {/* 1. Ambient Background Effects */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-primary/20 rounded-full blur-[120px] mix-blend-screen" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px] mix-blend-screen" />
      
      {/* Subtle Grain Texture (Optional for high-end feel) */}
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none brightness-100 contrast-150"></div>

      <div className="w-full max-w-lg z-20 space-y-8">
        
        {/* Header */}
        <div className="text-center space-y-3">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }} 
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", duration: 0.8 }}
            className="w-16 h-16 mx-auto bg-gradient-to-br from-zinc-800 to-black border border-white/10 rounded-2xl flex items-center justify-center shadow-lg"
          >
             {/* Replace with your actual logo source */}
             <img src="/tatakai-logo-square.png" alt="Logo" className="w-10 h-10 object-contain drop-shadow-md" />
          </motion.div>
          
          <motion.div
             initial={{ y: 10, opacity: 0 }}
             animate={{ y: 0, opacity: 1 }}
             transition={{ delay: 0.1 }}
          >
            <h1 className="text-4xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white to-white/50">
              Welcome to Tatakai
            </h1>
            <p className="text-zinc-400 mt-2 text-base font-medium">Let's fine-tune your experience.</p>
          </motion.div>
        </div>

        {/* Main Interface */}
        <GlassCard className="p-1">
          <div className="bg-black/20 p-8 rounded-[22px]">
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
                  className="space-y-8"
                >
                  <div className="flex items-center gap-5">
                    <div className="w-14 h-14 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.2)]">
                      <Folder className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-zinc-100">Storage Location</h3>
                      <p className="text-sm text-zinc-500">Where should your anime live?</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-xs uppercase tracking-wider text-zinc-500 font-semibold pl-1">Directory Path</label>
                    <div className="group relative flex items-center gap-2 p-1.5 rounded-xl bg-zinc-900/80 border border-white/5 focus-within:border-primary/50 transition-colors shadow-inner">
                      <div className="flex-1 px-3 py-2 text-sm font-mono text-zinc-300 truncate opacity-80 group-hover:opacity-100 transition-opacity">
                        {downloadPath || '/Users/Guest/Downloads'}
                      </div>
                      <button 
                        onClick={handleSelectDir}
                        className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-white transition-all hover:scale-[1.02] active:scale-95 border border-white/5"
                      >
                        Browse
                      </button>
                    </div>
                    <p className="text-xs text-zinc-600 pl-1">Usually roughly ~2GB per series.</p>
                  </div>

                  <button 
                    onClick={() => setStep(2)} 
                    className="w-full h-12 mt-4 rounded-xl bg-white text-black font-semibold hover:bg-zinc-200 transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.1)]"
                  >
                    Continue <ChevronRight className="w-4 h-4" />
                  </button>
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
                  className="space-y-8"
                >
                  <div className="flex items-center gap-5">
                    <div className="w-14 h-14 rounded-full bg-purple-500/10 flex items-center justify-center border border-purple-500/20 text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.2)]">
                      <Shield className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-zinc-100">Privacy & Integration</h3>
                      <p className="text-sm text-zinc-500">Manage how you appear to others.</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-900/50 border border-white/5 hover:border-white/10 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-zinc-800 text-zinc-400">
                           <Disc className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-zinc-200">Discord Rich Presence</span>
                          <span className="text-xs text-zinc-500">Show what you're watching</span>
                        </div>
                      </div>
                      <Toggle value={discordEnabled} onChange={setDiscordEnabled} />
                    </div>
                  </div>

                  <div className="flex gap-3 mt-4">
                    <button 
                      onClick={() => setStep(1)}
                      className="flex-1 h-12 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 text-zinc-300 font-medium transition-all active:scale-[0.98] border border-white/5"
                    >
                      Back
                    </button>
                    <button 
                      onClick={handleComplete} 
                      className="flex-[2] h-12 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
                    >
                      <Sparkles className="w-4 h-4" />
                      Start Watching
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </GlassCard>

        {/* Step Indicator */}
        <div className="flex justify-center gap-3">
          {[1, 2].map((i) => (
            <motion.div 
              key={i}
              initial={false}
              animate={{ 
                width: step === i ? 24 : 8,
                backgroundColor: step === i ? '#ffffff' : '#3f3f46' // zinc-700
              }}
              className="h-2 rounded-full cursor-pointer"
              onClick={() => setStep(i)}
            />
          ))}
        </div>

      </div>
    </div>
  );
}