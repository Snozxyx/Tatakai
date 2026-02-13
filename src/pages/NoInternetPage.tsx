import { motion, AnimatePresence } from 'framer-motion';
import { Wifi, RefreshCw, HardDrive, ArrowRight, ArrowLeft, WifiOff, CloudOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useState, useMemo } from 'react';

interface NoInternetPageProps {
  isNative?: boolean;
}

// Video sources - local videos bundled with the app (in public/videos)
const VIDEO_SOURCES = [
  '/videos/1.mp4',
  '/videos/3.mp4',
  '/videos/2.webm',
  '/videos/5.mp4',
  '/videos/6.mp4',
];

// Text variations for the right side
const TEXT_VARIATIONS = [
  {
    title: "Stay Connected",
    desc: "Your anime journey awaits. Check your connection and dive back into endless stories."
  },
  {
    title: "Offline? No Worries",
    desc: "Download your favorites and watch them anytime, anywhere - even without internet."
  },
  {
    title: "Connection Lost",
    desc: "The anime world is just a reconnection away. Your watchlist is waiting for you."
  },
];

export function NoInternetPage({ isNative = false }: NoInternetPageProps) {
  const navigate = useNavigate();
  const [isRetrying, setIsRetrying] = useState(false);

  // Pick random video and text on mount
  const randomVideoSrc = useMemo(() => {
    return VIDEO_SOURCES[Math.floor(Math.random() * VIDEO_SOURCES.length)];
  }, []);

  const randomText = useMemo(() => {
    return TEXT_VARIATIONS[Math.floor(Math.random() * TEXT_VARIATIONS.length)];
  }, []);

  const handleRetry = async () => {
    setIsRetrying(true);
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-background">
      {/* Left Side - Main Glass Card with opaque background */}
      <div className="w-full lg:w-1/2 min-h-screen bg-background flex flex-col justify-center items-center p-6 lg:p-12 relative">
        {/* Back button */}
        <button 
          onClick={() => navigate('/')} 
          className="absolute top-6 left-6 flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors group"
        >
          <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          <span className="text-sm font-medium">Back to Home</span>
        </button>

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
          </div>

          {/* Icon with animation */}
          <div className="relative w-20 h-20 mb-8 flex items-center justify-center">
            {/* Pulse rings */}
            {[0, 1].map((i) => (
              <motion.div
                key={i}
                className="absolute inset-0 rounded-full border-2 border-destructive/20"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: [0, 0.5, 0], scale: [1, 1.5, 1.8] }}
                transition={{
                  duration: 2.5,
                  repeat: Infinity,
                  delay: i * 0.8,
                  ease: "easeOut",
                }}
              />
            ))}
            
            {/* Icon container */}
            <motion.div 
              className="relative z-10 w-20 h-20 rounded-2xl bg-gradient-to-br from-muted/80 to-muted border border-border shadow-xl flex items-center justify-center"
              animate={{ scale: [1, 1.02, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            >
              <WifiOff className="w-9 h-9 text-destructive" />
            </motion.div>
          </div>

          {/* Text Content */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="mb-10"
          >
            <h2 className="text-2xl lg:text-3xl font-bold text-foreground mb-3">
              No Internet Connection
            </h2>
            <p className="text-muted-foreground text-base leading-relaxed">
              {isNative 
                ? "You're currently offline. Don't worry - your downloaded anime is still available in the offline library."
                : "We couldn't connect to the server. Please check your internet connection and try again."
              }
            </p>
          </motion.div>

          {/* Action Buttons */}
          <motion.div 
            className="flex flex-col gap-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            {/* Primary Button */}
            <Button
              size="lg"
              className="w-full h-12 bg-gradient-to-r from-primary to-secondary hover:opacity-90 font-semibold text-base shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/30"
              onClick={handleRetry}
              disabled={isRetrying}
            >
              <AnimatePresence mode='wait'>
                {isRetrying ? (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="flex items-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Reconnecting...</span>
                  </motion.div>
                ) : (
                  <motion.div
                    key="text"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Try Again</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </Button>

            {/* Offline Library Button (Native only) */}
            {isNative && (
              <Button
                variant="outline"
                size="lg"
                className="w-full h-12 font-medium border-border hover:bg-muted/50 group"
                onClick={() => navigate('/downloads')}
              >
                <HardDrive className="w-4 h-4 mr-2 text-muted-foreground group-hover:text-foreground transition-colors" />
                Go to Offline Library
                <ArrowRight className="w-4 h-4 ml-auto text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
              </Button>
            )}
          </motion.div>

          {/* Status indicator */}
          <motion.div 
            className="mt-10 pt-8 border-t border-border/50 flex items-center justify-center gap-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <div className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
            <span className="text-sm text-muted-foreground">
              Network Unavailable
            </span>
          </motion.div>
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
              <CloudOff className="w-6 h-6 text-white/80" />
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