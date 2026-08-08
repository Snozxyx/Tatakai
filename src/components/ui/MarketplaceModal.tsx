import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
    fetchMarketplaceExtensions, 
    downloadExtensionKai,
    type MarketplaceExtension 
} from "@/core/extensions/marketplace-client";
import { Search, Globe, Zap, Puzzle, Download, CheckCircle2, Loader2, FolderUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { SideloadExtensionModal } from "@/components/extensions/SideloadExtensionModal";

interface MarketplaceModalProps {
    isOpen: boolean;
    onClose: () => void;
    typeFilter?: 'torrent' | 'onlinestream' | 'custom';
}

const TYPE_COLORS: Record<string, string> = {
  torrent: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  onlinestream: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  custom: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
};

const TYPE_ICONS: Record<string, any> = {
  torrent: Zap,
  onlinestream: Globe,
  custom: Puzzle,
};

export function MarketplaceModal({
    isOpen,
    onClose,
    typeFilter
}: MarketplaceModalProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [installingId, setInstallingId] = useState<string | null>(null);
    const [installError, setInstallError] = useState<string | null>(null);
    const [isSideloadOpen, setIsSideloadOpen] = useState(false);

    // Fetch marketplace extensions via TanStack Query
    const { data: extensions = [], isLoading, error } = useQuery({
        queryKey: ['marketplace-extensions', typeFilter],
        queryFn: () => fetchMarketplaceExtensions(typeFilter ? { type: typeFilter } : undefined),
        enabled: isOpen,
        staleTime: 5 * 60 * 1000, // 5 minutes
    });

    const filteredExtensions = useMemo(() => {
        if (!searchQuery) return extensions;
        const query = searchQuery.toLowerCase();
        return extensions.filter(ext =>
            ext.name.toLowerCase().includes(query) ||
            ext.description?.toLowerCase().includes(query) ||
            ext.type.toLowerCase().includes(query)
        );
    }, [extensions, searchQuery]);

    const handleInstall = async (ext: MarketplaceExtension) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const runtime = (window as any).tatakaiRuntime;
        if (!runtime?.loadKaiExtension) {
            setInstallError("Extension installation is only available in the desktop app");
            return;
        }

        setInstallingId(ext.id);
        setInstallError(null);

        try {
            // Download the .kai bundle
            const buffer = await downloadExtensionKai(ext.mainUrl);
            
            // Load the extension (skipSignatureCheck: false for marketplace extensions)
            const result = await runtime.loadKaiExtension(buffer, false);
            
            if (result.success) {
                // Success - close modal
                onClose();
            } else {
                setInstallError(result.error || "Failed to install extension");
            }
        } catch (err) {
            setInstallError(err instanceof Error ? err.message : "Failed to download extension");
        } finally {
            setInstallingId(null);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-hidden flex flex-col bg-background/95 backdrop-blur-xl border-white/10 shadow-2xl p-0">
                <DialogHeader className="p-6 pb-0">
                    <div className="flex items-center justify-between gap-3 mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                <Globe className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                                <DialogTitle className="text-xl font-bold">Extension Marketplace</DialogTitle>
                                <DialogDescription className="text-xs">
                                    Browse and install community extensions
                                </DialogDescription>
                            </div>
                        </div>

                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setIsSideloadOpen(true)}
                            className="h-9 px-4 rounded-xl bg-primary/10 border-primary/30 text-primary hover:bg-primary/20 hover:border-primary/50 text-xs font-bold gap-1.5"
                        >
                            <FolderUp className="w-4 h-4" />
                            Sideload Extension
                        </Button>
                    </div>

                    <div className="relative mb-4">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="Search extensions..."
                            className="bg-white/5 border-white/10 pl-10 h-11 rounded-xl"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    {installError && (
                        <div className="mb-4 px-4 py-2.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium">
                            {installError}
                        </div>
                    )}
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-6 pt-0 space-y-3 custom-scrollbar">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3">
                            <Loader2 className="w-8 h-8 text-primary animate-spin" />
                            <p className="text-sm text-muted-foreground font-medium">Loading extensions...</p>
                        </div>
                    ) : error ? (
                        <div className="py-12 text-center border border-dashed border-destructive/20 rounded-2xl bg-destructive/5">
                            <p className="text-sm font-medium text-destructive">Failed to load extensions</p>
                            <p className="text-[10px] text-muted-foreground mt-1">
                                {error instanceof Error ? error.message : "Unknown error"}
                            </p>
                        </div>
                    ) : filteredExtensions.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {filteredExtensions.map((ext) => {
                                const TypeIcon = TYPE_ICONS[ext.type] ?? Puzzle;
                                const isInstalling = installingId === ext.id;
                                return (
                                    <div
                                        key={ext.id}
                                        className="flex flex-col gap-3 p-4 rounded-2xl border border-white/5 bg-white/5 hover:bg-white/8 hover:border-primary/20 transition-all"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <div className={cn(
                                                    "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 border",
                                                    TYPE_COLORS[ext.type] ?? TYPE_COLORS.custom
                                                )}>
                                                    <TypeIcon className="w-4 h-4" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-bold truncate leading-tight">{ext.name}</p>
                                                    <p className="text-[10px] text-muted-foreground font-medium">v{ext.version}</p>
                                                </div>
                                            </div>
                                            {ext.signedBy && (
                                                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" aria-label="Verified" />
                                            )}
                                        </div>

                                        {ext.description && (
                                            <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                                                {ext.description}
                                            </p>
                                        )}

                                        <div className="flex items-center justify-between pt-2 border-t border-white/5 mt-auto">
                                            <div className="flex items-center gap-1.5">
                                                <span className={cn(
                                                    "px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border",
                                                    TYPE_COLORS[ext.type] ?? TYPE_COLORS.custom
                                                )}>
                                                    {ext.type}
                                                </span>
                                                {ext.nsfw && (
                                                    <span className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 text-[8px] font-bold uppercase border border-red-500/20">
                                                        18+
                                                    </span>
                                                )}
                                            </div>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={isInstalling}
                                                onClick={() => handleInstall(ext)}
                                                className="h-7 px-3 rounded-lg text-[10px] font-black uppercase tracking-widest border-white/10 hover:border-primary/40 hover:bg-primary/10 hover:text-primary transition-all gap-1.5"
                                            >
                                                {isInstalling ? (
                                                    <>
                                                        <Loader2 className="w-3 h-3 animate-spin" />
                                                        Installing...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Download className="w-3 h-3" />
                                                        Install
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="py-12 text-center border border-dashed border-white/5 rounded-2xl bg-white/5">
                            <Search className="w-10 h-10 text-muted-foreground/20 mx-auto mb-4" />
                            {searchQuery ? (
                                <>
                                    <p className="text-sm font-medium text-muted-foreground">No extensions found for "{searchQuery}"</p>
                                    <p className="text-[10px] text-muted-foreground mt-1">Try a different search term</p>
                                </>
                            ) : (
                                <>
                                    <p className="text-sm font-medium text-muted-foreground">No extensions available</p>
                                    <p className="text-[10px] text-muted-foreground mt-1">Check back later for new extensions</p>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </DialogContent>
            <SideloadExtensionModal
                isOpen={isSideloadOpen}
                onClose={() => setIsSideloadOpen(false)}
            />
        </Dialog>
    );
}
