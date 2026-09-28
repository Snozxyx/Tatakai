import * as React from 'react';
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { ScrollText, Check } from 'lucide-react';

const STORAGE_PREFIX = 'tatakai_community_rules_agreed_v1:';

const storageKey = (userId?: string | null) => `${STORAGE_PREFIX}${userId ?? 'guest'}`;

/** Read-only check, usable both by the gate and any caller that wants to know up front. */
export function hasAgreedToCommunityRules(userId?: string | null): boolean {
  try {
    return localStorage.getItem(storageKey(userId)) === 'true';
  } catch {
    return false;
  }
}

type EnsureAgreed = () => Promise<boolean>;

const CommunityRulesGateContext = createContext<EnsureAgreed | null>(null);

const RULES_SUMMARY: { title: string; body: string }[] = [
  { title: 'Be respectful', body: 'Disagree with the take, not the person. No insults, harassment, or telling anyone to harm themselves.' },
  { title: 'No hate speech', body: 'Slurs and attacks on race, religion, gender, sexuality, disability, or nationality are not allowed anywhere.' },
  { title: 'Keep it safe for work', body: 'NSFW stays behind the 18+ gate; avatars and usernames stay SFW everywhere. Sexualizing minors is an instant permanent ban.' },
  { title: 'Tag your spoilers', body: 'Use the spoiler tag for anything ahead of where someone might be.' },
  { title: 'No spam or advertising', body: 'No copy-paste flooding, AI-generated posts, rep farming, or promoting other sites.' },
  { title: 'Play fair', body: 'One person, one account. No vote manipulation, and respect privacy — doxxing is an instant permanent ban.' },
];

export function CommunityRulesGateProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const resolverRef = useRef<((v: boolean) => void) | null>(null);

  const settle = useCallback((value: boolean) => {
    setOpen(false);
    const resolve = resolverRef.current;
    resolverRef.current = null;
    resolve?.(value);
  }, []);

  const ensureAgreed = useCallback<EnsureAgreed>(() => {
    if (hasAgreedToCommunityRules(user?.id)) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setOpen(true);
    });
  }, [user?.id]);

  const handleAgree = useCallback(() => {
    try { localStorage.setItem(storageKey(user?.id), 'true'); } catch { /* private mode */ }
    settle(true);
  }, [settle, user?.id]);

  return (
    <CommunityRulesGateContext.Provider value={ensureAgreed}>
      {children}
      <Dialog open={open} onOpenChange={(o) => { if (!o) settle(false); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScrollText className="w-5 h-5 text-primary" />
              Before you post
            </DialogTitle>
            <DialogDescription>
              Tatakai is community-driven. Please agree to the Community Guidelines before your first post or comment. In short: be cordial, and this never comes up.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-3 py-1">
            {RULES_SUMMARY.map((r) => (
              <li key={r.title} className="flex gap-3">
                <Check className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-semibold text-foreground">{r.title}</p>
                  <p className="text-sm text-muted-foreground">{r.body}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Read the full{' '}
            <Link to="/community-guidelines" className="text-primary hover:underline" onClick={() => settle(false)}>
              Community Guidelines
            </Link>
            . Moderators may remove content, restrict features, or ban accounts for violations.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => settle(false)}>Not now</Button>
            <Button onClick={handleAgree}>I agree</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CommunityRulesGateContext.Provider>
  );
}

/**
 * Returns `ensureAgreed()` — resolves true if the user has already agreed (or
 * agrees now via the modal), false if they dismiss it. Fails open when the
 * provider isn't mounted so posting is never hard-blocked by a mount bug.
 */
export function useCommunityRulesGate(): EnsureAgreed {
  const ctx = useContext(CommunityRulesGateContext);
  return ctx ?? (() => Promise.resolve(true));
}
