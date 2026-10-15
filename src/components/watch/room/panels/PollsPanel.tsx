import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Poll } from '@/components/community/feed/Poll';
import { BarChart3, Plus } from 'lucide-react';
import { useWatchRoomContext } from '../WatchRoomContext';

/** Group poll: renders the active poll (or empty state) + host new/close controls. */
export function PollsPanel() {
  useUiTranslation();
    const {
        activePoll, isHost, roomId, closeRoomPoll, voteRoomPoll, isParticipant,
        setShowPollDialog, handleVotePoll,
    } = useWatchRoomContext();

    return (
        <div className="mt-0 flex min-h-0 flex-1 flex-col p-4 pt-3.5">
            <div className="mb-3 flex shrink-0 items-center justify-between">
                <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground"><BarChart3 className="h-3.5 w-3.5 text-[hsl(var(--isshoni-accent))]" /> {uiI18n.t('app.group_poll_bfdd1cf6')}</h3>
                {isHost && (
                    activePoll ? (
                        <Button size="sm" variant="outline" className="h-7 text-xs rounded-full bg-white/5 border-white/10 hover:bg-white/10" onClick={() => closeRoomPoll.mutate({ roomId: roomId!, pollId: activePoll.id })}>{uiI18n.t('app.close_bbfa773e')}</Button>
                    ) : (
                        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs rounded-full bg-white/5 border-white/10 hover:bg-white/10" onClick={() => setShowPollDialog(true)}><Plus className="h-3 w-3" /> {uiI18n.t('app.new_6403f2b7')}</Button>
                    )
                )}
            </div>
            <ScrollArea className="-mr-2 min-h-0 flex-1 pr-2">
                {activePoll ? (
                    <Poll question={activePoll.question} results={activePoll.results} votesCount={activePoll.votes_count} userVote={activePoll.user_vote} endsAt={activePoll.ends_at} disabled={voteRoomPoll.isPending || !isParticipant} onVote={handleVotePoll} />
                ) : (
                    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
                        <BarChart3 className="h-10 w-10 opacity-20" />
                        <p className="text-xs">{isHost ? uiI18n.t('app.no_active_poll_start_one_to_gather_votes_0447b32f') : uiI18n.t('app.no_active_poll_yet_the_host_can_start_one_anytim_f19c8aae')}</p>
                    </div>
                )}
            </ScrollArea>
        </div>
    );
}
