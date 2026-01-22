import { useState } from 'react';
import { X, Download, Smartphone, Monitor, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

export function AppDownloadBanner() {
  const [isVisible, setIsVisible] = useState(() => {
    // Check if user has dismissed the banner before
    const dismissed = localStorage.getItem('app-download-banner-dismissed');
    return !dismissed;
  });
  const navigate = useNavigate();

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem('app-download-banner-dismissed', 'true');
  };

  const handleLearnMore = () => {
    navigate('/download');
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ duration: 0.3, type: "spring", stiffness: 200, damping: 20 }}
          className="relative mb-8 overflow-hidden rounded-2xl group"
        >
          {/* Animated Gradient Background */}
          <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-secondary/20 to-primary/20 animate-gradient bg-[length:200%_auto]" />
          <div className="absolute inset-0 backdrop-blur-xl bg-card/90" />
          
          {/* Floating Decorative Elements */}
          <motion.div
            animate={{ 
              scale: [1, 1.2, 1],
              opacity: [0.3, 0.6, 0.3],
            }}
            transition={{ duration: 3, repeat: Infinity }}
            className="absolute top-0 right-20 w-32 h-32 bg-primary/20 rounded-full blur-3xl"
          />
          <motion.div
            animate={{ 
              scale: [1, 1.3, 1],
              opacity: [0.3, 0.5, 0.3],
            }}
            transition={{ duration: 4, repeat: Infinity, delay: 1 }}
            className="absolute bottom-0 left-20 w-40 h-40 bg-secondary/20 rounded-full blur-3xl"
          />
          
          {/* Content */}
          <div className="relative px-6 py-5 md:py-6">
            <div className="flex items-center justify-between gap-4">
              {/* Left Side - Icons and Text */}
              <div className="flex items-center gap-4 flex-1 min-w-0">
                {/* App Icons with Animation */}
                <div className="hidden sm:flex items-center gap-3">
                  <motion.div
                    animate={{ 
                      y: [0, -5, 0],
                      rotate: [0, 5, 0]
                    }}
                    transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                    className="relative"
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl blur-lg opacity-50" />
                    <div className="relative p-2.5 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl shadow-lg">
                      <Smartphone className="w-5 h-5 text-white" />
                    </div>
                  </motion.div>
                  
                  <motion.div
                    animate={{ 
                      y: [0, -5, 0],
                      rotate: [0, -5, 0]
                    }}
                    transition={{ duration: 2, repeat: Infinity, repeatDelay: 3, delay: 0.5 }}
                    className="relative"
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl blur-lg opacity-50" />
                    <div className="relative p-2.5 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl shadow-lg">
                      <Monitor className="w-5 h-5 text-white" />
                    </div>
                  </motion.div>
                </div>

                {/* Text Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Download className="w-4 h-4 text-primary sm:hidden" />
                    <h3 className="font-semibold text-base md:text-lg flex items-center gap-2">
                      <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                        Download Tatakai Apps
                      </span>
                    </h3>
                    <motion.div
                      animate={{ scale: [1, 1.1, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30"
                    >
                      <span className="text-amber-400 text-xs font-bold flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        NEW
                      </span>
                    </motion.div>
                  </div>
                  <p className="text-xs md:text-sm text-muted-foreground">
                    Native apps for Android & Windows — <span className="font-medium text-foreground">Coming Soon</span>
                  </p>
                </div>
              </div>

              {/* Right Side - Buttons */}
              <div className="flex items-center gap-2 shrink-0">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleLearnMore}
                  className="relative px-4 md:px-5 py-2.5 rounded-xl overflow-hidden group/btn font-medium text-sm whitespace-nowrap"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-primary to-secondary group-hover/btn:scale-105 transition-transform" />
                  <span className="relative z-10 text-white flex items-center gap-2">
                    Learn More
                    <Download className="w-4 h-4 group-hover/btn:translate-y-0.5 transition-transform" />
                  </span>
                </motion.button>
                
                <motion.button
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={handleDismiss}
                  className="p-2 rounded-xl hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                  aria-label="Dismiss banner"
                >
                  <X className="w-4 h-4" />
                </motion.button>
              </div>
            </div>
          </div>

          {/* Bottom Accent Line */}
          <motion.div
            animate={{ 
              x: ['-100%', '100%'],
            }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            className="absolute bottom-0 left-0 w-1/3 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
