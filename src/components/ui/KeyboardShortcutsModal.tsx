import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { KeyRound, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

interface Shortcut {
  keys: string[];
  description: string;
  category: string;
}

const SHORTCUTS: Shortcut[] = [
  // Navigation
  { keys: ['G', 'H'], description: 'Go to Home', category: 'Navigation' },
  { keys: ['G', 'S'], description: 'Go to Search', category: 'Navigation' },
  { keys: ['G', 'P'], description: 'Go to Profile', category: 'Navigation' },
  { keys: ['G', 'T'], description: 'Go to Trending', category: 'Navigation' },
  { keys: ['/'], description: 'Focus search bar', category: 'Navigation' },
  { keys: ['?'], description: 'Show keyboard shortcuts', category: 'Navigation' },

  // Video Player
  { keys: ['Space', 'K'], description: 'Play / Pause', category: 'Video' },
  { keys: ['F'], description: 'Toggle fullscreen', category: 'Video' },
  { keys: ['M'], description: 'Toggle mute', category: 'Video' },
  { keys: ['←'], description: 'Seek back 10s', category: 'Video' },
  { keys: ['→'], description: 'Seek forward 10s', category: 'Video' },
  { keys: ['↑'], description: 'Volume up', category: 'Video' },
  { keys: ['↓'], description: 'Volume down', category: 'Video' },
  { keys: ['I'], description: 'Toggle Picture-in-Picture', category: 'Video' },

  // General
  { keys: ['Esc'], description: 'Close dialog / modal', category: 'General' },
  { keys: ['Ctrl', 'K'], description: 'Open command palette', category: 'General' },
];

const CATEGORIES = ['Navigation', 'Video', 'General'];

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex items-center px-2 py-0.5 rounded-md border border-border bg-muted text-xs font-mono font-semibold text-muted-foreground min-w-[1.75rem] justify-center">
      {children}
    </kbd>
  );
}

interface KeyboardShortcutsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function KeyboardShortcutsModal({ open, onOpenChange }: KeyboardShortcutsModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl w-full max-h-[80vh] overflow-y-auto border-border/50 bg-card/95 backdrop-blur-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display font-black text-lg">
            <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <KeyRound className="w-3.5 h-3.5 text-primary" />
            </div>
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>

        <div className="mt-2 space-y-6">
          {CATEGORIES.map(category => (
            <div key={category}>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-px flex-1 bg-border/50" />
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-2">
                  {category}
                </span>
                <div className="h-px flex-1 bg-border/50" />
              </div>
              <div className="space-y-1.5">
                {SHORTCUTS.filter(s => s.category === category).map((shortcut, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-muted/40 transition-colors"
                  >
                    <span className="text-sm text-muted-foreground">{shortcut.description}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, j) => (
                        <span key={j} className="flex items-center gap-1">
                          {j > 0 && <span className="text-[10px] text-muted-foreground/50">+</span>}
                          <Kbd>{key}</Kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-border/50 flex items-center gap-2 text-xs text-muted-foreground">
          <Monitor className="w-3.5 h-3.5" />
          Keyboard shortcuts are available on desktop only
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Global keyboard shortcuts listener — registers ? key to open the modal
export function KeyboardShortcutsProvider() {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isMobile) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        (document.activeElement as HTMLElement)?.isContentEditable
      ) return;

      if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobile]);

  if (isMobile) return null;

  return <KeyboardShortcutsModal open={open} onOpenChange={setOpen} />;
}
