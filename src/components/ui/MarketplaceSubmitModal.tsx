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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Share2, Subtitles, Server, Magnet, Link as LinkIcon } from "lucide-react";

interface MarketplaceSubmitModalProps {
    isOpen: boolean;
    onClose: () => void;
    animeId: string;
    animeName: string;
    episodeNumber?: number;
}

export function MarketplaceSubmitModal({ isOpen, onClose, animeId, animeName, episodeNumber }: MarketplaceSubmitModalProps) {
    const { user } = useAuth();
    const [type, setType] = useState<'subtitle' | 'server' | 'magnet' | 'torrent' | 'external'>('subtitle');
    const [url, setUrl] = useState("");
    const [lang, setLang] = useState("");
    const [label, setLabel] = useState("");
    const [isEmbed, setIsEmbed] = useState(false);
    const [quality, setQuality] = useState("");
    const [source, setSource] = useState("");
    const [codec, setCodec] = useState("");
    const [audio, setAudio] = useState("");
    const [subtitleType, setSubtitleType] = useState("");
    const [episodeRange, setEpisodeRange] = useState("");
    const [releaseGroup, setReleaseGroup] = useState("");
    const [notes, setNotes] = useState("");
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

        if (type === 'magnet' && !url.startsWith('magnet:?')) {
            toast.error("Magnet links must start with magnet:?");
            return;
        }

        setIsSubmitting(true);
        try {
            const normalizedType = type === 'torrent' ? 'server' : type;
            const metadata = {
                url,
                stream_url: type === 'server' ? url : null,
                external_url: type === 'external' ? url : null,
                magnet_link: type === 'magnet' ? url : null,
                torrent_file_url: type === 'torrent' ? url : null,
                lang,
                label,
                isEmbed,
                quality,
                source,
                codec,
                audio,
                subtitleType,
                episodeRange,
                releaseGroup,
                notes,
                sourceType: type,
            };

            const { error } = await supabase.from('marketplace_items').insert({
                user_id: user.id,
                type: normalizedType,
                anime_id: animeId,
                anime_name: animeName,
                episode_number: episodeNumber || 1,
                data: metadata,
                status: 'pending'
            });

            if (error) throw error;

            toast.success("Shared successfully! A moderator will review it soon.");
            onClose();
            // Reset
            setUrl("");
            setIsEmbed(false);
            setQuality("");
            setSource("");
            setCodec("");
            setAudio("");
            setSubtitleType("");
            setEpisodeRange("");
            setReleaseGroup("");
            setNotes("");
        } catch (error: any) {
            toast.error("Failed to share: " + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-2xl bg-background/95 backdrop-blur-3xl border-border/50 p-0 overflow-hidden rounded-[2rem] max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                        <Share2 className="w-6 h-6 text-primary" />
                    </div>
                    <DialogTitle className="text-xl font-bold">Share Resource</DialogTitle>
                    <DialogDescription>
                        Share a custom subtitle or server for <span className="text-foreground font-medium">{animeName} (Ep {episodeNumber})</span>.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4 px-6 overflow-y-auto custom-scrollbar">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">Type</label>
                        <div className="grid grid-cols-3 gap-2">
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
                            <Button
                                variant={type === 'magnet' ? 'default' : 'outline'}
                                onClick={() => setType('magnet')}
                                className="gap-2 rounded-xl h-12"
                            >
                                <Magnet className="w-4 h-4" /> Magnet
                            </Button>
                            <Button
                                variant={type === 'torrent' ? 'default' : 'outline'}
                                onClick={() => setType('torrent')}
                                className="gap-2 rounded-xl h-12"
                            >
                                <Server className="w-4 h-4" /> Torrent URL
                            </Button>
                            <Button
                                variant={type === 'external' ? 'default' : 'outline'}
                                onClick={() => setType('external')}
                                className="gap-2 rounded-xl h-12 col-span-2"
                            >
                                <LinkIcon className="w-4 h-4" /> External URL
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">
                            {type === 'magnet' ? 'Magnet Link' : type === 'torrent' ? 'Torrent File URL' : 'Resource URL'}
                        </label>
                        <Input
                            placeholder={type === 'magnet' ? 'magnet:?xt=urn:btih:...' : 'https://...'}
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            className="bg-white/5 border-white/10"
                        />
                        <p className="text-[10px] text-muted-foreground italic">Supports subtitle, stream, magnet, and torrent file URLs.</p>
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
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground">Quality</label>
                            <Input placeholder="e.g. 1080p" value={quality} onChange={(e) => setQuality(e.target.value)} className="bg-white/5 border-white/10" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground">Source</label>
                            <Input placeholder="e.g. BD / WEB-DL" value={source} onChange={(e) => setSource(e.target.value)} className="bg-white/5 border-white/10" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground">Codec</label>
                            <Input placeholder="e.g. x265 HEVC" value={codec} onChange={(e) => setCodec(e.target.value)} className="bg-white/5 border-white/10" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground">Audio</label>
                            <Input placeholder="e.g. Dual Audio" value={audio} onChange={(e) => setAudio(e.target.value)} className="bg-white/5 border-white/10" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground">Subtitle Type</label>
                            <Input placeholder="e.g. Multi-Subs" value={subtitleType} onChange={(e) => setSubtitleType(e.target.value)} className="bg-white/5 border-white/10" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground">Episode Range</label>
                            <Input placeholder="e.g. S01E01-S01E12" value={episodeRange} onChange={(e) => setEpisodeRange(e.target.value)} className="bg-white/5 border-white/10" />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">Release Group</label>
                        <Input placeholder="e.g. Erai-raws" value={releaseGroup} onChange={(e) => setReleaseGroup(e.target.value)} className="bg-white/5 border-white/10" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">Notes</label>
                        <Textarea placeholder="Any extra metadata or verification notes..." value={notes} onChange={(e) => setNotes(e.target.value)} className="bg-white/5 border-white/10 min-h-[90px]" />
                    </div>

                    {type === 'server' && (
                        <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
                            <div className="space-y-0.5">
                                <label className="text-sm font-medium">Is Embed?</label>
                                <p className="text-[10px] text-muted-foreground">Toggle this if the URL is an iframe/embed link (player page URL).</p>
                            </div>
                            <Switch checked={isEmbed} onCheckedChange={setIsEmbed} />
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2 sm:gap-0 p-6 border-t border-white/5">
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
