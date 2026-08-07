import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { Background } from '@/components/layout/Background';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { Button } from '@/components/ui/button';
import { 
    ArrowLeft, User, Star, MapPin, Zap, Shield, Users, 
    AlertCircle, Heart, ExternalLink, Sparkles, BookOpen, 
    Film, MessageSquare, Share2, Info, ChevronRight, Play
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import {
    fetchCharacterById,
    searchCharacters,
    CharacterDetail,
    fetchJikanCharacter,
    searchJikanCharacters,
    JikanCharacterFullResponse,
    getProxiedImageUrl
} from '@/lib/api';
import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useIsDesktopApp } from '@/hooks/ui/useIsNativeApp';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { cn } from '@/lib/utils';

// AniList Character GraphQL
const ANILIST_CHAR_QUERY = `
query ($id: Int) {
  Character(id: $id) {
    id
    name { full native alternative }
    image { large }
    description(asHtml: false)
    gender
    dateOfBirth { year month day }
    age
    bloodType
    favourites
    media(sort: START_DATE_DESC) {
      edges {
        node { id title { romaji english } coverImage { large } type format }
        characterRole
      }
    }
  }
}
`;

export default function CharacterPage() {
    const { charname } = useParams<{ charname: string }>();
    const navigate = useNavigate();
    const isDesktopApp = useIsDesktopApp();
    const location = useLocation();
    const [isLiked, setIsLiked] = useState(false);

    const { fallbackName } = useMemo(() => {
        const searchParams = new URLSearchParams(location.search);
        return { fallbackName: searchParams.get('name') };
    }, [location.search]);

    const isNumericId = useMemo(() => charname ? /^\d+$/.test(charname) : false, [charname]);

    // Fetch from AniList for numeric IDs (common for modern character tracking)
    const { data: aniListChar, isLoading: aniLoading } = useQuery({
        queryKey: ['anilist-character', charname, fallbackName],
        queryFn: async () => {
            if (!charname) return null;
            
            // 1. Try by ID if numeric
            if (isNumericId) {
                const res = await fetch('https://graphql.anilist.co', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: ANILIST_CHAR_QUERY, variables: { id: parseInt(charname) } })
                });
                const json = await res.json();
                if (json?.data?.Character) return json.data.Character;
            }

            // 2. Try by name (using fallbackName or charname slug)
            const searchQuery = fallbackName || charname.replace(/-/g, ' ');
            const searchGql = `
                query ($search: String) {
                    Character(search: $search) {
                        id
                        name { full native alternative }
                        image { large }
                        description(asHtml: false)
                        gender
                        dateOfBirth { year month day }
                        age
                        bloodType
                        favourites
                        media(sort: START_DATE_DESC) {
                            edges {
                                node { id title { romaji english } coverImage { large } type format }
                                characterRole
                            }
                        }
                    }
                }
            `;
            const searchRes = await fetch('https://graphql.anilist.co', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: searchGql, variables: { search: searchQuery } })
            });
            const searchJson = await searchRes.json();
            return searchJson?.data?.Character;
        },
        staleTime: 1000 * 60 * 60
    });

    const isLoading = aniLoading;

    if (isLoading) {
        return (
            <div className="min-h-screen bg-background text-foreground">
                <Background />
                <main className={cn("relative z-10 p-6 flex flex-col items-center justify-center min-h-[80vh]", isDesktopApp ? "pl-6" : "pl-6 md:pl-32")}>
                    <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mb-6" />
                    <p className="text-xl font-black uppercase tracking-[0.3em] animate-pulse">Synchronizing Soul...</p>
                </main>
            </div>
        );
    }

    if (!aniListChar) {
        return (
            <div className="min-h-screen bg-background text-foreground">
                <Background />
                <main className={cn("relative z-10 p-6", isDesktopApp ? "pl-6" : "pl-6 md:pl-32")}>
                    <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-muted-foreground hover:text-white mb-12 transition-colors">
                        <ArrowLeft className="w-5 h-5" /> Back
                    </button>
                    <div className="text-center py-24 space-y-6">
                        <AlertCircle className="w-20 h-20 text-destructive mx-auto opacity-20" />
                        <h1 className="text-4xl font-black">Character Not Found</h1>
                        <p className="text-muted-foreground max-w-md mx-auto">We couldn't locate this character in the universal registry.</p>
                        <Button onClick={() => navigate('/')} variant="outline" className="rounded-xl px-8 h-12">Return Home</Button>
                    </div>
                </main>
            </div>
        );
    }

    const char = aniListChar;
    const mediaRelations = char.media?.edges || [];

    return (
        <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
            <Background />
            <Sidebar />

            <main className={cn("relative z-10 pr-6 py-6 max-w-[1400px] mx-auto pb-24", isDesktopApp ? "pl-6" : "pl-6 md:pl-32")}>
                {/* Hero / Header Section */}
                <div className="flex flex-col lg:flex-row gap-12 lg:gap-20 mb-24 items-start">
                    {/* Left: Poster and Stats */}
                    <div className="w-full lg:w-[400px] space-y-8 flex-shrink-0">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="relative group rounded-[3rem] overflow-hidden border border-white/10 shadow-2xl shadow-primary/10"
                        >
                            <img 
                                src={char.image.large} 
                                alt={char.name.full} 
                                className="w-full aspect-[3/4.5] object-cover transition-transform duration-700 group-hover:scale-110" 
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60" />
                            
                            <button 
                                onClick={() => setIsLiked(!isLiked)}
                                className={cn(
                                    "absolute top-6 right-6 w-14 h-14 rounded-2xl flex items-center justify-center backdrop-blur-2xl border border-white/20 transition-all active:scale-90 shadow-xl",
                                    isLiked ? "bg-red-500 text-white border-red-400" : "bg-black/40 text-white/60 hover:text-white"
                                )}
                            >
                                <Heart className={cn("w-6 h-6", isLiked && "fill-current")} />
                            </button>
                        </motion.div>

                        <div className="grid grid-cols-2 gap-4">
                            <GlassPanel className="p-6 rounded-[2rem] bg-white/[0.02] border-white/5 flex flex-col items-center text-center">
                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Favourites</p>
                                <p className="text-2xl font-black text-primary">{(char.favourites || 0).toLocaleString()}</p>
                            </GlassPanel>
                            <GlassPanel className="p-6 rounded-[2rem] bg-white/[0.02] border-white/5 flex flex-col items-center text-center">
                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Gender</p>
                                <p className="text-2xl font-black capitalize">{char.gender || '?'}</p>
                            </GlassPanel>
                        </div>
                    </div>

                    {/* Right: Info and Description */}
                    <div className="flex-1 space-y-12">
                        <div className="space-y-6">
                            <motion.div 
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="flex items-center gap-3 text-primary text-xs font-black uppercase tracking-[0.2em] bg-primary/10 w-fit px-4 py-2 rounded-full border border-primary/20"
                            >
                                <Sparkles className="w-4 h-4" />
                                Legendary Character
                            </motion.div>
                            
                            <div className="space-y-2">
                                <h1 className="text-6xl md:text-8xl font-black tracking-tighter leading-none">
                                    {char.name.full}
                                </h1>
                                <p className="text-2xl md:text-4xl text-muted-foreground font-medium italic opacity-50">
                                    {char.name.native}
                                </p>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                {char.name.alternative?.slice(0, 4).map((alt: string) => (
                                    <span key={alt} className="px-3 py-1 rounded-lg bg-white/5 border border-white/5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                        {alt}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-primary">
                                <Info className="w-4 h-4" />
                                Biography
                            </div>
                            <p className="text-lg text-muted-foreground leading-relaxed font-medium whitespace-pre-line max-h-[400px] overflow-y-auto pr-4 custom-scrollbar">
                                {char.description || "No biography available for this character."}
                            </p>
                        </div>

                        {/* Extra Details */}
                        <div className="flex flex-wrap gap-8">
                            {char.age && (
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground opacity-60">Age</p>
                                    <p className="font-bold text-lg">{char.age}</p>
                                </div>
                            )}
                            {char.bloodType && (
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground opacity-60">Blood Type</p>
                                    <p className="font-bold text-lg">{char.bloodType}</p>
                                </div>
                            )}
                            {char.dateOfBirth?.month && (
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground opacity-60">Birthday</p>
                                    <p className="font-bold text-lg">{char.dateOfBirth.day}/{char.dateOfBirth.month}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Media Relations Section */}
                <div className="space-y-10">
                    <div className="flex items-center justify-between">
                        <div className="space-y-2">
                            <h2 className="text-4xl font-black tracking-tight">Media <span className="text-primary italic">Appearances</span></h2>
                            <p className="text-muted-foreground font-medium">Shows and manga where this character plays a role.</p>
                        </div>
                        <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-primary border border-white/5">
                            <Film className="w-6 h-6" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                        {mediaRelations.map((rel: any, idx: number) => (
                            <motion.div
                                key={rel.node.id}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                className="group cursor-pointer"
                                onClick={() => navigate(`/${rel.node.type === 'ANIME' ? 'watch' : 'manga'}/${rel.node.id}`)}
                            >
                                <div className="relative aspect-[3/4.5] rounded-2xl overflow-hidden border border-white/5 mb-3">
                                    <img 
                                        src={rel.node.coverImage.large} 
                                        alt={rel.node.title.romaji} 
                                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" 
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <div className="w-12 h-12 rounded-full bg-primary/80 backdrop-blur-md flex items-center justify-center text-white">
                                            <Play className="w-5 h-5 fill-current" />
                                        </div>
                                    </div>
                                    <div className="absolute top-2 right-2 px-2 py-1 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 text-[8px] font-black uppercase tracking-widest text-white">
                                        {rel.characterRole}
                                    </div>
                                </div>
                                <h4 className="font-bold text-xs truncate group-hover:text-primary transition-colors">
                                    {rel.node.title.romaji}
                                </h4>
                                <p className="text-[10px] text-muted-foreground font-medium capitalize">
                                    {rel.node.format?.replace(/_/g, ' ')}
                                </p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </main>

            <MobileNav />
        </div>
    );
}
