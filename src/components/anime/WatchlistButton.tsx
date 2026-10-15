import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useWatchlistItem, useAddToWatchlist, useRemoveFromWatchlist, WatchlistStatus } from '@/hooks/user/useWatchlist';
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
  malId?: number | null;
  anilistId?: number | null;
}

const STATUS_OPTIONS: { value: WatchlistStatus; labelKey: string }[] = [
  { value: 'plan_to_watch', labelKey: 'watchlist.planToWatch' },
  { value: 'watching', labelKey: 'watchlist.watching' },
  { value: 'completed', labelKey: 'watchlist.completed' },
  { value: 'on_hold', labelKey: 'watchlist.onHold' },
  { value: 'dropped', labelKey: 'watchlist.dropped' },
];

export function WatchlistButton({ animeId, animeName, animePoster, variant = 'default', malId, anilistId }: WatchlistButtonProps) {
  useUiTranslation();
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);

  // Debug log when component receives IDs
  console.log('[WatchlistButton] Mounted/Updated:', { 
    animeId, 
    animeName: animeName?.substring(0, 30), 
    malId, 
    anilistId,
    hasIds: !!(malId || anilistId)
  });

  const { data: watchlistItem, isLoading } = useWatchlistItem(animeId);
  const addToWatchlist = useAddToWatchlist();
  const removeFromWatchlist = useRemoveFromWatchlist();

  const handleAddToWatchlist = async (status: WatchlistStatus) => {
    console.log('[WatchlistButton] Adding to watchlist:', { 
      animeId, 
      status, 
      malId, 
      anilistId 
    });
    await addToWatchlist.mutateAsync({
      animeId,
      animeName,
      animePoster,
      status,
      malId,
      anilistId,
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
            {t("watchlist.addToList")}
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
          className={`${variant === 'icon' ? 'h-14 w-14 rounded-full' : ''} ${watchlistItem ? 'bg-primary hover:bg-primary/90' : ''}`}
        >
          {watchlistItem ? (
            variant === 'icon' ? (
              <Check className="w-6 h-6" />
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                {STATUS_OPTIONS.find(s => s.value === watchlistItem.status)?.labelKey ? t(STATUS_OPTIONS.find(s => s.value === watchlistItem.status)!.labelKey) : t("watchlist.inList")}
              </>
            )
          ) : variant === 'icon' ? (
            <Plus className="w-6 h-6" />
          ) : (
            <>
              <BookmarkPlus className="w-4 h-4 mr-2" />
              {t("watchlist.addToList")}
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
            {t(option.labelKey)}
          </DropdownMenuItem>
        ))}
        {watchlistItem && (
          <>
            <DropdownMenuItem
              onClick={handleRemove}
              className="text-destructive focus:text-destructive"
            >
              {t("watchlist.removeFromList")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

