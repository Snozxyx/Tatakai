import { motion } from "framer-motion";
import { AlertCircle, RefreshCw, Home, Bug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

interface ErrorPageProps {
  error?: Error | null;
  resetError?: () => void;
}

const ErrorPage = ({ error, resetError }: ErrorPageProps) => {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 overflow-hidden relative">
      {/* Glitch effect background */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute inset-0 bg-gradient-to-br from-red-500/5 via-transparent to-purple-500/5"
          animate={{ 
            backgroundPosition: ['0% 0%', '100% 100%', '0% 0%'],
          }}
          transition={{ duration: 10, repeat: Infinity }}
        />
      </div>

      {/* Floating code blocks */}
      <div className="absolute inset-0 overflow-hidden opacity-10">
        {[...Array(5)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute font-mono text-xs text-primary whitespace-pre"
            style={{
              left: `${10 + i * 20}%`,
              top: `${20 + i * 15}%`,
            }}
            animate={{ 
              y: [-10, 10, -10],
              opacity: [0.3, 0.6, 0.3],
            }}
            transition={{ 
              duration: 3 + i,
              repeat: Infinity,
              delay: i * 0.5,
            }}
          >
            {`Error: undefined\n  at line ${100 + i * 23}\n  at Module.${['render', 'mount', 'update', 'fetch', 'parse'][i]}`}
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 text-center max-w-lg"
      >
        {/* Error icon with pulse */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
          className="mb-8 inline-flex"
        >
          <div className="relative">
            <motion.div
              className="w-32 h-32 bg-gradient-to-br from-red-500/20 to-purple-500/20 rounded-2xl flex items-center justify-center"
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 4, repeat: Infinity }}
            >
              <AlertCircle className="w-16 h-16 text-red-500" />
            </motion.div>
            <motion.div
              className="absolute inset-0 bg-red-500/20 rounded-2xl"
              animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          </div>
        </motion.div>

        {/* Error message */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="space-y-4 mb-8"
        >
          <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground">
            Something Went Wrong
          </h1>
          <p className="text-muted-foreground text-lg">
            An unexpected error occurred. Don't worry, our team has been notified.
          </p>
        </motion.div>

        {/* Error details (if available) */}
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={{ delay: 0.6 }}
            className="mb-8"
          >
            <div className="bg-muted/50 border border-border rounded-lg p-4 text-left">
              <div className="flex items-center gap-2 mb-2">
                <Bug className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">Error Details</span>
              </div>
              <code className="text-xs text-muted-foreground break-all block">
                {error.message || 'Unknown error'}
              </code>
            </div>
          </motion.div>
        )}

        {/* Action buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="flex flex-col sm:flex-row gap-4 justify-center"
        >
          <Button
            onClick={resetError || (() => window.location.reload())}
            size="lg"
            className="gap-2"
          >
            <RefreshCw className="w-5 h-5" />
            Try Again
          </Button>
          <Button asChild variant="outline" size="lg" className="gap-2">
            <Link to="/">
              <Home className="w-5 h-5" />
              Go Home
            </Link>
          </Button>
        </motion.div>

        {/* Error ID for support */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="mt-8 text-xs text-muted-foreground"
        >
          Error ID: {Math.random().toString(36).substring(2, 10).toUpperCase()}
        </motion.p>
      </motion.div>
    </div>
  );
};

export default ErrorPage;
