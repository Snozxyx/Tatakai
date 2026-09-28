import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ListChecks, Plus, X, Loader2 } from 'lucide-react';
import { POLL_DURATION } from '../watchRoomShared';
import { useWatchRoomContext } from '../WatchRoomContext';

/** Header poll maker — mirrors the community feed's poll composer. */
export function PollComposerDialog() {
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
                        Create a poll
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Question</label>
                        <Input
                            value={pollQuestion}
                            maxLength={140}
                            placeholder="Ask the room…"
                            onChange={(e) => setPollQuestion(e.target.value)}
                            className="h-11 rounded-xl bg-white/5 border-white/10"
                            autoFocus
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-medium text-muted-foreground">Choices</label>
                        {pollChoices.map((choice, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <Input
                                    value={choice}
                                    maxLength={80}
                                    placeholder={`Choice ${i + 1}`}
                                    onChange={(e) => setPollChoices((prev) => prev.map((c, idx) => (idx === i ? e.target.value : c)))}
                                    className="h-11 rounded-xl bg-white/5 border-white/10"
                                />
                                {pollChoices.length > 2 && (
                                    <button type="button" aria-label="Remove choice" onClick={() => setPollChoices((prev) => prev.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive">
                                        <X className="h-4 w-4" />
                                    </button>
                                )}
                                {i === pollChoices.length - 1 && pollChoices.length < 4 && (
                                    <button type="button" aria-label="Add choice" onClick={() => setPollChoices((prev) => [...prev, ''])} className="text-[hsl(var(--isshoni-accent))] transition-colors hover:text-[hsl(var(--isshoni-accent)/0.8)]">
                                        <Plus className="h-5 w-5" />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>

                    <div>
                        <p className="mb-2 text-sm font-semibold tracking-tight">Poll length</p>
                        <div className="grid grid-cols-3 gap-2">
                            {(['days', 'hours', 'minutes'] as const).map((unit) => (
                                <div key={unit}>
                                    <label className="mb-1 block text-xs font-medium text-muted-foreground capitalize">{unit}</label>
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
                    <Button variant="outline" onClick={() => setShowPollDialog(false)} className="rounded-full bg-white/5 border-white/10 hover:bg-white/10">Cancel</Button>
                    <Button onClick={handleCreatePollFromDialog} disabled={createRoomPoll.isPending} className="gap-2 rounded-full bg-[hsl(var(--isshoni-accent))] font-bold text-black shadow-[0_0_15px_hsl(var(--isshoni-accent)/0.25)] hover:bg-[hsl(var(--isshoni-accent)/0.9)]">
                        {createRoomPoll.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                        Start poll
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
