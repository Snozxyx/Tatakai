import { motion } from 'framer-motion';
import { Lightbulb } from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import type { Insight } from '@/core/profile/insights';

export interface OverviewSmartInsightsProps {
  insights?: Insight[];
}

export function OverviewSmartInsights({ insights = [] }: OverviewSmartInsightsProps) {
  if (insights.length === 0) return null;

  return (
    <GlassPanel className="relative h-full overflow-hidden p-5 sm:p-7 flex flex-col justify-between border-white/[0.04] bg-background/40 backdrop-blur-2xl rounded-2xl">
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-[hsl(var(--profile-accent)/0.10)] blur-[70px] rounded-full pointer-events-none" />
      <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-[hsl(var(--profile-accent)/0.05)] blur-[70px] rounded-full pointer-events-none" />

      <div className="relative z-10 mb-5">
        <div className="flex items-center gap-2 mb-1">
          <Lightbulb className="w-4 h-4 text-primary/80" />
          <h3 className="font-display font-bold text-base sm:text-lg text-foreground tracking-tight">
            Insights
          </h3>
        </div>
        <p className="text-xs text-muted-foreground/70">Observations drawn from your own activity</p>
      </div>

      <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {insights.map((insight, idx) => (
          <motion.div
            key={insight.id}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3, delay: idx * 0.05, ease: 'easeOut' }}
            className="flex items-start gap-2.5 p-3 rounded-xl bg-white/[0.015] border border-white/[0.03]"
          >
            <div className="mt-0.5 p-1 rounded-md bg-primary/10 text-primary shrink-0">
              <Lightbulb className="w-3 h-3" />
            </div>
            <p className="text-xs text-foreground/85 leading-relaxed">{insight.text}</p>
          </motion.div>
        ))}
      </div>
    </GlassPanel>
  );
}
