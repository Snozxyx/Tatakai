import { motion } from 'framer-motion';
import { WifiOff, RefreshCw, Home, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIsNativeApp } from '@/hooks/useIsNativeApp';
import { useNavigate } from 'react-router-dom';

export function NoInternetPage() {
  const isNative = useIsNativeApp();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full text-center space-y-6"
      >
        <div className="rounded-2xl border border-border/30 bg-card/60 backdrop-blur-xl p-8">
          <div className="inline-flex p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 mb-6">
            <WifiOff className="w-14 h-14 text-amber-500" />
          </div>
          <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground mb-2">
            No internet connection
          </h1>
          <p className="text-muted-foreground mb-8">
            Check your network and try again. Some features need an internet connection.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              size="lg"
              className="gap-2"
              onClick={() => window.location.reload()}
            >
              <RefreshCw className="w-5 h-5" />
              Retry
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="gap-2"
              onClick={() => navigate('/')}
            >
              <Home className="w-5 h-5" />
              Go home
            </Button>
            {isNative && (
              <Button
                variant="outline"
                size="lg"
                className="gap-2"
                onClick={() => navigate('/downloads')}
              >
                <Download className="w-5 h-5" />
                Open Downloads
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
