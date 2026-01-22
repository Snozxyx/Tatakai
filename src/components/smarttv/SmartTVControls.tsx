import { useState, useEffect, useCallback } from 'react';
import { useSmartTV } from '@/hooks/useSmartTV';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight, 
  Play, Pause, Home, ArrowLeft, Settings, Search, Volume2
} from 'lucide-react';

interface SmartTVControlsProps {
  onNavigate?: (direction: 'up' | 'down' | 'left' | 'right') => void;
  onSelect?: () => void;
  onBack?: () => void;
  onHome?: () => void;
  onPlayPause?: () => void;
  isPlaying?: boolean;
}

export function SmartTVControls({
  onNavigate,
  onSelect,
  onBack,
  onHome,
  onPlayPause,
  isPlaying = false,
}: SmartTVControlsProps) {
  const { isSmartTV, platform } = useSmartTV();
  const [showControls, setShowControls] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);

  // Handle remote control events
  useEffect(() => {
    if (!isSmartTV) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      setShowControls(true);

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          onNavigate?.('up');
          break;
        case 'ArrowDown':
          e.preventDefault();
          onNavigate?.('down');
          break;
        case 'ArrowLeft':
          e.preventDefault();
          onNavigate?.('left');
          break;
        case 'ArrowRight':
          e.preventDefault();
          onNavigate?.('right');
          break;
        case 'Enter':
        case 'Select':
          e.preventDefault();
          onSelect?.();
          break;
        case 'Escape':
        case 'Back':
        case 'Backspace':
          e.preventDefault();
          onBack?.();
          break;
        case 'Home':
          e.preventDefault();
          onHome?.();
          break;
        case ' ':
        case 'MediaPlayPause':
          e.preventDefault();
          onPlayPause?.();
          break;
      }

      // Hide controls after inactivity
      setTimeout(() => setShowControls(false), 5000);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSmartTV, onNavigate, onSelect, onBack, onHome, onPlayPause]);

  if (!isSmartTV) return null;

  return (
    <>
      {/* Platform indicator */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="fixed top-4 right-4 z-50 px-4 py-2 rounded-xl bg-primary/20 backdrop-blur-sm border border-primary/30"
      >
        <div className="flex items-center gap-2 text-sm">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="font-medium capitalize">{platform.replace('_', ' ')} Mode</span>
        </div>
      </motion.div>

      {/* On-screen control hints */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50"
          >
            <div className="flex items-center gap-6 px-6 py-4 rounded-2xl bg-card/90 backdrop-blur-xl border border-border/50">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-muted">
                  <ArrowLeft className="w-4 h-4" />
                </div>
                <span className="text-sm text-muted-foreground">Back</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary">
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </div>
                <span className="text-sm text-muted-foreground">
                  {isPlaying ? 'Pause' : 'Play'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
                <span className="text-sm text-muted-foreground">Navigate</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// Focusable item component for TV navigation
interface FocusableItemProps {
  children: React.ReactNode;
  onFocus?: () => void;
  onSelect?: () => void;
  className?: string;
  tabIndex?: number;
}

export function FocusableItem({ 
  children, 
  onFocus, 
  onSelect, 
  className = '',
  tabIndex = 0 
}: FocusableItemProps) {
  const { isSmartTV } = useSmartTV();

  return (
    <div
      tabIndex={tabIndex}
      onFocus={onFocus}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Select') {
          e.preventDefault();
          onSelect?.();
        }
      }}
      className={`
        ${className}
        ${isSmartTV ? 'tv-focusable focus:ring-4 focus:ring-primary focus:scale-105 transition-all duration-200' : ''}
      `}
    >
      {children}
    </div>
  );
}

// Voice search component for Smart TVs
export function SmartTVVoiceSearch({ onSearch }: { onSearch: (query: string) => void }) {
  const { isSmartTV, platform } = useSmartTV();
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');

  useEffect(() => {
    if (!isSmartTV || !('webkitSpeechRecognition' in window)) return;

    // Voice search is available on some Smart TV platforms
    console.log('Voice search available on', platform);
  }, [isSmartTV, platform]);

  if (!isSmartTV) return null;

  return (
    <button
      onClick={() => setIsListening(!isListening)}
      className={`
        p-4 rounded-xl transition-all duration-300
        ${isListening 
          ? 'bg-primary text-primary-foreground animate-pulse' 
          : 'bg-muted/50 hover:bg-muted text-foreground'
        }
      `}
    >
      <Search className="w-6 h-6" />
      {isListening && (
        <span className="ml-2 text-sm">Listening...</span>
      )}
    </button>
  );
}
