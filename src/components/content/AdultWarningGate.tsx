import { ShieldAlert } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';

export interface AdultWarningGateProps {
  /** Display title of the gated media, e.g. the anime/manga name. */
  title: string;
  /** Noun used in the warning copy — "anime", "manga", or the default "title". */
  mediaLabel?: string;
  onBack: () => void;
  onContinue: () => void;
  onAlwaysShow: () => void;
}

export function AdultWarningGate({
  title,
  mediaLabel = 'title',
  onBack,
  onContinue,
  onAlwaysShow,
}: AdultWarningGateProps) {
  return (
    <div className="flex w-full items-center justify-center p-4 py-12 md:py-24">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative mx-auto w-full max-w-lg overflow-hidden rounded-[24px] border border-white/10 bg-[#0a0a0a] shadow-2xl"
      >
        {/* Full-bleed Header Image */}
        <div className="relative h-32 w-full md:h-40">
          <img
            src={`${import.meta.env.BASE_URL}assets/image/content/manga18+.jpg`}
            alt="18+ Content Banner"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/60 to-black/20" />
          
          {/* Badge */}
          <div className="absolute bottom-4 left-0 flex w-full justify-center">
            <div className="flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-rose-400 backdrop-blur-md">
              <ShieldAlert className="h-3.5 w-3.5" />
              18+ Mature Content
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="px-6 pb-8 pt-6 text-center md:px-8">
          <h1 className="font-display text-2xl font-bold tracking-tight text-white md:text-3xl">
            Sensitive Content
          </h1>
          <p className="mx-auto mt-3 max-w-[320px] text-[15px] leading-relaxed text-muted-foreground/90">
            This {mediaLabel} is marked as mature. Please proceed only if you are comfortable viewing 18+ material.
          </p>

          {/* Title Box */}
          <div className="mx-auto mt-5 inline-flex max-w-full items-center justify-center rounded-xl border border-white/5 bg-white/[0.02] px-4 py-2.5">
            <span className="truncate text-sm font-semibold text-white/90">
              {title || 'Unknown Title'}
            </span>
          </div>

          {/* Primary Actions */}
          <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
            <Button 
              variant="ghost" 
              onClick={onBack} 
              className="w-full sm:w-32 rounded-full font-semibold hover:bg-white/5"
            >
              Go Back
            </Button>
            <Button 
              onClick={onContinue} 
              className="w-full sm:w-auto rounded-full bg-rose-600 hover:bg-rose-700 text-white font-bold transition-all active:scale-95 px-8"
            >
              Continue
            </Button>
          </div>

          {/* Secondary Action (Global Setting) */}
          <div className="mt-6 flex justify-center">
            <button 
              onClick={onAlwaysShow} 
              className="group text-[13px] font-medium text-muted-foreground transition-colors hover:text-white"
            >
              <span className="underline decoration-white/30 underline-offset-4 transition-colors group-hover:decoration-white">
                Always show mature media
              </span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}