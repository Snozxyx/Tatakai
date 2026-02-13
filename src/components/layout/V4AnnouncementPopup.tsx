import { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Sparkles,
    Users,
    Zap,
    Settings,
    Play,
    ShieldCheck,
    MessageSquare,
    Globe,
    Gauge
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function V4AnnouncementPopup() {
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const hasSeenV4 = localStorage.getItem('tatakai_v4_announced') === 'true';
        if (!hasSeenV4) {
            const timer = setTimeout(() => setIsOpen(true), 2000);
            return () => clearTimeout(timer);
        }
    }, []);

    const handleClose = () => {
        setIsOpen(false);
        localStorage.setItem('tatakai_v4_announced', 'true');
    };

    const handleGoToSettings = () => {
        handleClose();
        window.location.href = '/settings?tab=changelog';
    };

    const features = [
        {
            icon: <Users className="w-5 h-5 text-blue-400" />,
            title: "Social Marketplace",
            description: "See exactly who shared community links. Click usernames to visit profiles!"
        },
        {
            icon: <Gauge className="w-5 h-5 text-purple-400" />,
            title: "Custom Playback Speed",
            description: "Fine-tune your experience. Type any speed from 0.1x to 10x in player settings."
        },
        {
            icon: <Zap className="w-5 h-5 text-yellow-400" />,
            title: "Advanced Scraper Repair",
            description: "Desidubanime & Aniworld are back! Improved matching for titles like Hell's Paradise."
        },
        {
            icon: <ShieldCheck className="w-5 h-5 text-green-400" />,
            title: "Pending Item Visibility",
            description: "Shared a new link? You can now see your own entries while they await approval."
        }
    ];

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent 
                className="sm:max-w-[600px] p-0 overflow-hidden bg-background/40 border-white/10 shadow-2xl rounded-3xl animate-in fade-in zoom-in duration-500"
                style={{ backdropFilter: 'blur(40px)' }}
            >
                {/* Header/Banner */}
                <div className="relative h-48 w-full overflow-hidden bg-gradient-to-br from-primary/20 via-primary/5 to-transparent">
                    <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1578632738981-43c9ad4698d8?q=80&w=1000&auto=format&fit=crop')] bg-cover bg-center opacity-20 mix-blend-overlay" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-gradient-to-t from-background/80 to-transparent">
                        <Badge variant="outline" className="mb-3 border-primary/50 text-primary bg-primary/10 px-3 py-1 font-black uppercase tracking-[0.2em] text-[10px]" style={{ backdropFilter: 'blur(12px)' }}>
                            Major Update
                        </Badge>
                        <h1 className="text-5xl font-black tracking-tighter text-foreground drop-shadow-2xl">
                            TATAKAI <span className="text-primary">V4</span>
                        </h1>
                        <p className="text-muted-foreground text-xs mt-2 font-medium tracking-widest uppercase">The Social Streaming Revolution</p>
                    </div>
                </div>

                <div className="p-8 space-y-8">
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
                            <Sparkles className="w-4 h-4 group-hover:animate-spin" /> Let's Go
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
