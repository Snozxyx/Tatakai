import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Background } from '@/components/layout/Background';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { Button } from '@/components/ui/button';
import { ArrowLeft, User, Star, MapPin, Zap, Shield, Users, AlertCircle, Heart, ExternalLink } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import {
    fetchCharacterById,
    searchCharacters,
    CharacterDetail,
    fetchJikanCharacter,
    searchJikanCharacters,
    JikanCharacterFullResponse
} from '@/lib/api';
import { useMemo } from 'react';
import { motion } from 'framer-motion';

export default function CharacterPage() {
    const { charname } = useParams<{ charname: string }>();
    const navigate = useNavigate();
    const location = useLocation();

    // Get name from query params for display fallback
    const { fallbackName } = useMemo(() => {
        const searchParams = new URLSearchParams(location.search);
        return {
            fallbackName: searchParams.get('name')
        };
    }, [location.search]);

    // Determine if the charname is a numeric ID (MAL character ID)
    const isNumericId = useMemo(() => {
        return charname ? /^\d+$/.test(charname) : false;
    }, [charname]);

    const isExternalCharacterId = useMemo(() => {
        return charname ? /^ext-\d+$/i.test(charname) : false;
    }, [charname]);

    // Determine if it's a MongoDB ObjectID
    const isMongoId = useMemo(() => {
        return charname ? /^[0-9a-fA-F]{24}$/.test(charname) : false;
    }, [charname]);

    const normalizeNameForMatch = (value: string) =>
        value
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();

    const namesLikelyMatch = (left?: string | null, right?: string | null) => {
        const normalizedLeft = normalizeNameForMatch(String(left || ''));
        const normalizedRight = normalizeNameForMatch(String(right || ''));

        if (!normalizedLeft || !normalizedRight) return false;
        if (normalizedLeft === normalizedRight) return true;
        if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) return true;

        const leftTokens = new Set(normalizedLeft.split(' ').filter((token) => token.length > 2));
        const rightTokens = normalizedRight.split(' ').filter((token) => token.length > 2);
        const overlapCount = rightTokens.filter((token) => leftTokens.has(token)).length;

        return overlapCount >= Math.min(2, rightTokens.length);
    };

    const enrichInternalCharacterWithJikan = async (character: CharacterDetail): Promise<CharacterDetail> => {
        const image = String(character?.image || '').trim();
        const description = String(character?.description || '').trim();
        const hasSyntheticDescription = /is known as .*occupation:/i.test(description);

        const needsImage = !image || image === '/placeholder.svg';
        const needsDescription = !description || description.length < 120 || hasSyntheticDescription;

        if (!needsImage && !needsDescription) return character;

        const nameQuery = String(character?.name || fallbackName || charname || '').trim();
        if (!nameQuery) return character;

        try {
            const response = await searchJikanCharacters(nameQuery, 1);
            const candidate = Array.isArray(response?.data) ? response.data[0] : undefined;
            if (!candidate) return character;

            const candidateImage =
                candidate.images?.jpg?.image_url ||
                candidate.images?.webp?.image_url ||
                '';
            const candidateAbout = String(candidate.about || '').trim();

            return {
                ...character,
                image: needsImage && candidateImage ? candidateImage : character.image,
                description: needsDescription && candidateAbout ? candidateAbout : character.description,
            };
        } catch {
            return character;
        }
    };

    // Fetch from Jikan API for numeric IDs
    const { data: jikanCharacter, isLoading: jikanLoading, error: jikanError } = useQuery({
        queryKey: ['jikan-character', charname],
        queryFn: async () => {
            if (!charname || !isNumericId) return null;
            const malId = parseInt(charname, 10);
            const response = await fetchJikanCharacter(malId);

            if (fallbackName && !namesLikelyMatch(response?.data?.name, fallbackName)) {
                return null;
            }

            return response;
        },
        enabled: isNumericId && !isExternalCharacterId,
        retry: 1
    });

    // Fetch from internal API for MongoDB IDs or name search
    const { data: internalCharacter, isLoading: internalLoading, error: internalError } = useQuery({
        queryKey: ['character', charname, fallbackName],
        queryFn: async () => {
            if (!charname) throw new Error('Character name/ID required');

            if (isExternalCharacterId) {
                const response = await fetchCharacterById(charname);
                if (response.success) return enrichInternalCharacterWithJikan(response.data);
            }

            if (isNumericId) {
                const numericNameHint = String(fallbackName || '').trim();
                if (!numericNameHint) return null;

                try {
                    const directLookup = await fetchCharacterById(charname);
                    if (directLookup.success && namesLikelyMatch(directLookup.data?.name, numericNameHint)) {
                        return enrichInternalCharacterWithJikan(directLookup.data);
                    }
                } catch {
                    // Fall through to name-based search.
                }

                const numericSearch = await searchCharacters(numericNameHint);
                if (numericSearch.success && numericSearch.data.length > 0) {
                    const detailedResp = await fetchCharacterById(numericSearch.data[0]._id);
                    if (detailedResp.success) return enrichInternalCharacterWithJikan(detailedResp.data);
                }

                return null;
            }

            // Try as MongoDB ID first
            if (isMongoId) {
                try {
                    const response = await fetchCharacterById(charname);
                    if (response.success) return enrichInternalCharacterWithJikan(response.data);
                } catch (e) {
                    console.warn('ID lookup failed, falling back to name search');
                }
            }

            // Fallback: search by name
            const searchTerms = fallbackName || charname.replace(/-/g, ' ');
            const searchResponse = await searchCharacters(searchTerms);

            if (searchResponse.success && searchResponse.data.length > 0) {
                const firstResultId = searchResponse.data[0]._id;
                const detailedResp = await fetchCharacterById(firstResultId);
                if (detailedResp.success) return enrichInternalCharacterWithJikan(detailedResp.data);
            }

            // Final attempt with raw charname
            if (fallbackName && searchTerms !== charname) {
                const retrySearch = await searchCharacters(charname);
                if (retrySearch.success && retrySearch.data.length > 0) {
                    const detailedResp = await fetchCharacterById(retrySearch.data[0]._id);
                    if (detailedResp.success) return enrichInternalCharacterWithJikan(detailedResp.data);
                }
            }
            throw new Error('Character not found');
        },
        enabled:
            !isNumericId ||
            isExternalCharacterId ||
            Boolean(fallbackName && !jikanLoading && !jikanCharacter),
        retry: 1
    });

    const hasCharacterData = Boolean((isNumericId && jikanCharacter) || internalCharacter);
    const isLoading = hasCharacterData ? false : (jikanLoading || internalLoading);
    const error = hasCharacterData
        ? null
        : isNumericId
            ? (jikanError || internalError)
            : internalError;

    // Render Jikan character data
    const renderJikanCharacter = (data: JikanCharacterFullResponse) => {
        const char = data.data;
        const animeAppearances = char.anime?.slice(0, 6) || [];
        const voiceActors = char.voices?.slice(0, 4) || [];

        return (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 mb-16">
                    {/* Profile Image */}
                    <div className="w-full lg:w-80 space-y-6">
                        <div className="aspect-[3/4] rounded-3xl overflow-hidden border border-border/50 bg-muted/20 shadow-2xl relative group">
                            <img
                                src={char.images.jpg.image_url}
                                alt={char.name}
                                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60"></div>
                        </div>

                        {/* Stats Card */}
                        <div className="p-4 rounded-2xl bg-card/40 border border-border/30 backdrop-blur-md space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground uppercase tracking-widest font-bold">Favorites</span>
                                <span className="flex items-center gap-1 text-pink-400 font-bold">
                                    <Heart className="w-4 h-4 fill-current" />
                                    {char.favorites.toLocaleString()}
                                </span>
                            </div>
                            <a
                                href={char.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-2 w-full py-2 rounded-xl bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors text-sm font-medium"
                            >
                                <ExternalLink className="w-4 h-4" />
                                View on MyAnimeList
                            </a>
                        </div>
                    </div>

                    {/* Info */}
                    <div className="flex-1 space-y-8">
                        <div>
                            <div className="flex flex-wrap items-center gap-3 mb-4">
                                {char.nicknames?.slice(0, 3).map(nick => (
                                    <span key={nick} className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold uppercase tracking-widest">
                                        {nick}
                                    </span>
                                ))}
                            </div>
                            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-8xl font-black font-display tracking-tight mb-2 bg-gradient-to-b from-white to-gray-500 bg-clip-text text-transparent">
                                {char.name}
                            </h1>
                            {char.name_kanji && (
                                <p className="text-2xl text-muted-foreground font-medium mb-6">{char.name_kanji}</p>
                            )}
                            {char.about && (
                                <p className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-4xl">
                                    {char.about.length > 600 ? char.about.substring(0, 600) + '...' : char.about}
                                </p>
                            )}
                        </div>

                        {/* Anime Appearances */}
                        {animeAppearances.length > 0 && (
                            <div className="space-y-4">
                                <h3 className="text-xl font-bold uppercase tracking-wider flex items-center gap-2">
                                    <Star className="w-5 h-5 text-yellow-500" />
                                    Anime Appearances
                                </h3>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                    {animeAppearances.map(appearance => (
                                        <a
                                            key={appearance.anime.mal_id}
                                            href={`https://myanimelist.net/anime/${appearance.anime.mal_id}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-3 p-3 rounded-xl bg-card/30 border border-border/20 hover:bg-card/50 transition-colors group"
                                        >
                                            <img
                                                src={appearance.anime.images.jpg.image_url}
                                                alt={appearance.anime.title}
                                                className="w-12 h-16 object-cover rounded-lg"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium line-clamp-2 group-hover:text-primary transition-colors">
                                                    {appearance.anime.title}
                                                </p>
                                                <p className="text-xs text-muted-foreground capitalize">{appearance.role}</p>
                                            </div>
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Voice Actors */}
                        {voiceActors.length > 0 && (
                            <div className="space-y-4">
                                <h3 className="text-xl font-bold uppercase tracking-wider flex items-center gap-2">
                                    <Users className="w-5 h-5 text-blue-500" />
                                    Voice Actors
                                </h3>
                                <div className="flex flex-wrap gap-3">
                                    {voiceActors.map(va => (
                                        <div
                                            key={va.person.mal_id}
                                            className="flex items-center gap-3 px-4 py-2 rounded-xl bg-blue-500/5 border border-blue-500/20"
                                        >
                                            <img
                                                src={va.person.images.jpg.image_url}
                                                alt={va.person.name}
                                                className="w-10 h-10 rounded-full object-cover"
                                            />
                                            <div>
                                                <p className="text-sm font-medium">{va.person.name}</p>
                                                <p className="text-xs text-muted-foreground">{va.language}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // Render internal API character data
    const renderInternalCharacter = (character: CharacterDetail) => (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex flex-col lg:flex-row gap-12 mb-16">
                {/* Profile Image */}
                <div className="w-full lg:w-80 space-y-6">
                    <div className="aspect-[3/4] rounded-3xl overflow-hidden border border-border/50 bg-muted/20 shadow-2xl relative group">
                        {character?.image ? (
                            <img
                                src={character.image}
                                alt={character.name}
                                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center">
                                <User className="w-24 h-24 text-muted-foreground/30" />
                            </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60"></div>
                    </div>

                    {character?.status && (
                        <div className="flex items-center justify-between p-4 rounded-2xl bg-card/40 border border-border/30 backdrop-blur-md">
                            <span className="text-sm text-muted-foreground uppercase tracking-widest font-bold">Status</span>
                            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-tight ${character.status.toLowerCase() === 'alive' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                                }`}>
                                {character.status}
                            </span>
                        </div>
                    )}
                </div>

                {/* Info */}
                <div className="flex-1 space-y-10">
                    <div>
                        <div className="flex items-center gap-3 mb-4">
                            <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold uppercase tracking-widest">
                                {character?.anime}
                            </span>
                            {character?.gender && (
                                <span className="px-3 py-1 rounded-full bg-muted/30 text-muted-foreground text-xs font-bold uppercase tracking-widest">
                                    {character.gender}
                                </span>
                            )}
                        </div>
                        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-8xl font-black font-display tracking-tight mb-6 bg-gradient-to-b from-white to-gray-500 bg-clip-text text-transparent">
                            {character?.name}
                        </h1>
                        <p className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-4xl font-medium">
                            {character?.description}
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {character?.country && (
                            <div className="p-4 rounded-xl bg-card/30 border border-border/20 flex items-center gap-4">
                                <div className="p-2 rounded-lg bg-orange-500/10 text-orange-500">
                                    <MapPin className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Village/Country</p>
                                    <p className="font-semibold">{character.country}</p>
                                </div>
                            </div>
                        )}
                        {character?.clan && (
                            <div className="p-4 rounded-xl bg-card/30 border border-border/20 flex items-center gap-4">
                                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                                    <Users className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Clan/Family</p>
                                    <p className="font-semibold">{character.clan}</p>
                                </div>
                            </div>
                        )}
                        {character?.age && (
                            <div className="p-4 rounded-xl bg-card/30 border border-border/20 flex items-center gap-4">
                                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500">
                                    <User className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Age</p>
                                    <p className="font-semibold">{character.age}</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Abilities & Powers */}
                    <div className="space-y-8">
                        {(character?.powers?.length || 0) > 0 && (
                            <div className="space-y-4">
                                <div className="flex items-center gap-2">
                                    <Zap className="w-5 h-5 text-yellow-500" />
                                    <h3 className="text-xl font-bold uppercase tracking-wider">Powers</h3>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {character?.powers?.map(power => (
                                        <span key={power} className="px-4 py-2 rounded-xl bg-yellow-500/5 border border-yellow-500/20 text-yellow-200 text-sm font-medium">
                                            {power}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {(character?.abilities?.length || 0) > 0 && (
                            <div className="space-y-4">
                                <div className="flex items-center gap-2">
                                    <Shield className="w-5 h-5 text-blue-500" />
                                    <h3 className="text-xl font-bold uppercase tracking-wider">Abilities</h3>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {character?.abilities?.map(ability => (
                                        <span key={ability} className="px-4 py-2 rounded-xl bg-blue-500/5 border border-blue-500/20 text-blue-200 text-sm font-medium">
                                            {ability}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
            <Background />
            <Sidebar />

            <main className="relative z-10 pl-4 md:pl-32 pr-4 md:pr-6 py-4 md:py-6 max-w-[1400px] mx-auto pb-24 md:pb-6">
                <div className="flex items-center gap-4 mb-8">
                    <button
                        onClick={() => navigate(-1)}
                        className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors group"
                    >
                        <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                        <span>Back</span>
                    </button>
                </div>

                {isLoading ? (
                    <div className="flex flex-col items-center justify-center p-24 gap-4">
                        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-primary"></div>
                        <p className="text-muted-foreground italic animate-pulse">Summoning character data...</p>
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center p-24 text-center">
                        <AlertCircle className="w-16 h-16 text-destructive mb-4" />
                        <h2 className="text-2xl font-bold mb-2">Character Not Found</h2>
                        <p className="text-muted-foreground mb-8">
                            We couldn't find the character "{fallbackName || charname?.replace(/-/g, ' ')}".
                        </p>
                        <Button onClick={() => navigate(-1)}>Go Back</Button>
                    </div>
                ) : (
                    <>
                        {isNumericId && jikanCharacter ? (
                            renderJikanCharacter(jikanCharacter)
                        ) : internalCharacter ? (
                            renderInternalCharacter(internalCharacter)
                        ) : (
                            <div className="flex flex-col items-center justify-center p-24 text-center">
                                <AlertCircle className="w-16 h-16 text-muted-foreground/30 mb-4" />
                                <h2 className="text-2xl font-bold mb-2">Character Not Found</h2>
                                <p className="text-muted-foreground mb-8">No character data available.</p>
                                <Button onClick={() => navigate(-1)}>Go Back</Button>
                            </div>
                        )}
                    </>
                )}
            </main>

            <MobileNav />
        </div>
    );
}
