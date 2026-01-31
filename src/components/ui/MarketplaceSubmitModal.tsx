import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Share2, Subtitles, Server } from "lucide-react";

interface MarketplaceSubmitModalProps {
    isOpen: boolean;
    onClose: () => void;
    animeId: string;
    animeName: string;
    episodeNumber?: number;
}

export function MarketplaceSubmitModal({ isOpen, onClose, animeId, animeName, episodeNumber }: MarketplaceSubmitModalProps) {
    const { user } = useAuth();
    const [type, setType] = useState<'subtitle' | 'server'>('subtitle');
    const [url, setUrl] = useState("");
    const [lang, setLang] = useState("");
    const [label, setLabel] = useState("");
    const [isEmbed, setIsEmbed] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!user) {
            toast.error("You must be logged in to share");
            return;
        }

        if (!url) {
            toast.error("Please provide a URL");
            return;
        }

        setIsSubmitting(true);
        try {
            const { error } = await supabase.from('marketplace_items').insert({
                user_id: user.id,
                type,
                anime_id: animeId,
                anime_name: animeName,
                episode_number: episodeNumber || 1,
                data: { url, lang, label, isEmbed },
                status: 'pending'
            });

            if (error) throw error;

            toast.success("Shared successfully! A moderator will review it soon.");
            onClose();
            // Reset
            setUrl("");
            setIsEmbed(false);
        } catch (error: any) {
            toast.error("Failed to share: " + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[425px] bg-background/95 backdrop-blur-xl border-white/10 shadow-2xl">
                <DialogHeader>
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                        <Share2 className="w-6 h-6 text-primary" />
                    </div>
                    <DialogTitle className="text-xl font-bold">Share Resource</DialogTitle>
                    <DialogDescription>
                        Share a custom subtitle or server for <span className="text-foreground font-medium">{animeName} (Ep {episodeNumber})</span>.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">Type</label>
                        <div className="grid grid-cols-2 gap-2">
                            <Button
                                variant={type === 'subtitle' ? 'default' : 'outline'}
                                onClick={() => setType('subtitle')}
                                className="gap-2 rounded-xl h-12"
                            >
                                <Subtitles className="w-4 h-4" /> Subtitle
                            </Button>
                            <Button
                                variant={type === 'server' ? 'default' : 'outline'}
                                onClick={() => setType('server')}
                                className="gap-2 rounded-xl h-12"
                            >
                                <Server className="w-4 h-4" /> Server
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">Resource URL</label>
                        <Input
                            placeholder="https://..."
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            className="bg-white/5 border-white/10"
                        />
                        <p className="text-[10px] text-muted-foreground italic">Direct link to .vtt/.srt or video stream.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground">Language</label>
                            <Input
                                placeholder="e.g. English"
                                value={lang}
                                onChange={(e) => setLang(e.target.value)}
                                className="bg-white/5 border-white/10"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground">Label</label>
                            <Input
                                placeholder="e.g. Gogoanime"
                                value={label}
                                onChange={(e) => setLabel(e.target.value)}
                                className="bg-white/5 border-white/10"
                            />
                        </div>
                    </div>

                    {type === 'server' && (
                        <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
                            <div className="space-y-0.5">
                                <label className="text-sm font-medium">Is Embed?</label>
                                <p className="text-[10px] text-muted-foreground">Toggle this if the URL is an iframe/embed link.</p>
                            </div>
                            <Switch checked={isEmbed} onCheckedChange={setIsEmbed} />
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={isSubmitting || !user}
                        className="rounded-xl shadow-lg shadow-primary/20 font-black px-8"
                    >
                        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        Submit for Review
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
