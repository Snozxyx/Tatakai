import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ListChecks, Plus, X, Loader2 } from 'lucide-react';
import { POLL_DURATION } from '../watchRoomShared';
import { useWatchRoomContext } from '../WatchRoomContext';

/** Header poll maker — mirrors the community feed's poll composer. */
export function PollComposerDialog() {
  useUiTranslation();
    const {
        showPollDialog, setShowPollDialog, pollQuestion, setPollQuestion,
        pollChoices, setPollChoices, pollDuration, setPollDuration,
        createRoomPoll, handleCreatePollFromDialog,
    } = useWatchRoomContext();

    return (
        <Dialog open={showPollDialog} onOpenChange={(open) => { if (!open) setShowPollDialog(false); }}>
            <DialogContent className="max-w-md bg-background/60 backdrop-blur-2xl border-white/10 rounded-3xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 font-semibold">
                        <ListChecks className="w-5 h-5 text-[hsl(var(--isshoni-accent))]" />
                        {uiI18n.t('app.create_a_poll_1cd8e960')}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">{uiI18n.t('app.question_002ff598')}</label>
                        <Input
                            value={pollQuestion}
                            maxLength={140}
                            placeholder={uiI18n.t('app.ask_the_room_94c86562')}
                            onChange={(e) => setPollQuestion(e.target.value)}
                            className="h-11 rounded-xl bg-white/5 border-white/10"
                            autoFocus
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-medium text-muted-foreground">{uiI18n.t('app.choices_7208e66f')}</label>
                        {pollChoices.map((choice, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <Input
                                    value={choice}
                                    maxLength={80}
                                    placeholder={uiI18n.t('app.choice_i18n_value_0_6c996baf', { value0: i + 1 })}
                                    onChange={(e) => setPollChoices((prev) => prev.map((c, idx) => (idx === i ? e.target.value : c)))}
                                    className="h-11 rounded-xl bg-white/5 border-white/10"
                                />
                                {pollChoices.length > 2 && (
                                    <button type="button" aria-label={uiI18n.t('app.remove_choice_7cbb41a0')} onClick={() => setPollChoices((prev) => prev.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive">
                                        <X className="h-4 w-4" />
                                    </button>
                                )}
                                {i === pollChoices.length - 1 && pollChoices.length < 4 && (
                                    <button type="button" aria-label={uiI18n.t('app.add_choice_b14374e6')} onClick={() => setPollChoices((prev) => [...prev, ''])} className="text-[hsl(var(--isshoni-accent))] transition-colors hover:text-[hsl(var(--isshoni-accent)/0.8)]">
                                        <Plus className="h-5 w-5" />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>

                    <div>
                        <p className="mb-2 text-sm font-semibold tracking-tight">{uiI18n.t('app.poll_length_8ea03451')}</p>
                        <div className="grid grid-cols-3 gap-2">
                            {(['days', 'hours', 'minutes'] as const).map((unit) => (
                                <div key={unit}>
                                    <label className="mb-1 block text-xs font-medium text-muted-foreground capitalize">{uiI18n.t(({"days":"app.days_5548ae4f","hours":"app.hours_5aedee09","minutes":"app.minutes_be2e2bb6"})[unit])}</label>
                                    <Select value={String(pollDuration[unit])} onValueChange={(v) => setPollDuration((p) => ({ ...p, [unit]: Number(v) }))}>
                                        <SelectTrigger className="h-11 rounded-xl bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
                                        <SelectContent>{POLL_DURATION[unit].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => setShowPollDialog(false)} className="rounded-full bg-white/5 border-white/10 hover:bg-white/10">{uiI18n.t('app.cancel_77dfd213')}</Button>
                    <Button onClick={handleCreatePollFromDialog} disabled={createRoomPoll.isPending} className="gap-2 rounded-full bg-[hsl(var(--isshoni-accent))] font-bold text-black shadow-[0_0_15px_hsl(var(--isshoni-accent)/0.25)] hover:bg-[hsl(var(--isshoni-accent)/0.9)]">
                        {createRoomPoll.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                        {uiI18n.t('app.start_poll_bf1f9b6f')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
