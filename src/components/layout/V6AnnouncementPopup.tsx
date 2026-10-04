import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useIsMobile } from '@/hooks/ui/use-mobile';
import { useSettingsModal } from '@/contexts/SettingsModalContext';
import {
    Sparkles,
    BookOpen,
    Settings,
    Users,
    Blocks,
    PlayCircle,
    MessageSquare,
    Award
} from 'lucide-react';

const REDUCE_MOTION_PROMPT_DELAY_UNTIL_KEY = 'tatakai_reduce_motion_prompt_delay_until';
const POPUP_VISIBILITY_EVENT = 'tatakai-v6-popup-visibility';
const POPUP_ACTIVE_CLASS = 'v6-popup-active';
const REDUCE_MOTION_DELAY_MS = 60 * 1000;

export function V6AnnouncementPopup() {
    const [isOpen, setIsOpen] = useState(false);
    const isMobile = useIsMobile();
    const { openSettings } = useSettingsModal();

    useEffect(() => {
        const hasSeenV6 = localStorage.getItem('tatakai_v6_announced') === 'true';
        if (!hasSeenV6) {
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
        localStorage.setItem('tatakai_v6_announced', 'true');
    };

    const handleGoToSettings = () => {
        handleClose();
        openSettings('changelog');
    };

    const features = [
        {
            icon: <Blocks className="w-5 h-5 text-violet-400" />,
            title: "Extension Ecosystem",
            description: "Add sources, themes, custom read/watch verticals, and full UI — as modular extensions that run side by side."
        },
        {
            icon: <BookOpen className="w-5 h-5 text-rose-400" />,
            title: "Manga, Rebuilt",
            description: "A comick-style reader with per-device settings, saved progress, and download-whole-series offline reading."
        },
        {
            icon: <PlayCircle className="w-5 h-5 text-emerald-400" />,
            title: "Continue Watching",
            description: "Netflix-style cross-device resume, auto-downloads, richer anime info, and a release calendar."
        },
        {
            icon: <Users className="w-5 h-5 text-cyan-400" />,
            title: "Watch2Together",
            description: "Host-streamed rooms with password protection and a redesigned ambient theater."
        },
        {
            icon: <MessageSquare className="w-5 h-5 text-sky-400" />,
            title: "Community Feed",
            description: "A feed-first community with posts, polls, and rich embeds."
        },
        {
            icon: <Award className="w-5 h-5 text-amber-400" />,
            title: "Ranks & Badges",
            description: "Unified Mitsu ranks with animated name effects, plus collectible Chikra badges with rarity tiers."
        }
    ];

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent
                className="max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-[660px] overflow-y-auto overscroll-contain p-0 bg-background/70 border-white/10 shadow-2xl rounded-3xl animate-in fade-in zoom-in duration-500 sm:max-h-[90vh]"
                style={{ backdropFilter: 'blur(30px)' }}
            >

                <div className="relative h-32 w-full overflow-hidden sm:h-52">
                    <img src={`${import.meta.env.BASE_URL}assets/logo/tatakaibanner.png`} alt="Tatakai V6" className="absolute inset-0 w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/40 to-transparent" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 sm:p-6">
                        
                    </div>
                </div>

                <div className="space-y-5 p-4 sm:space-y-8 sm:p-8">
                    <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 md:gap-6">
                        {features.map((feature, i) => (
                            <div key={i} className="flex gap-4 group">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 border border-white/10 transition-all duration-300 shadow-xl group-hover:bg-primary/10 group-hover:border-primary/20 sm:h-12 sm:w-12 sm:rounded-2xl">
                                    {feature.icon}
                                </div>
                                <div className="space-y-1">
                                    <h3 className="font-bold text-sm text-foreground/90">{feature.title}</h3>
                                    <p className="text-xs text-muted-foreground leading-relaxed">{feature.description}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="flex flex-col gap-2 border-t border-white/5 pt-4 pb-[max(0.25rem,env(safe-area-inset-bottom))] sm:flex-row sm:gap-3 sm:pb-0">
                        <Button
                            onClick={handleClose}
                            size="lg"
                            className="min-h-12 flex-1 rounded-2xl font-black uppercase tracking-widest text-xs gap-2 group hover:scale-[1.02] transition-transform shadow-lg shadow-primary/20 px-4 sm:px-6"
                        >
                            <Sparkles className="w-4 h-4 group-hover:animate-spin" /> Continue
                        </Button>
                        <Button
                            onClick={handleGoToSettings}
                            variant="outline"
                            size="lg"
                            className="min-h-12 flex-1 rounded-2xl bg-white/5 border-white/10 font-bold uppercase tracking-widest text-[10px] gap-2 hover:bg-white/10 transition-all px-4 sm:px-6"
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

export const V5AnnouncementPopup = V6AnnouncementPopup;
export const V4AnnouncementPopup = V6AnnouncementPopup;

