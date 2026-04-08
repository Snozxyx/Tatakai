import { motion } from "framer-motion";
import { Wrench, Clock, RefreshCw, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { StatusVideoBackground } from "@/components/layout/StatusVideoBackground";

const MaintenancePage = () => {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 overflow-hidden relative bg-gradient-to-br from-amber-950/20 via-background to-background">
      <StatusVideoBackground overlayColor="from-amber-500/10 via-background/90 to-background" />

      {/* Japanese decorative elements */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Floating kanji characters */}
        <motion.div
          className="absolute top-[10%] left-[5%] text-8xl font-bold text-amber-500/5 select-none"
          animate={{ y: [0, -20, 0], opacity: [0.05, 0.1, 0.05] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        >
          工
        </motion.div>
        <motion.div
          className="absolute top-[20%] right-[10%] text-7xl font-bold text-orange-500/5 select-none"
          animate={{ y: [0, 15, 0], opacity: [0.05, 0.08, 0.05] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        >
          事
        </motion.div>
        <motion.div
          className="absolute bottom-[15%] left-[15%] text-9xl font-bold text-amber-500/5 select-none"
          animate={{ y: [0, -10, 0], opacity: [0.03, 0.07, 0.03] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        >
          中
        </motion.div>

        {/* Decorative lines */}
        <div className="absolute top-0 left-1/4 w-px h-full bg-gradient-to-b from-transparent via-amber-500/10 to-transparent" />
        <div className="absolute top-0 right-1/4 w-px h-full bg-gradient-to-b from-transparent via-orange-500/10 to-transparent" />

        {/* Corner decorations */}
        <div className="absolute top-8 left-8 w-24 h-24 border-l-2 border-t-2 border-amber-500/20 rounded-tl-3xl" />
        <div className="absolute top-8 right-8 w-24 h-24 border-r-2 border-t-2 border-amber-500/20 rounded-tr-3xl" />
        <div className="absolute bottom-8 left-8 w-24 h-24 border-l-2 border-b-2 border-amber-500/20 rounded-bl-3xl" />
        <div className="absolute bottom-8 right-8 w-24 h-24 border-r-2 border-b-2 border-amber-500/20 rounded-br-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 text-center max-w-lg"
      >
        {/* Japanese title with animated icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
          className="mb-8 inline-flex flex-col items-center"
        >
          <div className="relative mb-4">
            <div className="w-32 h-32 bg-gradient-to-br from-amber-500/20 to-orange-500/20 rounded-full flex items-center justify-center backdrop-blur-sm border border-amber-500/20">
              <motion.div
                animate={{ rotate: [0, 15, -15, 0] }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
              >
                <Wrench className="w-16 h-16 text-amber-500" />
              </motion.div>
            </div>
            <motion.div
              className="absolute -top-2 -right-2 w-8 h-8 bg-primary rounded-full flex items-center justify-center"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Clock className="w-4 h-4 text-primary-foreground" />
            </motion.div>
          </div>

          {/* Japanese text */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-4xl font-bold text-amber-500/60 tracking-[0.3em] mb-2"
          >
            工事中
          </motion.p>
          <p className="text-xs text-muted-foreground tracking-[0.2em] uppercase">Kōji-chū</p>
        </motion.div>

        {/* Message */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="space-y-4 mb-8"
        >
          <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground">
            Under Maintenance
          </h1>
          <p className="text-muted-foreground text-lg">
            We're performing scheduled maintenance to improve your experience. We'll be back shortly!
          </p>
        </motion.div>

        {/* Animated progress bar with Japanese flair */}
        <motion.div
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="mb-8"
        >
          <div className="h-2 bg-muted rounded-full overflow-hidden relative">
            <motion.div
              className="h-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-400 rounded-full"
              initial={{ width: "0%" }}
              animate={{ width: ["0%", "70%", "40%", "90%", "60%"] }}
              transition={{ duration: 3, repeat: Infinity, repeatType: "reverse" }}
            />
            {/* Shimmer effect */}
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
              animate={{ x: ["-100%", "100%"] }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            />
          </div>
          <p className="text-sm text-muted-foreground mt-2 flex items-center justify-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            作業中... Working on it...
          </p>
        </motion.div>

        {/* Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="flex flex-col sm:flex-row gap-3 justify-center"
        >
          <Button
            onClick={() => window.location.reload()}
            size="lg"
            className="gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-0"
          >
            <RefreshCw className="w-5 h-5" />
            Try Again
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="gap-2 border-amber-500/30 hover:bg-amber-500/10"
          >
            <Link to="/auth">
              <LogIn className="w-5 h-5" />
              Admin Login
            </Link>
          </Button>
        </motion.div>

        {/* Estimated time */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="mt-8 text-sm text-muted-foreground"
        >
          <span className="text-amber-500/60 mr-2">予定時間:</span>
          Estimated completion: ~30 minutes
        </motion.p>
      </motion.div>
    </div>
  );
};

export default MaintenancePage;
