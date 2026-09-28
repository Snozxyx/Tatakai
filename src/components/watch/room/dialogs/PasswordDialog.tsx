import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Lock } from 'lucide-react';
import { useWatchRoomContext } from '../WatchRoomContext';

/** Password-gated join dialog (frosted overlay, matches the room aesthetic). */
export function PasswordDialog() {
    const { showPasswordDialog, setShowPasswordDialog, password, setPassword, handlePasswordJoin } = useWatchRoomContext();

    return (
        <AnimatePresence>
            {showPasswordDialog && (
                <motion.div
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                >
                    <motion.div
                        className="p-6 max-w-sm w-full space-y-4 bg-background/60 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl"
                        initial={{ opacity: 0, scale: 0.96, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, y: 4 }}
                        transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
                    >
                        <div className="flex items-center gap-4"><div className="p-3 bg-orange-500/15 rounded-2xl"><Lock className="w-6 h-6 text-orange-500" /></div><div><h3 className="font-semibold">Password required</h3><p className="text-xs text-muted-foreground">Enter room password to join</p></div></div>
                        <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password…" className="rounded-full bg-white/5 border-white/10 h-11 px-4" autoFocus />
                        <div className="flex gap-2"><Button variant="outline" className="flex-1 rounded-full bg-white/5 border-white/10 hover:bg-white/10" onClick={() => setShowPasswordDialog(false)}>Cancel</Button><Button className="flex-1 rounded-full bg-[hsl(var(--isshoni-accent))] font-bold text-black shadow-[0_0_15px_hsl(var(--isshoni-accent)/0.25)] hover:bg-[hsl(var(--isshoni-accent)/0.9)]" onClick={handlePasswordJoin}>Join room</Button></div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
