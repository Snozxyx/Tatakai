import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getProxiedImageUrl } from '@/lib/api';
import { ListOrdered, ArrowUp, ArrowDown, X } from 'lucide-react';
import { useWatchRoomContext } from '../WatchRoomContext';

/** Watch queue: list + host add/current/reorder/play/remove controls. */
export function QueuePanel() {
  useUiTranslation();
    const {
        queueItems, isHost, room, roomId, addQueueItem, removeQueueItem,
        handleQueueAnimeFromSearch, handleQueueCurrentEpisode,
        handleMoveQueueItem, handlePlayQueueItem,
    } = useWatchRoomContext();

    return (
        <div className="mt-0 flex min-h-0 flex-1 flex-col p-4 pt-3.5">
            <div className="mb-3 flex shrink-0 items-center justify-between">
                <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground"><ListOrdered className="h-3.5 w-3.5 text-[hsl(var(--isshoni-accent))]" /> {uiI18n.t('app.watch_queue_46ddf688')} <span className="text-muted-foreground/60">({queueItems.length})</span></h3>
                {isHost && (
                    <div className="flex items-center gap-1.5">
                        <Button size="sm" variant="outline" className="h-7 text-xs rounded-full bg-white/5 border-white/10 hover:bg-white/10" onClick={handleQueueAnimeFromSearch} disabled={addQueueItem.isPending}>{uiI18n.t('app.add_61cc55aa')}</Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs rounded-full bg-white/5 border-white/10 hover:bg-white/10" onClick={handleQueueCurrentEpisode} disabled={!room?.anime_id || room.anime_id === 'custom' || addQueueItem.isPending}>{uiI18n.t('app.current_4fc0e2bc')}</Button>
                    </div>
                )}
            </div>
            {queueItems.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                    <ListOrdered className="h-10 w-10 opacity-20" />
                    <p className="text-xs">{uiI18n.t('app.queue_is_empty_8000b735')}{isHost ? uiI18n.t('app.add_episodes_for_a_smoother_session_5852b9a2') : ''}</p>
                </div>
            ) : (
                <ScrollArea className="-mr-2 min-h-0 flex-1 pr-2">
                    <div className="space-y-2">
                        {queueItems.map((item, index) => (
                            <div key={item.id} className="flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-2 transition-colors hover:bg-white/[0.07]">
                                <span className="w-5 text-xs font-semibold text-muted-foreground text-center">{index + 1}</span>
                                <img src={getProxiedImageUrl(item.anime_poster || '/placeholder.svg')} alt="" className="h-10 w-8 rounded-lg object-cover [outline:1px_solid_oklch(1_0_0/0.1)]" />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-xs font-semibold">{item.anime_title}</p>
                                    <p className="truncate text-[11px] text-muted-foreground">{item.episode_number ? uiI18n.t('app.episode_i18n_value_0_f05acda8', { value0: item.episode_number }) : uiI18n.t('app.next_available_episode_80bb4701')}</p>
                                </div>
                                {isHost && (
                                    <div className="flex items-center gap-1">
                                        <Button size="icon" variant="ghost" className="h-7 w-7 rounded-full" onClick={() => handleMoveQueueItem(item.id, 'up')} disabled={index === 0}><ArrowUp className="h-3 w-3" /></Button>
                                        <Button size="icon" variant="ghost" className="h-7 w-7 rounded-full" onClick={() => handleMoveQueueItem(item.id, 'down')} disabled={index === queueItems.length - 1}><ArrowDown className="h-3 w-3" /></Button>
                                        <Button size="sm" variant="outline" className="h-7 text-xs rounded-full bg-white/5 border-white/10 hover:bg-white/10" onClick={() => handlePlayQueueItem(item.id)}>{uiI18n.t('app.play_5d12bd53')}</Button>
                                        <Button size="icon" variant="ghost" className="h-7 w-7 rounded-full text-red-400 hover:text-red-300" onClick={() => removeQueueItem.mutate({ roomId: roomId!, queueItemId: item.id })}><X className="h-3 w-3" /></Button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            )}
        </div>
    );
}
