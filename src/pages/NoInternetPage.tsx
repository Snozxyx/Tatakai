import { motion, AnimatePresence } from 'framer-motion';
import { Wifi, RefreshCw, HardDrive, ArrowRight, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

interface NoInternetPageProps {
  isNative?: boolean;
}

export function NoInternetPage({ isNative = false }: NoInternetPageProps) {
  const navigate = useNavigate();
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = async () => {
    setIsRetrying(true);
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center overflow-hidden bg-black text-white selection:bg-rose-500/30">
      
      {/* --- Ambient Background Mesh (Dark Mode Optimized) --- */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Deep Blue Glow */}
        <motion.div 
          className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-blue-600/10 blur-[100px]"
          animate={{ opacity: [0.4, 0.6, 0.4], scale: [1, 1.1, 1] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* Subtle Violet Glow */}
        <motion.div 
          className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-violet-600/10 blur-[100px]"
          animate={{ opacity: [0.3, 0.5, 0.3], scale: [1, 1.2, 1] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        />
      </div>

      {/* --- Main Glass Card --- */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.8, type: "spring", bounce: 0.3 }}
        className="relative z-10 w-full max-w-[420px] p-6"
      >
        <div className="relative overflow-hidden rounded-[32px] bg-zinc-900/70 backdrop-blur-xl border border-white/10 shadow-2xl ring-1 ring-white/5">
          
          <div className="flex flex-col items-center text-center p-8 pt-12">
            
            {/* --- Radar / Pulse Animation --- */}
            <div className="relative w-24 h-24 mb-8 flex items-center justify-center">
              {/* Outer Ripples */}
              {[0, 1].map((i) => (
                <motion.div
                  key={i}
                  className="absolute inset-0 rounded-full border border-rose-500/20"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: [0, 0.5, 0], scale: [1, 1.4, 1.6] }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    delay: i * 1,
                    ease: "easeOut",
                  }}
                />
              ))}
              
              {/* Icon Container */}
              <div className="relative z-10 w-16 h-16 rounded-full bg-gradient-to-b from-zinc-800 to-zinc-900 border border-white/10 shadow-[0_8px_16px_rgba(0,0,0,0.5)] flex items-center justify-center group">
                 {/* Inner Glow */}
                <div className="absolute inset-0 rounded-full bg-rose-500/10 blur-md group-hover:bg-rose-500/20 transition-all duration-500" />
                
                <Wifi className="w-7 h-7 text-rose-500 relative z-10" />
                
                {/* Diagonal Slash */}
                <motion.div 
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: 0.5, duration: 0.4, ease: "easeOut" }}
                  className="absolute w-8 h-[2px] bg-rose-500/80 rounded-full rotate-45 origin-center z-20"
                />
              </div>
            </div>

            {/* --- Text Content --- */}
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="space-y-3 mb-10"
            >
              <h1 className="text-2xl font-semibold tracking-tight text-white">
                No Connection
              </h1>
              <p className="text-[15px] text-zinc-400 leading-relaxed max-w-[280px] mx-auto">
                {isNative 
                  ? "Your device is currently offline. You can access downloads in the library."
                  : "Please check your internet connection and try again."
                }
              </p>
            </motion.div>

            {/* --- Action Buttons --- */}
            <motion.div 
              className="flex flex-col w-full gap-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              {/* Primary Button: White on Black (High Contrast) */}
              <Button
                size="lg"
                className="w-full h-12 rounded-xl text-[15px] font-semibold bg-white text-black hover:bg-zinc-200 transition-all active:scale-[0.98] border-0"
                onClick={handleRetry}
                disabled={isRetrying}
              >
                <div className="relative flex items-center justify-center gap-2">
                  <AnimatePresence mode='wait'>
                    {isRetrying ? (
                      <motion.div
                        key="loading"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                      >
                        <RefreshCw className="w-4 h-4 animate-spin text-black" />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="text"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center gap-2"
                      >
                        <span>Try Again</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </Button>

              {/* Secondary Button: Dark Glass */}
              {isNative && (
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full h-12 rounded-xl text-[15px] font-medium bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 text-white transition-all group"
                  onClick={() => navigate('/offline-library')}
                >
                  <HardDrive className="w-4 h-4 mr-2 text-zinc-400 group-hover:text-white transition-colors" />
                  Offline Library
                  <ArrowRight className="w-4 h-4 ml-auto text-zinc-500 group-hover:translate-x-0.5 transition-transform" />
                </Button>
              )}

              {/* Tertiary Link */}
              <button
                className="mt-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                onClick={() => navigate('/')}
              >
                Return to Home
              </button>
            </motion.div>

          </div>
          
          {/* --- Bottom Status Bar (Native) --- */}
          {isNative && (
            <div className="px-6 py-4 bg-black/20 border-t border-white/5 backdrop-blur-md flex items-center justify-center gap-3">
               <div className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
               <span className="text-xs font-medium text-zinc-500 tracking-wide uppercase">
                 Network Unavailable
               </span>
            </div>
          )}
        </div>
      </motion.div>

    </div>
  );
}