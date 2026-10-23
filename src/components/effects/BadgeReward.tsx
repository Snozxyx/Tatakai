import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { BADGES, RARITY_STYLES } from '@/lib/badges';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useMotionPreference } from '@/hooks/ui/useMotionPreference';

type Reward = { id: string; badge_key: string };
/** All future server-granted badges enter the same persistent, one-time reward queue. */
export function BadgeReward() {
  const { user, refreshProfile } = useAuth();
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const reduced = useMotionPreference();
  const client = useQueryClient();
  useQuery({
    queryKey: ['badge-progress', user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async () => {
      const { error } = await supabase.rpc('recompute_user_badges' as any, {
        p_user_id: user!.id,
      });
      if (error) throw error;
      await Promise.all([
        refreshProfile(),
        client.invalidateQueries({ queryKey: ['user_badges'] }),
        client.invalidateQueries({ queryKey: ['user_badges_batch'] }),
        client.invalidateQueries({ queryKey: ['badge-rewards'] }),
        client.invalidateQueries({ queryKey: ['feed'] }),
      ]);
      return true;
    },
  });
  const [equipped, setEquipped] = useState<string | null>(null);
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let ready = false;
    const sync = () =>
      setAvailable(
        ready &&
          !document.querySelector(
            '[role="dialog"][data-state="open"]:not([data-badge-reward])'
          ) &&
          !document.documentElement.classList.contains('v6-popup-active')
      );
    const timer = setTimeout(() => {
      ready = true;
      sync();
    }, 3500);
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-state', 'class'],
    });
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, []);
  const home = pathname === '/' || pathname === '/home';
  const query = useQuery({
    queryKey: ['badge-rewards', user?.id],
    enabled: !!user && home,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('badge_rewards' as any)
        .select('id,badge_key')
        .eq('user_id', user!.id)
        .is('seen_at', null)
        .order('created_at')
        .limit(20);
      if (error) throw error;
      return data as unknown as Reward[];
    },
  });
  const reward = query.data?.find((reward) =>
    BADGES.some((badge) => badge.key === reward.badge_key)
  );
  const badge = BADGES.find((badge) => badge.key === reward?.badge_key);
  const claim = useMutation({
    mutationFn: async (equip: boolean) => {
      if (!reward) return;
      const { error } = await supabase.rpc('claim_badge_reward' as any, {
        p_reward_id: reward.id,
        p_equip: equip,
      });
      if (error) throw error;
      if (equip) {
        setEquipped(reward.id);
        await refreshProfile();
      } else await client.invalidateQueries({ queryKey: ['badge-rewards'] });
      void client.invalidateQueries({ queryKey: ['user_badges'] });
    },
  });
  if (!home || !available || !reward || !badge) return null;
  const done = equipped === reward.id;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !claim.isPending) {
          if (done)
            void client.invalidateQueries({ queryKey: ['badge-rewards'] });
          else claim.mutate(false);
        }
      }}
    >
      <DialogContent
        data-badge-reward
        showCloseButton={false}
        className="max-w-sm overflow-hidden border-primary/20 p-8 text-center"
      >
        <motion.div
          key={reward.id}
          initial={{
            opacity: 0,
            transform: reduced ? 'none' : 'translateY(16px) scale(0.94)',
          }}
          animate={{ opacity: 1, transform: 'translateY(0px) scale(1)' }}
          transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
        >
          <p
            aria-live="polite"
            className="mb-6 text-sm font-semibold text-primary"
          >
            {t(done ? 'badgeReward.equipped' : 'badgeReward.unlocked')}
          </p>
          <div className="relative mx-auto mb-6 flex h-44 w-44 items-center justify-center">
            <div
              className="absolute inset-0 rounded-full"
              style={{ background: RARITY_STYLES[badge.rarity].ambient }}
            />
            <motion.img
              src={badge.image}
              alt={badge.label}
              className="relative h-32 w-32 object-contain drop-shadow-xl"
              initial={{
                opacity: 0,
                transform: reduced ? 'none' : 'scale(0.92) rotate(-8deg)',
              }}
              animate={{
                opacity: 1,
                transform:
                  done && !reduced
                    ? [
                        'scale(1) rotate(0deg)',
                        'scale(1.08) rotate(0deg)',
                        'scale(1) rotate(0deg)',
                      ]
                    : 'scale(1) rotate(0deg)',
              }}
              transition={
                done
                  ? { duration: 0.5, ease: [0.23, 1, 0.32, 1] }
                  : { type: 'spring', duration: 0.5, bounce: 0.2 }
              }
            />
            {done && !reduced && (
              <motion.div
                aria-hidden="true"
                className="pointer-events-none absolute inset-4 rounded-full border border-primary/70"
                initial={{ opacity: 0.8, transform: 'scale(0.94)' }}
                animate={{ opacity: 0, transform: 'scale(1.4)' }}
                transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
              />
            )}
            {done && (
              <ShieldCheck className="absolute bottom-1 right-1 h-8 w-8 rounded-full bg-background p-1 text-emerald-500" />
            )}
          </div>
          <DialogTitle className="text-center text-3xl font-black">
            {badge.label}
          </DialogTitle>
          <DialogDescription className="mt-3 text-center leading-relaxed">
            {t(
              badge.key === 'og'
                ? 'badgeReward.milestone'
                : 'badgeReward.description'
            )}
          </DialogDescription>
          {claim.isError && (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {t('badgeReward.failed')}
            </p>
          )}
          <div className="mt-8 space-y-2">
            <Button
              className="w-full"
              disabled={claim.isPending}
              onClick={() =>
                done
                  ? void client.invalidateQueries({
                      queryKey: ['badge-rewards'],
                    })
                  : claim.mutate(true)
              }
            >
              {t(done ? 'badgeReward.continue' : 'badgeReward.equip')}
            </Button>
            {!done && (
              <Button
                className="w-full"
                variant="ghost"
                disabled={claim.isPending}
                onClick={() => claim.mutate(false)}
              >
                {t('badgeReward.later')}
              </Button>
            )}
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
