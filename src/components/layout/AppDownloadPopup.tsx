import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, Smartphone, Monitor, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { motion, AnimatePresence } from 'framer-motion';
import { useIsNativeApp } from '@/hooks/useIsNativeApp';

export const AppDownloadPopup = () => {
    const [isOpen, setIsOpen] = useState(false);
    const isNative = useIsNativeApp();

    useEffect(() => {
        // Show only on web after 5 seconds
        if (isNative) return;

        const hasSeen = localStorage.getItem('tatakai_app_promo_seen');
        if (!hasSeen) {
            const timer = setTimeout(() => {
                setIsOpen(true);
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [isNative]);

    const handleClose = () => {
        setIsOpen(false);
        localStorage.setItem('tatakai_app_promo_seen', 'true');
    };

    if (isNative) return null;

    // Use portal to render directly on body, avoiding any parent transforms
    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80" style={{ backdropFilter: 'blur(4px)' }}>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="relative w-full max-w-2xl"
                    >
                        <GlassPanel className="overflow-hidden border-primary/30 shadow-2xl shadow-primary/20">
                            <button
                                onClick={handleClose}
                                className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 transition-colors z-10"
                            >
                                <X className="w-5 h-5" />
                            </button>

                            <div className="grid md:grid-cols-2">
                                <div className="relative aspect-[4/5] md:aspect-auto bg-gradient-to-br from-primary/20 to-purple-500/20 p-8 flex flex-col justify-end">
                                    <div className="absolute inset-0 bg-[url('/tatakai-logo-square.png')] bg-center bg-no-repeat bg-contain opacity-10 scale-150 rotate-12" />
                                    <div className="relative space-y-2">
                                        <h2 className="text-3xl font-bold font-display">Upgrade Your Experience</h2>
                                        <p className="text-sm text-muted-foreground">
                                            Take your anime journey to the next level with our native applications.
                                        </p>
                                    </div>
                                </div>

                                <div className="p-8 space-y-6 bg-card">
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-4 group cursor-pointer p-3 rounded-2xl hover:bg-primary/5 transition-colors border border-transparent hover:border-primary/20">
                                            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                                                <Smartphone className="w-6 h-6" />
                                            </div>
                                            <div className="flex-1">
                                                <h4 className="font-bold text-sm">Mobile App [Under Development]</h4>
                                                <p className="text-xs text-muted-foreground">Watch offline on Android & iOS</p>
                                            </div>
                                            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                                        </div>

                                        <div className="flex items-center gap-4 group cursor-pointer p-3 rounded-2xl hover:bg-purple-500/5 transition-colors border border-transparent hover:border-purple-500/20">
                                            <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400">
                                                <Monitor className="w-6 h-6" />
                                            </div>
                                            <div className="flex-1">
                                                <h4 className="font-bold text-sm">Desktop App</h4>
                                                <p className="text-xs text-muted-foreground">Discord RPC & Native 4K Player</p>
                                            </div>
                                            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                                        </div>
                                    </div>

                                    <div className="pt-4 flex flex-col gap-3">
                                        <Button className="w-full rounded-full h-12 gap-2 glow-primary">
                                            <Download className="w-4 h-4" /> Download Now
                                        </Button>
                                        <button
                                            onClick={handleClose}
                                            className="text-xs text-muted-foreground hover:text-foreground transition-colors text-center"
                                        >
                                            Maybe later, I'll stay on web
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </GlassPanel>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
};
