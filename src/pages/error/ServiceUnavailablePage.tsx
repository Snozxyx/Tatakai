import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { motion } from "framer-motion";
import { ServerCrash, RefreshCw, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

const ServiceUnavailablePage = () => {
  useUiTranslation();
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 overflow-hidden relative">
      {/* Animated circuit lines background */}
      <div className="absolute inset-0 overflow-hidden opacity-10">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="circuit" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
              <path d="M10 50 H40 V20 H70 V50 H90" fill="none" stroke="currentColor" strokeWidth="1" className="text-primary"/>
              <circle cx="10" cy="50" r="3" fill="currentColor" className="text-primary"/>
              <circle cx="90" cy="50" r="3" fill="currentColor" className="text-primary"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#circuit)"/>
        </svg>
      </div>

      {/* Error glow */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-red-500/5 rounded-full blur-3xl"
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 4, repeat: Infinity }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 text-center max-w-lg"
      >
        {/* Error code and icon */}
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mb-8"
        >
          <div className="relative inline-block">
            <motion.div
              className="w-32 h-32 bg-gradient-to-br from-red-500/20 to-orange-500/20 rounded-2xl flex items-center justify-center mx-auto"
              animate={{ rotateY: [0, 10, -10, 0] }}
              transition={{ duration: 4, repeat: Infinity }}
            >
              <ServerCrash className="w-16 h-16 text-red-500" />
            </motion.div>
            
            {/* Floating error badges */}
            <motion.div
              className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded"
              animate={{ y: [-2, 2, -2] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              503
            </motion.div>
          </div>

          <motion.h1
            className="text-6xl md:text-7xl font-display font-black text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500 mt-6"
            animate={{ opacity: [1, 0.7, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            503
          </motion.h1>
        </motion.div>

        {/* Message */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="space-y-4 mb-8"
        >
          <h2 className="text-2xl md:text-3xl font-bold text-foreground">
            {uiI18n.t('app.service_unavailable_ffbd0b77')}
          </h2>
          <p className="text-muted-foreground text-lg">
            {uiI18n.t('app.our_servers_are_currently_overloaded_or_undergoi_d60e0294')}
          </p>
        </motion.div>

        {/* Status indicators */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="grid grid-cols-3 gap-4 mb-8"
        >
          {[
            { get label() { return uiI18n.t('app.api_d93d10ff'); }, status: 'down' },
            { get label() { return uiI18n.t('app.cdn_67b6c4b8'); }, status: 'degraded' },
            { get label() { return uiI18n.t('app.database_61074f1c'); }, status: 'down' },
          ].map((item, i) => (
            <div key={item.label} className="bg-card/50 backdrop-blur rounded-lg p-3 border border-border/50">
              <motion.div
                className={`w-3 h-3 rounded-full mx-auto mb-2 ${item.status === 'down' ? 'bg-red-500' : 'bg-yellow-500'}`}
                animate={{ opacity: [1, 0.5, 1] }}
                transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
              />
              <p className="text-xs text-muted-foreground">{item.label}</p>
            </div>
          ))}
        </motion.div>

        {/* Action buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="flex flex-col sm:flex-row gap-4 justify-center"
        >
          <Button
            onClick={() => window.location.reload()}
            size="lg"
            className="gap-2"
          >
            <RefreshCw className="w-5 h-5" />
            {uiI18n.t('app.retry_connection_27717695')}
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="gap-2"
            onClick={() => window.open('mailto:support@example.com')}
          >
            <Mail className="w-5 h-5" />
            {uiI18n.t('app.contact_support_fe1a2922')}
          </Button>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default ServiceUnavailablePage;
