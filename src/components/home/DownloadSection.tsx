import { motion } from 'framer-motion';
import { Download, Monitor, Zap, Shield, Globe, ArrowRight, Apple, Laptop } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { useIsDesktopApp } from '@/hooks/ui/useIsNativeApp';

const FEATURES = [
  { icon: Zap,     title: 'Offline Playback',   desc: 'Download episodes and watch without internet connection.' },
  { icon: Shield,  title: 'Ad-Free Experience',  desc: 'No ads, no trackers. Pure anime streaming.' },
  { icon: Globe,   title: 'Extension Support',   desc: 'Unlock community-built sources via the extension platform.' },
];

export function DownloadSection() {
  const isDesktopApp = useIsDesktopApp();

  // Don't show if already in the desktop app
  if (isDesktopApp) return null;

  return (
    <div className="relative rounded-[3rem] overflow-hidden border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-secondary/10 p-10 md:p-16">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-5%] w-[400px] h-[400px] bg-primary/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-20%] right-[-5%] w-[400px] h-[400px] bg-secondary/20 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <div className="relative grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-12 items-center">
        {/* Text content */}
        <div className="space-y-8">
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-primary text-xs font-black uppercase tracking-[0.2em] bg-primary/10 w-fit px-4 py-2 rounded-full border border-primary/20">
              <Download className="w-4 h-4" />
              Available Now
            </div>
            <h2 className="text-4xl md:text-5xl font-black tracking-tighter leading-none">
              Get Tatakai<br />
              <span className="text-primary italic">Desktop App</span>
            </h2>
            <p className="text-muted-foreground max-w-lg leading-relaxed font-medium text-lg">
              Unlock the full experience with offline downloads, extension support, and a native media player — all in one beautiful app.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {FEATURES.map((feature, idx) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
              >
                <GlassPanel className="p-5 border-white/5 bg-white/[0.02] rounded-2xl hover:border-primary/30 transition-all group h-full">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-4 group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                    <feature.icon className="w-5 h-5" />
                  </div>
                  <h4 className="font-black text-sm mb-1.5">{feature.title}</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed font-medium opacity-80">{feature.desc}</p>
                </GlassPanel>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Download buttons */}
        <div className="flex flex-col gap-4 min-w-[240px]">
          <Button
            onClick={() => window.open('https://github.com/tatakai-app/releases/latest', '_blank')}
            className="h-16 px-8 rounded-2xl font-black text-lg bg-primary text-primary-foreground shadow-2xl shadow-primary/25 hover:scale-105 active:scale-95 transition-all w-full justify-start gap-4"
          >
            <Monitor className="w-6 h-6" />
            <div className="text-left">
              <div className="text-[10px] font-bold uppercase tracking-widest opacity-75">Download for</div>
              <div className="leading-tight">Windows</div>
            </div>
            <ArrowRight className="w-5 h-5 ml-auto" />
          </Button>

          <Button
            variant="outline"
            onClick={() => window.open('https://github.com/tatakai-app/releases/latest', '_blank')}
            className="h-16 px-8 rounded-2xl font-black text-lg border-white/10 bg-white/5 hover:bg-white/10 hover:border-primary/30 transition-all w-full justify-start gap-4 backdrop-blur-md"
          >
            <Apple className="w-6 h-6" />
            <div className="text-left">
              <div className="text-[10px] font-bold uppercase tracking-widest opacity-75">Download for</div>
              <div className="leading-tight">macOS</div>
            </div>
            <ArrowRight className="w-5 h-5 ml-auto" />
          </Button>

          <Button
            variant="outline"
            onClick={() => window.open('https://github.com/tatakai-app/releases/latest', '_blank')}
            className="h-16 px-8 rounded-2xl font-black text-lg border-white/10 bg-white/5 hover:bg-white/10 hover:border-primary/30 transition-all w-full justify-start gap-4 backdrop-blur-md"
          >
            <Laptop className="w-6 h-6" />
            <div className="text-left">
              <div className="text-[10px] font-bold uppercase tracking-widest opacity-75">Download for</div>
              <div className="leading-tight">Linux</div>
            </div>
            <ArrowRight className="w-5 h-5 ml-auto" />
          </Button>

          <p className="text-center text-xs text-muted-foreground/50 font-medium">Free &amp; Open Source · MIT License</p>
        </div>
      </div>
    </div>
  );
}
