
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

export type CommunityTab = 'foryou' | 'following' | 'news' | 'schedule';

const TABS: { value: CommunityTab; label: string }[] = [
  { value: 'foryou', label: 'For you' },
  { value: 'following', label: 'Following' },
  { value: 'news', label: 'News' },
  { value: 'schedule', label: 'Schedule' },
];

/**
 * Community feed tab bar – a quiet, modern segmented control. 
 * Features smooth sliding animations for both the pill and the bottom glow.
 */
export function FeedTabs({
  value,
  onChange,
}: {
  value: CommunityTab;
  onChange: (tab: CommunityTab) => void;
}) {
  return (
    <div className="relative flex w-full items-stretch border-b border-white/[0.06] pt-2">
      {TABS.map((t) => {
        const active = value === t.value;
        
        return (
          <button
            key={t.value}
            onClick={() => onChange(t.value)}
            className={cn(
              'group relative flex flex-1 items-center justify-center pb-3.5 pt-2 outline-none transition-colors duration-200',
              active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {/* Pill Container that hugs the text */}
            <span className="relative z-10 rounded-full px-4 py-1.5 text-sm font-semibold tracking-wide transition-all group-active:scale-95">
              
              {/* Sliding Pill Background */}
              {active && (
                <motion.div
                  layoutId="activeTabPill"
                  className="absolute inset-0 rounded-full bg-primary/10 shadow-[inset_0_1px_0_hsl(var(--primary)/0.2)]"
                  initial={false}
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
                />
              )}
              
              <span className="relative z-20">{t.label}</span>
            </span>

            {/* Sliding Bottom Glow Line */}
            {active && (
              <motion.div
                layoutId="activeTabLine"
                className="absolute -bottom-px left-0 right-0 z-20 flex justify-center"
                initial={false}
                transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
              >
                <span className="h-[2px] w-[80%] max-w-[80px] rounded-t-full bg-gradient-to-r from-transparent via-primary to-transparent shadow-[0_-2px_12px_hsl(var(--primary)/0.6)]" />
              </motion.div>
            )}
          </button>
        );
      })}
    </div>
  );
}
