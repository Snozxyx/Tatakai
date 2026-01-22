import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Home, Search, ArrowLeft, Ghost, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusVideoBackground } from "@/components/layout/StatusVideoBackground";

const NotFound = () => {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 overflow-hidden relative">
      <StatusVideoBackground overlayColor="from-primary/10 via-background/90 to-background/95" />

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 text-center max-w-lg w-full"
      >
        {/* Animated 404 with Ghost */}
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="relative mb-8"
        >
          {/* Large 404 Text */}
          <div className="relative inline-block">
            <h1 className="text-[120px] md:text-[180px] font-display font-black text-transparent bg-clip-text bg-gradient-to-b from-primary via-primary/60 to-primary/20 leading-none select-none">
              404
            </h1>
            
            {/* Glitch Effect */}
            <motion.div
              className="absolute inset-0 text-[120px] md:text-[180px] font-display font-black text-primary/20 leading-none select-none"
              animate={{ x: [-2, 2, -2], opacity: [0.3, 0.5, 0.3] }}
              transition={{ duration: 0.2, repeat: Infinity, repeatType: "reverse" }}
            >
              404
            </motion.div>

            {/* Floating Ghost */}
            {/* <motion.div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
              animate={{ 
                y: [-10, 10, -10],
                rotate: [0, 5, -5, 0],
              }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            >
              <div className="w-20 h-20 md:w-28 md:h-28 bg-gradient-to-br from-primary/40 to-accent/40 rounded-full flex items-center justify-center backdrop-blur-xl border border-primary/30 shadow-2xl">
                <Ghost className="w-10 h-10 md:w-14 md:h-14 text-primary" />
              </div>
            </motion.div> */}
          </div>
        </motion.div>

        {/* Content Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-card/50 backdrop-blur-xl border border-border/50 rounded-2xl p-8 shadow-2xl"
        >
          <h2 className="font-display text-2xl md:text-3xl font-bold text-foreground mb-4">
            Lost in the Void
          </h2>
          
          <p className="text-muted-foreground text-lg mb-8">
            The page you're looking for has vanished into another dimension. Let's get you back on track!
          </p>

          {/* Action Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="flex flex-col sm:flex-row gap-3 justify-center"
          >
            <Button asChild size="lg" className="gap-2">
              <Link to="/">
                <Home className="w-5 h-5" />
                Back to Home
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="gap-2">
              <Link to="/search">
                <Search className="w-5 h-5" />
                Search Anime
              </Link>
            </Button>
          </motion.div>
        </motion.div>

        {/* Go Back Link */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-8"
        >
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Go back to previous page
          </button>
        </motion.div>

        {/* Floating Compass */}
        {/* <motion.div
          className="absolute bottom-10 right-10 opacity-20"
          animate={{ rotate: 360 }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        >
          <Compass className="w-16 h-16 text-primary" />
        </motion.div> */}
      </motion.div>
    </div>
  );
};

export default NotFound;