import { useState, useCallback, useRef, useEffect } from 'react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Trash2, Save, Share2, Lock, Globe, GripVertical, X, Film, Users } from 'lucide-react';
import { useCreateTierList, useUpdateTierList, DEFAULT_TIERS, type TierListItem } from '@/hooks/useTierLists';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { searchCharacters } from '@/lib/api';

interface SearchResult {
  id: string;
  title: string;
  image: string;
  type: 'anime' | 'character';
}

interface TierListEditorProps {
  initialData?: {
    id?: string;
    name: string;
    description?: string;
    items: TierListItem[];
    is_public: boolean;
    share_code?: string;
  };
  onSave?: (data: { name: string; description?: string; items: TierListItem[]; is_public: boolean }) => void;
  onClose?: () => void;
}

function SortableAnimeCard({ item, onRemove }: { item: TierListItem; onRemove?: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.anime_id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative group w-16 h-24 rounded-lg overflow-hidden cursor-grab active:cursor-grabbing",
        isDragging && "opacity-50 z-50"
      )}
      {...attributes}
      {...listeners}
    >
      <img
        src={item.anime_image}
        alt={item.anime_title}
        className="w-full h-full object-cover"
        draggable={false}
      />
      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <GripVertical className="w-5 h-5 text-white" />
      </div>
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
        >
          <X className="w-3 h-3" />
        </button>
      )}
      <div className="absolute bottom-0 left-0 right-0 bg-black/80 p-1">
        <p className="text-[10px] text-white truncate">{item.anime_title}</p>
      </div>
    </div>
  );
}

function TierRow({
  tier,
  items,
  onRemoveItem
}: {
  tier: typeof DEFAULT_TIERS[number];
  items: TierListItem[];
  onRemoveItem: (animeId: string) => void;
}) {
  return (
    <div className="flex border border-muted rounded-lg overflow-hidden">
      <div
        className="w-16 flex-shrink-0 flex items-center justify-center font-bold text-2xl text-white"
        style={{ backgroundColor: tier.color }}
      >
        {tier.name}
      </div>
      <SortableContext items={items.map(i => i.anime_id)} strategy={rectSortingStrategy}>
        <div className="flex-1 min-h-[100px] p-2 flex flex-wrap gap-2 bg-muted/20">
          {items.map(item => (
            <SortableAnimeCard
              key={item.anime_id}
              item={item}
              onRemove={() => onRemoveItem(item.anime_id)}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

export function TierListEditor({ initialData, onSave, onClose }: TierListEditorProps) {
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [isPublic, setIsPublic] = useState(initialData?.is_public ?? true);
  const [items, setItems] = useState<TierListItem[]>(initialData?.items || []);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [searchType, setSearchType] = useState<'anime' | 'character'>('anime');

  // State for pagination
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);

  // Refs for debouncing
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSearchTimeRef = useRef<number>(0);

  const createTierList = useCreateTierList();
  const updateTierList = useUpdateTierList();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Search anime or characters using Tatakai API
  const performSearch = useCallback(async (query: string, type: 'anime' | 'character', pageNum: number) => {
    if (!query.trim() || query.length < 3) {
      setSearchResults([]);
      setHasNextPage(false);
      return;
    }

    setIsSearching(true);
    try {
      if (type === 'anime') {
        const data = await import('@/lib/api').then(mod => mod.searchAnime(query, pageNum));

        const newResults = data.animes.map((anime) => ({
          id: anime.id,
          title: anime.name,
          image: anime.poster,
          type: 'anime' as const,
        }));

        setSearchResults(prev => pageNum === 1 ? newResults : [...prev, ...newResults]);
        setHasNextPage(data.hasNextPage);
      } else {
        const response = await import('@/lib/api').then(mod => mod.searchCharacters(query, pageNum));

        if (response.success) {
          const newResults = response.data.map((char) => ({
            id: `char-${char._id}`,
            title: char.name,
            image: char.image,
            type: 'character' as const,
          }));
          setSearchResults(prev => pageNum === 1 ? newResults : [...prev, ...newResults]);
          setHasNextPage(pageNum < (response.pagination?.totalPages || 1));
        } else {
          if (pageNum === 1) setSearchResults([]);
          setHasNextPage(false);
        }
      }
    } catch (error) {
      console.error('Search failed:', error);
      if (pageNum === 1) setSearchResults([]);
      toast.error('Failed to search. Please try again.');
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Proper debouncing with cleanup
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setPage(1); // Reset page on new search

    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Only search if query is at least 3 characters
    if (value.trim().length >= 3) {
      searchTimeoutRef.current = setTimeout(() => {
        performSearch(value, searchType, 1);
      }, 800);
    } else {
      setSearchResults([]);
      setHasNextPage(false);
    }
  };

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    performSearch(searchQuery, searchType, nextPage);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const handleSearchTypeChange = (type: 'anime' | 'character') => {
    setSearchType(type);
    setPage(1);
    if (searchQuery.trim().length >= 3) {
      // Clear previous timeout and search with new type
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      searchTimeoutRef.current = setTimeout(() => {
        performSearch(searchQuery, type, 1);
      }, 800);
    }
  };

  const addItemToTier = (item: SearchResult, tier: string) => {
    // Check if already added
    if (items.some(i => i.anime_id === item.id)) {
      toast.error('This item is already in your tier list');
      return;
    }

    const newItem: TierListItem = {
      anime_id: item.id,
      anime_title: item.title,
      anime_image: item.image,
      tier,
      position: items.filter(i => i.tier === tier).length,
    };

    setItems([...items, newItem]);
    toast.success(`Added ${item.title} to tier ${tier}`);
  };

  const removeItem = (animeId: string) => {
    setItems(items.filter(i => i.anime_id !== animeId));
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeItem = items.find(i => i.anime_id === active.id);
    if (!activeItem) return;

    // Check if dropped on a tier row
    const overItem = items.find(i => i.anime_id === over.id);
    if (overItem && overItem.tier !== activeItem.tier) {
      // Move to new tier
      setItems(items.map(item =>
        item.anime_id === active.id
          ? { ...item, tier: overItem.tier }
          : item
      ));
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Please enter a name for your tier list');
      return;
    }

    try {
      if (initialData?.id) {
        await updateTierList.mutateAsync({
          id: initialData.id,
          name,
          description: description || undefined,
          items,
          is_public: isPublic,
        });
        toast.success('Tier list updated!');
      } else {
        await createTierList.mutateAsync({
          name,
          description: description || undefined,
          items,
          is_public: isPublic,
        });
        toast.success('Tier list created!');
      }
      onSave?.({ name, description, items, is_public: isPublic });
      onClose?.();
    } catch (error) {
      toast.error('Failed to save tier list');
    }
  };

  const activeItem = activeId ? items.find(i => i.anime_id === activeId) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 space-y-4">
          <Input
            placeholder="Tier List Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-lg font-semibold"
          />
          <Textarea
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />
        </div>
        <div className="flex items-start gap-4">
          <div className="flex items-center gap-2">
            {isPublic ? <Globe className="w-4 h-4 text-green-500" /> : <Lock className="w-4 h-4" />}
            <Label>Public</Label>
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
          </div>
        </div>
      </div>

      {/* Search Anime/Characters */}
      <GlassPanel className="p-4">
        <Tabs value={searchType} onValueChange={(v) => handleSearchTypeChange(v as 'anime' | 'character')} className="mb-4">
          <TabsList className="grid grid-cols-2 w-48">
            <TabsTrigger value="anime" className="flex items-center gap-2">
              <Film className="w-4 h-4" />
              Anime
            </TabsTrigger>
            <TabsTrigger value="character" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Characters
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={searchType === 'anime' ? "Search anime (min 3 chars)..." : "Search characters (min 3 chars)..."}
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>

        {isSearching && (
          <div className="text-center py-4 text-muted-foreground">Searching...</div>
        )}

        {searchResults.length > 0 && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-2">
              {searchResults.map(item => (
                <div key={item.id} className="relative group">
                  <img
                    src={item.image}
                    alt={item.title}
                    className="w-full aspect-[2/3] rounded-lg object-cover"
                  />
                  <div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex flex-col items-center justify-center p-1">
                    <p className="text-[10px] text-white text-center mb-2 line-clamp-2">{item.title}</p>
                    <div className="flex flex-wrap gap-1 justify-center">
                      {DEFAULT_TIERS.map(tier => (
                        <button
                          key={tier.name}
                          onClick={() => addItemToTier(item, tier.name)}
                          className="w-5 h-5 rounded text-[10px] font-bold text-white"
                          style={{ backgroundColor: tier.color }}
                        >
                          {tier.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {hasNextPage && (
              <div className="flex justify-center pt-2">
                <Button variant="secondary" size="sm" onClick={handleLoadMore}>
                  Load More Results
                </Button>
              </div>
            )}
          </div>
        )}
      </GlassPanel>

      {/* Tier Rows */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="space-y-2">
          {DEFAULT_TIERS.map(tier => (
            <TierRow
              key={tier.name}
              tier={tier}
              items={items.filter(i => i.tier === tier.name)}
              onRemoveItem={removeItem}
            />
          ))}
        </div>

        <DragOverlay>
          {activeItem && (
            <div className="w-16 h-24 rounded-lg overflow-hidden shadow-xl">
              <img
                src={activeItem.anime_image}
                alt={activeItem.anime_title}
                className="w-full h-full object-cover"
              />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Actions */}
      <div className="flex justify-end gap-4">
        {onClose && (
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        )}
        <Button
          onClick={handleSave}
          disabled={createTierList.isPending || updateTierList.isPending}
          className="gap-2"
        >
          <Save className="w-4 h-4" />
          {initialData?.id ? 'Update' : 'Save'} Tier List
        </Button>
      </div>
    </div>
  );
}
