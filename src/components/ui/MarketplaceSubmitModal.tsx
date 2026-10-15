import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
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
  useUiTranslation();
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
            toast.error(uiI18n.t('app.you_must_be_logged_in_to_share_5fe48923'));
            return;
        }

        if (!url) {
            toast.error(uiI18n.t('app.please_provide_a_url_5e0ea799'));
            return;
        }

        if (type === 'magnet' && !url.startsWith('magnet:?')) {
            toast.error(uiI18n.t('app.magnet_links_must_start_with_magnet_dfc48764'));
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

            toast.success(uiI18n.t('app.shared_successfully_a_moderator_will_review_it_s_a378439a'));
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
                    <DialogTitle className="text-xl font-bold">{uiI18n.t('app.share_resource_bb567af0')}</DialogTitle>
                    <DialogDescription>
                        {uiI18n.t('app.share_a_custom_subtitle_or_server_for_a4147ea6')} <span className="text-foreground font-medium">{animeName} {uiI18n.t('app.ep_e8c98981')} {episodeNumber})</span>.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4 px-6 overflow-y-auto custom-scrollbar">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">{uiI18n.t('app.type_3deb7456')}</label>
                        <div className="grid grid-cols-3 gap-2">
                            <Button
                                variant={type === 'subtitle' ? 'default' : 'outline'}
                                onClick={() => setType('subtitle')}
                                className="gap-2 rounded-xl h-12"
                            >
                                <Subtitles className="w-4 h-4" /> {uiI18n.t('app.subtitle_e159d05a')}
                            </Button>
                            <Button
                                variant={type === 'server' ? 'default' : 'outline'}
                                onClick={() => setType('server')}
                                className="gap-2 rounded-xl h-12"
                            >
                                <Server className="w-4 h-4" /> {uiI18n.t('app.server_cb0cb170')}
                            </Button>
                            <Button
                                variant={type === 'magnet' ? 'default' : 'outline'}
                                onClick={() => setType('magnet')}
                                className="gap-2 rounded-xl h-12"
                            >
                                <Magnet className="w-4 h-4" /> {uiI18n.t('app.magnet_d7f87f22')}
                            </Button>
                            <Button
                                variant={type === 'torrent' ? 'default' : 'outline'}
                                onClick={() => setType('torrent')}
                                className="gap-2 rounded-xl h-12"
                            >
                                <Server className="w-4 h-4" /> {uiI18n.t('app.torrent_url_84950dae')}
                            </Button>
                            <Button
                                variant={type === 'external' ? 'default' : 'outline'}
                                onClick={() => setType('external')}
                                className="gap-2 rounded-xl h-12 col-span-2"
                            >
                                <LinkIcon className="w-4 h-4" /> {uiI18n.t('app.external_url_83c33c78')}
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">
                            {type === 'magnet' ? uiI18n.t('app.magnet_link_a609d45b') : type === 'torrent' ? uiI18n.t('app.torrent_file_url_ae34c9eb') : uiI18n.t('app.resource_url_8e78cff6')}
                        </label>
                        <Input
                            placeholder={type === 'magnet' ? uiI18n.t('app.magnet_xt_urn_btih_85fb9918') : 'https://...'}
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            className="bg-white/5 border-white/10"
                        />
                        <p className="text-[10px] text-muted-foreground italic">{uiI18n.t('app.supports_subtitle_stream_magnet_and_torrent_file_e8484ac8')}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground">{uiI18n.t('app.language_89b86ab0')}</label>
                            <Input
                                placeholder={uiI18n.t('app.e_g_english_d15f7906')}
                                value={lang}
                                onChange={(e) => setLang(e.target.value)}
                                className="bg-white/5 border-white/10"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground">{uiI18n.t('app.label_74341e3c')}</label>
                            <Input
                                placeholder={uiI18n.t('app.e_g_gogoanime_8937429e')}
                                value={label}
                                onChange={(e) => setLabel(e.target.value)}
                                className="bg-white/5 border-white/10"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground">{uiI18n.t('app.quality_a60f2c73')}</label>
                            <Input placeholder="e.g. 1080p" value={quality} onChange={(e) => setQuality(e.target.value)} className="bg-white/5 border-white/10" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground">{uiI18n.t('app.source_6da13add')}</label>
                            <Input placeholder={uiI18n.t('app.e_g_bd_web_dl_e830f2e5')} value={source} onChange={(e) => setSource(e.target.value)} className="bg-white/5 border-white/10" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground">{uiI18n.t('app.codec_a336769a')}</label>
                            <Input placeholder={uiI18n.t('app.e_g_x265_hevc_de71c23a')} value={codec} onChange={(e) => setCodec(e.target.value)} className="bg-white/5 border-white/10" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground">{uiI18n.t('app.audio_acdac205')}</label>
                            <Input placeholder={uiI18n.t('app.e_g_dual_audio_52023cfb')} value={audio} onChange={(e) => setAudio(e.target.value)} className="bg-white/5 border-white/10" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground">{uiI18n.t('app.subtitle_type_3f648758')}</label>
                            <Input placeholder={uiI18n.t('app.e_g_multi_subs_8b664a63')} value={subtitleType} onChange={(e) => setSubtitleType(e.target.value)} className="bg-white/5 border-white/10" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground">{uiI18n.t('app.episode_range_7e331bbb')}</label>
                            <Input placeholder="e.g. S01E01-S01E12" value={episodeRange} onChange={(e) => setEpisodeRange(e.target.value)} className="bg-white/5 border-white/10" />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">{uiI18n.t('app.release_group_5590bdc1')}</label>
                        <Input placeholder={uiI18n.t('app.e_g_erai_raws_b25ebd2b')} value={releaseGroup} onChange={(e) => setReleaseGroup(e.target.value)} className="bg-white/5 border-white/10" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">{uiI18n.t('app.notes_70440046')}</label>
                        <Textarea placeholder={uiI18n.t('app.any_extra_metadata_or_verification_notes_65cf5e9c')} value={notes} onChange={(e) => setNotes(e.target.value)} className="bg-white/5 border-white/10 min-h-[90px]" />
                    </div>

                    {type === 'server' && (
                        <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
                            <div className="space-y-0.5">
                                <label className="text-sm font-medium">{uiI18n.t('app.is_embed_38f803df')}</label>
                                <p className="text-[10px] text-muted-foreground">{uiI18n.t('app.toggle_this_if_the_url_is_an_iframe_embed_link_p_7c07983f')}</p>
                            </div>
                            <Switch checked={isEmbed} onCheckedChange={setIsEmbed} />
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2 sm:gap-0 p-6 border-t border-white/5">
                    <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>{uiI18n.t('app.cancel_77dfd213')}</Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={isSubmitting || !user}
                        className="rounded-xl shadow-lg shadow-primary/20 font-black px-8"
                    >
                        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        {uiI18n.t('app.submit_for_review_123f6c26')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
