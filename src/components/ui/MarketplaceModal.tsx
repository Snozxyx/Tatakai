import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StreamingSource } from "@/lib/api";
import { Search, Users, Globe, Share2, Server, Subtitles } from "lucide-react";

interface MarketplaceModalProps {
    isOpen: boolean;
    onClose: () => void;
    sources: StreamingSource[];
    animeName: string;
    episodeNumber?: number;
    onSelectSource: (source: StreamingSource) => void;
    onOpenSubmit: () => void;
}

export function MarketplaceModal({
    isOpen,
    onClose,
    sources,
    animeName,
    episodeNumber,
    onSelectSource,
    onOpenSubmit
}: MarketplaceModalProps) {
    const [searchQuery, setSearchQuery] = useState("");

    const filteredSources = useMemo(() => {
        if (!searchQuery) return sources;
        const query = searchQuery.toLowerCase();
        return sources.filter(s =>
            s.providerName?.toLowerCase().includes(query) ||
            s.server?.toLowerCase().includes(query) ||
            s.language?.toLowerCase().includes(query)
        );
    }, [sources, searchQuery]);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-hidden flex flex-col bg-background/95 backdrop-blur-xl border-white/10 shadow-2xl p-0">
                <DialogHeader className="p-6 pb-0">
                    <div className="flex items-center justify-between gap-4 mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                <Globe className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                                <DialogTitle className="text-xl font-bold">Community Marketplace</DialogTitle>
                                <DialogDescription className="text-xs">
                                    Approved community links for {animeName} ep {episodeNumber}
                                </DialogDescription>
                            </div>
                        </div>
                        <Button
                            onClick={onOpenSubmit}
                            size="sm"
                            className="rounded-xl font-black uppercase tracking-widest text-[10px] gap-2 shadow-lg shadow-primary/20"
                        >
                            <Share2 className="w-3.5 h-3.5" /> Share New
                        </Button>
                    </div>

                    <div className="relative mb-6">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by contributor or provider..."
                            className="bg-white/5 border-white/10 pl-10 h-11 rounded-xl"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-6 pt-0 space-y-3 custom-scrollbar">
                    {filteredSources.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {filteredSources.map((source) => {
                                const contributor = source.server?.replace('Shared by ', '') || 'Anonymous';
                                return (
                                    <button
                                        key={source.langCode}
                                        onClick={() => {
                                            onSelectSource(source);
                                            onClose();
                                        }}
                                        className="flex flex-col gap-3 p-4 rounded-2xl border border-white/5 bg-white/5 hover:bg-white/10 hover:border-primary/30 transition-all text-left group relative overflow-hidden"
                                    >
                                        <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                                                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                            </div>
                                        </div>

                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                {source.isEmbed ? <Globe className="w-3.5 h-3.5 text-primary" /> : <Server className="w-3.5 h-3.5 text-muted-foreground" />}
                                                <span className="text-sm font-bold truncate leading-tight">
                                                    {source.providerName}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] font-medium">
                                                <Users className="w-3 h-3" />
                                                <div className="flex items-center gap-1">
                                                    <span>Shared by</span>
                                                    <Link
                                                        to={`/@${source.contributorUsername || 'user'}`}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="text-primary hover:underline font-bold"
                                                    >
                                                        {source.contributorDisplay || 'Community'}
                                                    </Link>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between pt-2 border-t border-white/5 mt-auto">
                                            <div className="flex items-center gap-2">
                                                <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[9px] font-black uppercase tracking-widest">
                                                    {source.language}
                                                </span>
                                                {source.providerName?.includes('(Pending)') && (
                                                    <span className="px-1.5 py-0.5 rounded bg-muted text-[8px] text-muted-foreground font-bold uppercase">Pending</span>
                                                )}
                                            </div>
                                            {source.isM3U8 && (
                                                <span className="text-[8px] font-mono opacity-40 uppercase tracking-tighter">HLS Player</span>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="py-12 text-center border border-dashed border-white/5 rounded-2xl bg-white/5">
                            <Search className="w-10 h-10 text-muted-foreground/20 mx-auto mb-4" />
                            <p className="text-sm font-medium text-muted-foreground">No sources found for "{searchQuery}"</p>
                            <p className="text-[10px] text-muted-foreground mt-1">Try a different search term or share a new link!</p>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
