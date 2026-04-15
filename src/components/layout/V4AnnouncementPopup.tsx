import { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useIsMobile } from '@/hooks/use-mobile';
import {
    Sparkles,
    BookOpen,
    Settings,
    Users,
    ShieldCheck,
    Target,
    Search
} from 'lucide-react';

const REDUCE_MOTION_PROMPT_DELAY_UNTIL_KEY = 'tatakai_reduce_motion_prompt_delay_until';
const POPUP_VISIBILITY_EVENT = 'tatakai-v5-popup-visibility';
const POPUP_ACTIVE_CLASS = 'v5-popup-active';
const REDUCE_MOTION_DELAY_MS = 60 * 1000;

export function V5AnnouncementPopup() {
    const [isOpen, setIsOpen] = useState(false);
    const isMobile = useIsMobile();

    useEffect(() => {
        const hasSeenV5 = localStorage.getItem('tatakai_v5_announced') === 'true';
        if (!hasSeenV5) {
            const timer = setTimeout(() => setIsOpen(true), 2000);
            return () => clearTimeout(timer);
        }
    }, []);

    useEffect(() => {
        if (typeof document === 'undefined') return;

        const roots = [document.documentElement, document.body];
        const dispatchVisibility = (open: boolean) => {
            if (typeof window === 'undefined') return;
            window.dispatchEvent(
                new CustomEvent(POPUP_VISIBILITY_EVENT, {
                    detail: { open },
                })
            );
        };

        if (!isMobile || !isOpen) {
            roots.forEach((element) => element.classList.remove(POPUP_ACTIVE_CLASS));
            dispatchVisibility(false);
            return;
        }

        roots.forEach((element) => element.classList.add(POPUP_ACTIVE_CLASS));
        localStorage.setItem(
            REDUCE_MOTION_PROMPT_DELAY_UNTIL_KEY,
            String(Date.now() + REDUCE_MOTION_DELAY_MS)
        );
        dispatchVisibility(true);

        return () => {
            roots.forEach((element) => element.classList.remove(POPUP_ACTIVE_CLASS));
            dispatchVisibility(false);
        };
    }, [isMobile, isOpen]);

    const handleClose = () => {
        setIsOpen(false);
        localStorage.setItem('tatakai_v5_announced', 'true');
    };

    const handleGoToSettings = () => {
        handleClose();
        window.location.href = '/settings?tab=changelog';
    };

    const features = [
        {
            icon: <ShieldCheck className="w-5 h-5 text-emerald-400" />,
            title: "Playback Reliability",
            description: "Smarter failover and source quality memory reduce dead streams and repeated retries."
        },
        {
            icon: <Users className="w-5 h-5 text-cyan-400" />,
            title: "Watch2Together Upgrades",
            description: "Host transfer, reconnect recovery, and cleaner room sync for smoother group sessions."
        },
        // {
        //     icon: <Target className="w-5 h-5 text-amber-400" />,
        //     title: "Explainable Recommendations",
        //     description: "See recommendation reasons, factor breakdowns, and give direct feedback controls."
        // },
        {
            icon: <Search className="w-5 h-5 text-violet-400" />,
            title: "Hybrid Search",
            description: "Anime + character results, advanced filters, and image-search confidence controls."
        },
        {
            icon: <BookOpen className="w-5 h-5 text-rose-400" />,
            title: "Manga V5 Expansion",
            description: "New manga hub sections, better chapter filtering, and smoother reader navigation upgrades."
        }
    ];

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent
                className="w-[95vw] max-w-[660px] p-0 overflow-hidden bg-background/70 border-white/10 shadow-2xl rounded-3xl animate-in fade-in zoom-in duration-500"
                style={{ backdropFilter: 'blur(30px)' }}
            >
                <div className="relative h-44 w-full overflow-hidden sm:h-52">
                    <img src="/tatakaibanner.png" alt="Tatakai V5" className="absolute inset-0 w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/40 to-transparent" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 sm:p-6">
                        <Badge variant="outline" className="mb-3 border-primary/50 text-primary bg-primary/10 px-3 py-1 font-black uppercase tracking-[0.2em] text-[10px]">
                            Major Update
                        </Badge>
                        <h1 className="text-3xl sm:text-5xl font-black tracking-tighter text-foreground drop-shadow-2xl">
                            TATAKAI <span className="text-primary">V5</span>
                        </h1>
                        <p className="text-muted-foreground text-xs mt-2 font-medium tracking-widest uppercase">Reliability + Discovery Upgrade</p>
                    </div>
                </div>

                <div className="p-5 sm:p-8 space-y-6 sm:space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {features.map((feature, i) => (
                            <div key={i} className="flex gap-4 group">
                                <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-primary/10 group-hover:border-primary/20 transition-all duration-300 shadow-xl">
                                    {feature.icon}
                                </div>
                                <div className="space-y-1">
                                    <h3 className="font-bold text-sm text-foreground/90">{feature.title}</h3>
                                    <p className="text-xs text-muted-foreground leading-relaxed">{feature.description}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-white/5 pb-4 sm:pb-0 px-4 sm:px-6">
                        <Button
                            onClick={handleClose}
                            size="lg"
                            className="flex-1 rounded-2xl font-black uppercase tracking-widest text-xs gap-2 group hover:scale-[1.02] transition-transform shadow-lg shadow-primary/20 px-4 sm:px-6 py-3"
                        >
                            <Sparkles className="w-4 h-4 group-hover:animate-spin" /> Continue
                        </Button>
                        <Button
                            onClick={handleGoToSettings}
                            variant="outline"
                            size="lg"
                            className="flex-1 rounded-2xl bg-white/5 border-white/10 font-bold uppercase tracking-widest text-[10px] gap-2 hover:bg-white/10 transition-all px-4 sm:px-6 py-3"
                        >
                            <Settings className="w-4 h-4" /> View Changelog
                        </Button>
                    </div>

                    <p className="text-center text-[9px] text-muted-foreground/40 font-medium uppercase tracking-[0.3em]">
                        Developed with ❤️ by Snozxyx
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export const V4AnnouncementPopup = V5AnnouncementPopup;
