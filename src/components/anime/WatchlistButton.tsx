import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useWatchlistItem, useAddToWatchlist, useRemoveFromWatchlist, WatchlistStatus } from '@/hooks/useWatchlist';
import { Button } from '@/components/ui/button';
import { Plus, Check, Loader2, BookmarkPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface WatchlistButtonProps {
  animeId: string;
  animeName: string;
  animePoster?: string;
  variant?: 'default' | 'icon';
}

const STATUS_OPTIONS: { value: WatchlistStatus; label: string }[] = [
  { value: 'plan_to_watch', label: 'Plan to Watch' },
  { value: 'watching', label: 'Watching' },
  { value: 'completed', label: 'Completed' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'dropped', label: 'Dropped' },
];

export function WatchlistButton({ animeId, animeName, animePoster, variant = 'default' }: WatchlistButtonProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  
  const { data: watchlistItem, isLoading } = useWatchlistItem(animeId);
  const addToWatchlist = useAddToWatchlist();
  const removeFromWatchlist = useRemoveFromWatchlist();

  const handleAddToWatchlist = async (status: WatchlistStatus) => {
    await addToWatchlist.mutateAsync({
      animeId,
      animeName,
      animePoster,
      status,
    });
    setIsOpen(false);
  };

  const handleRemove = async () => {
    await removeFromWatchlist.mutateAsync(animeId);
    setIsOpen(false);
  };

  if (!user) {
    return (
      <Button
        variant={variant === 'icon' ? 'outline' : 'secondary'}
        size={variant === 'icon' ? 'icon' : 'default'}
        onClick={() => navigate('/auth')}
        className={variant === 'icon' ? 'h-14 w-14 rounded-full' : ''}
      >
        {variant === 'icon' ? (
          <Plus className="w-6 h-6" />
        ) : (
          <>
            <BookmarkPlus className="w-4 h-4 mr-2" />
            Add to List
          </>
        )}
      </Button>
    );
  }

  if (isLoading) {
    return (
      <Button
        variant={variant === 'icon' ? 'outline' : 'secondary'}
        size={variant === 'icon' ? 'icon' : 'default'}
        disabled
        className={variant === 'icon' ? 'h-14 w-14 rounded-full' : ''}
      >
        <Loader2 className="w-4 h-4 animate-spin" />
      </Button>
    );
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant={watchlistItem ? 'default' : variant === 'icon' ? 'outline' : 'secondary'}
          size={variant === 'icon' ? 'icon' : 'default'}
          className={`${variant === 'icon' ? 'h-14 w-14 rounded-full' : ''} ${
            watchlistItem ? 'bg-primary hover:bg-primary/90' : ''
          }`}
        >
          {watchlistItem ? (
            variant === 'icon' ? (
              <Check className="w-6 h-6" />
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                {STATUS_OPTIONS.find(s => s.value === watchlistItem.status)?.label || 'In List'}
              </>
            )
          ) : variant === 'icon' ? (
            <Plus className="w-6 h-6" />
          ) : (
            <>
              <BookmarkPlus className="w-4 h-4 mr-2" />
              Add to List
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {STATUS_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => handleAddToWatchlist(option.value)}
            className={watchlistItem?.status === option.value ? 'bg-primary/20' : ''}
          >
            {option.label}
          </DropdownMenuItem>
        ))}
        {watchlistItem && (
          <>
            <DropdownMenuItem
              onClick={handleRemove}
              className="text-destructive focus:text-destructive"
            >
              Remove from List
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
