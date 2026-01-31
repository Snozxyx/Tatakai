import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useAnimelokSearch } from "@/hooks/useAnimelok";
import {
    Globe, Plus, Trash2, Edit3, Save, X,
    Film, PlusCircle, Search, Loader2, ChevronRight, Hash
} from "lucide-react";

export function LanguageManager() {
    const queryClient = useQueryClient();
    const [isAddingLanguage, setIsAddingLanguage] = useState(false);
    const [newLangName, setNewLangName] = useState("");
    const [newLangCode, setNewLangCode] = useState("");
    const [newLangPoster, setNewLangPoster] = useState("");

    const [selectedLangId, setSelectedLangId] = useState<string | null>(null);
    const [isAddingAnime, setIsAddingAnime] = useState(false);
    const [animeSearchQuery, setAnimeSearchQuery] = useState("");
    const [animeAiringTime, setAnimeAiringTime] = useState("");

    const { data: languages, isLoading: loadingLangs } = useQuery({
        queryKey: ['admin_custom_languages'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('custom_languages')
                .select(`
          *,
          anime:custom_language_anime(*)
        `)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data;
        }
    });

    const createLanguage = useMutation({
        mutationFn: async () => {
            const { error } = await supabase
                .from('custom_languages')
                .insert({
                    name: newLangName,
                    code: newLangCode.toLowerCase(),
                    poster: newLangPoster
                });
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin_custom_languages'] });
            toast.success("Language added!");
            setIsAddingLanguage(false);
            setNewLangName("");
            setNewLangCode("");
            setNewLangPoster("");
        }
    });

    const deleteLanguage = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from('custom_languages').delete().eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin_custom_languages'] });
            toast.success("Language deleted");
        }
    });

    const addAnimeToLanguage = useMutation({
        mutationFn: async (anime: any) => {
            if (!selectedLangId) return;
            const { error } = await supabase
                .from('custom_language_anime')
                .insert({
                    language_id: selectedLangId,
                    anime_id: anime.id,
                    title: anime.title,
                    poster: anime.poster,
                    airing_time: animeAiringTime || 'Unknown'
                });
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin_custom_languages'] });
            toast.success("Anime added to section!");
            setIsAddingAnime(false);
            setAnimeSearchQuery("");
            setAnimeAiringTime("");
        }
    });

    const deleteAnimeFromLanguage = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from('custom_language_anime').delete().eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin_custom_languages'] });
            toast.success("Anime removed");
        }
    });

    // Anime Search logic (for adding anime)
    const { data: searchResults, isLoading: searching } = useAnimelokSearch(animeSearchQuery);

    return (
        <div className="space-y-8 pb-20">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                        <Globe className="w-6 h-6 text-primary" />
                        Language Sections
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">Manage the decentralized language system</p>
                </div>
                {!isAddingLanguage && (
                    <Button onClick={() => setIsAddingLanguage(true)} className="rounded-xl gap-2 font-bold px-6">
                        <Plus className="w-4 h-4" />
                        Add Language
                    </Button>
                )}
            </div>

            {isAddingLanguage && (
                <GlassPanel className="p-6 border-primary/20 bg-primary/5">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="font-bold flex items-center gap-2">
                            <PlusCircle className="w-5 h-5 text-primary" />
                            New Language Section
                        </h3>
                        <Button variant="ghost" size="sm" onClick={() => setIsAddingLanguage(false)}>
                            <X className="w-4 h-4" />
                        </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <div className="space-y-2">
                            <label className="text-xs font-black uppercase text-muted-foreground">Name</label>
                            <Input placeholder="e.g. Hindi Dubbed" value={newLangName} onChange={(e) => setNewLangName(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-black uppercase text-muted-foreground">Slug Code</label>
                            <Input placeholder="e.g. hindi" value={newLangCode} onChange={(e) => setNewLangCode(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-black uppercase text-muted-foreground">Banner URL (Optional)</label>
                            <Input placeholder="https://..." value={newLangPoster} onChange={(e) => setNewLangPoster(e.target.value)} />
                        </div>
                    </div>
                    <div className="flex justify-end gap-3">
                        <Button variant="ghost" onClick={() => setIsAddingLanguage(false)}>Cancel</Button>
                        <Button onClick={() => createLanguage.mutate()} disabled={!newLangName || !newLangCode || createLanguage.isPending}>
                            Create Section
                        </Button>
                    </div>
                </GlassPanel>
            )}

            {loadingLangs ? (
                <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 animate-spin text-primary opacity-50" /></div>
            ) : (
                <div className="grid grid-cols-1 gap-6">
                    {languages?.map((lang: any) => (
                        <GlassPanel key={lang.id} className="overflow-hidden border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all">
                            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                                <div className="flex items-center gap-4">
                                    <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center border border-primary/20">
                                        <Globe className="w-6 h-6 text-primary" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold">{lang.name}</h3>
                                        <p className="text-xs text-muted-foreground font-mono uppercase">URL SLUG: {lang.code}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button variant="ghost" size="sm" onClick={() => {
                                        setSelectedLangId(lang.id);
                                        setIsAddingAnime(true);
                                    }} className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 gap-2 font-bold rounded-xl border border-emerald-500/20">
                                        <Plus className="w-4 h-4" />
                                        Add Anime
                                    </Button>
                                    <Button variant="ghost" size="sm" className="h-10 w-10 p-0 text-muted-foreground hover:text-white">
                                        <Edit3 className="w-4 h-4" />
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => {
                                        if (confirm(`Delete ${lang.name} and all its anime?`)) deleteLanguage.mutate(lang.id);
                                    }} className="h-10 w-10 p-0 text-destructive hover:bg-destructive/10">
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>

                            <div className="p-6">
                                {lang.anime && lang.anime.length > 0 ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                        {lang.anime.map((a: any) => (
                                            <div key={a.id} className="relative group rounded-2xl overflow-hidden bg-white/5 border border-white/10 p-2 flex items-center gap-4">
                                                <img src={a.poster} alt={a.title} className="w-14 h-20 object-cover rounded-xl shadow-lg border border-white/10" />
                                                <div className="flex-1 min-w-0 pr-8">
                                                    <p className="font-bold text-sm truncate">{a.title}</p>
                                                    <p className="text-[10px] text-muted-foreground line-clamp-1">{a.airing_time}</p>
                                                </div>
                                                <button
                                                    onClick={() => deleteAnimeFromLanguage.mutate(a.id)}
                                                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/40 text-destructive opacity-0 group-hover:opacity-100 hover:bg-destructive/20 transition-all"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="py-10 text-center border-2 border-dashed border-white/5 rounded-3xl">
                                        <p className="text-muted-foreground text-sm font-medium">No anime added to this section yet.</p>
                                    </div>
                                )}
                            </div>
                        </GlassPanel>
                    ))}
                </div>
            )}

            {/* Add Anime Modal (Simple Sheet/Overlay) */}
            {isAddingAnime && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md">
                    <GlassPanel className="w-full max-w-2xl bg-background border-primary/20 shadow-2xl overflow-hidden scale-in">
                        <div className="p-6 border-b border-white/10 flex items-center justify-between">
                            <h3 className="text-xl font-bold flex items-center gap-2">
                                <Film className="w-5 h-5 text-primary" />
                                Add Anime to Section
                            </h3>
                            <Button variant="ghost" size="sm" onClick={() => setIsAddingAnime(false)}>
                                <X className="w-5 h-5" />
                            </Button>
                        </div>
                        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                            <div className="flex gap-4">
                                <div className="flex-1 space-y-2">
                                    <label className="text-xs font-black uppercase text-muted-foreground">Search Anime</label>
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                        <Input
                                            placeholder="Search on Animelok..."
                                            value={animeSearchQuery}
                                            onChange={(e) => setAnimeSearchQuery(e.target.value)}
                                            className="pl-10 h-12 rounded-xl"
                                        />
                                    </div>
                                </div>
                                <div className="w-40 space-y-2">
                                    <label className="text-xs font-black uppercase text-muted-foreground">Airing Time</label>
                                    <Input
                                        placeholder="e.g. 10:30 PM"
                                        value={animeAiringTime}
                                        onChange={(e) => setAnimeAiringTime(e.target.value)}
                                        className="h-12 rounded-xl"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-2">
                                {searching ? (
                                    <div className="flex justify-center p-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                                ) : searchResults?.animes?.map((a: any) => (
                                    <button
                                        key={a.id}
                                        onClick={() => addAnimeToLanguage.mutate(a)}
                                        className="flex items-center gap-4 p-3 rounded-2xl bg-white/5 border border-white/5 hover:border-primary/40 hover:bg-primary/5 transition-all text-left group"
                                    >
                                        <img src={a.poster} className="w-12 h-16 object-cover rounded-lg shadow-md" alt="" />
                                        <div className="flex-1">
                                            <h4 className="font-bold">{a.title}</h4>
                                            <p className="text-xs text-muted-foreground">{a.id}</p>
                                        </div>
                                        <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    </GlassPanel>
                </div>
            )}
        </div>
    );
}
