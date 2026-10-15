import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
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
  { get title() { return uiI18n.t('app.be_respectful_c53e6434'); }, get body() { return uiI18n.t('app.disagree_with_the_take_not_the_person_no_insults_1636b367'); } },
  { get title() { return uiI18n.t('app.no_hate_speech_556adf87'); }, get body() { return uiI18n.t('app.slurs_and_attacks_on_race_religion_gender_sexual_6ba95107'); } },
  { get title() { return uiI18n.t('app.keep_it_safe_for_work_88f88689'); }, get body() { return uiI18n.t('app.nsfw_stays_behind_the_18_gate_avatars_and_userna_a1cf1500'); } },
  { get title() { return uiI18n.t('app.tag_your_spoilers_e5e456e2'); }, get body() { return uiI18n.t('app.use_the_spoiler_tag_for_anything_ahead_of_where__ee930056'); } },
  { get title() { return uiI18n.t('app.no_spam_or_advertising_43f9978d'); }, get body() { return uiI18n.t('app.no_copy_paste_flooding_ai_generated_posts_rep_fa_6a7db715'); } },
  { get title() { return uiI18n.t('app.play_fair_83b37f64'); }, get body() { return uiI18n.t('app.one_person_one_account_no_vote_manipulation_and__a25f0f3e'); } },
];

export function CommunityRulesGateProvider({ children }: { children: React.ReactNode }) {
  useUiTranslation();
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
              {uiI18n.t('app.before_you_post_bd41b8ea')}
            </DialogTitle>
            <DialogDescription>
              {uiI18n.t('app.tatakai_is_community_driven_please_agree_to_the__4c5c0d4f')}
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
            {uiI18n.t('app.read_the_full_7ed3904f')}{' '}
            <Link to="/community-guidelines" className="text-primary hover:underline" onClick={() => settle(false)}>
              {uiI18n.t('app.community_guidelines_75343669')}
            </Link>
            {uiI18n.t('app.moderators_may_remove_content_restrict_features__c338b669')}
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => settle(false)}>{uiI18n.t('app.not_now_e4571490')}</Button>
            <Button onClick={handleAgree}>{uiI18n.t('app.i_agree_6a151a67')}</Button>
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
  useUiTranslation();
  const ctx = useContext(CommunityRulesGateContext);
  return ctx ?? (() => Promise.resolve(true));
}
