import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { useBanUser, useDeleteUserContent } from '@/hooks/moderation/useModeration';

type DurationPreset = 'permanent' | '1h' | '24h' | '7d' | '30d' | 'custom';

interface BanUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName?: string;
}

/** Quick-timeout buttons for the common cases; the Select still covers 30d/custom. */
const QUICK_PRESETS: { value: DurationPreset; labelKey: string }[] = [
  { value: '1h', labelKey: 'moderation.preset1h' },
  { value: '24h', labelKey: 'moderation.preset24h' },
  { value: '7d', labelKey: 'moderation.preset7d' },
  { value: 'permanent', labelKey: 'moderation.permanent' },
];

/** Single-user ban dialog (reason + duration), shared by the moderation menu. */
export function BanUserDialog({ open, onOpenChange, userId, userName }: BanUserDialogProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [preset, setPreset] = useState<DurationPreset>('permanent');
  const [customDays, setCustomDays] = useState('');
  const [purgeContent, setPurgeContent] = useState(true);
  const banUser = useBanUser();
  const deleteContent = useDeleteUserContent();

  const durationHours = (): number | null => {
    if (preset === 'permanent') return null;
    if (preset === '1h') return 1;
    if (preset === '24h') return 24;
    if (preset === '7d') return 168;
    if (preset === '30d') return 720;
    const days = parseInt(customDays, 10);
    return !isNaN(days) && days >= 1 && days <= 365 ? days * 24 : null;
  };

  const customValid =
    preset !== 'custom' ||
    (parseInt(customDays, 10) >= 1 && parseInt(customDays, 10) <= 365);
  const valid = reason.trim().length >= 1 && reason.trim().length <= 500 && customValid;

  const handleBan = async () => {
    if (!valid) return;
    try {
      await banUser.mutateAsync({ userId, reason: reason.trim(), durationHours: durationHours() });
      // Optionally wipe the user's posts + comments alongside the ban. Two RPC
      // calls (no combined scope); soft-delete keeps thread structure intact.
      if (purgeContent) {
        try {
          const posts = await deleteContent.mutateAsync({ userId, scope: 'posts' });
          const comments = await deleteContent.mutateAsync({ userId, scope: 'comments' });
          const n = (posts.posts ?? 0) + (comments.comments ?? 0);
          toast.success(
            n
              ? t('moderation.bannedWithRemoval', {
                  user: userName || t('moderation.fallbackUser'),
                  posts: posts.posts,
                  comments: comments.comments,
                })
              : t('moderation.banned', { user: userName || t('moderation.fallbackUser') }),
          );
        } catch (delErr: any) {
          toast.warning(t('moderation.purgeFailed', { error: delErr?.message ?? 'unknown error' }));
        }
      } else {
        toast.success(t('moderation.banned', { user: userName || t('moderation.fallbackUser') }));
      }
      onOpenChange(false);
      setReason('');
      setPreset('permanent');
      setCustomDays('');
      setPurgeContent(true);
    } catch (err: any) {
      toast.error(t('moderation.banFailed', { error: err?.message ?? 'unknown error' }));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-background/95 backdrop-blur-xl border-white/10">
        <DialogHeader>
          <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-2">
            <Ban className="w-6 h-6 text-destructive" />
          </div>
          <DialogTitle className="text-xl font-bold">{t('moderation.banUser')}</DialogTitle>
          <DialogDescription>
            <Trans i18nKey="moderation.banningUserRich" values={{ user: userName || userId }} components={{ user: <span className="text-foreground font-medium" /> }} />
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">{t('moderation.duration')}</label>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_PRESETS.map((q) => (
                <Button
                  key={q.value}
                  type="button"
                  size="sm"
                  variant={preset === q.value ? 'default' : 'outline'}
                  onClick={() => setPreset(q.value)}
                  className="h-7 px-2.5 text-xs"
                >
                  {t(q.labelKey)}
                </Button>
              ))}
            </div>
            <Select value={preset} onValueChange={(v) => setPreset(v as DurationPreset)}>
              <SelectTrigger className="bg-white/5 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="permanent">{t('moderation.permanent')}</SelectItem>
                <SelectItem value="1h">{t('moderation.preset1h')}</SelectItem>
                <SelectItem value="24h">{t('moderation.preset24h')}</SelectItem>
                <SelectItem value="7d">{t('moderation.preset7d')}</SelectItem>
                <SelectItem value="30d">{t('moderation.preset30d')}</SelectItem>
                <SelectItem value="custom">{t('moderation.presetCustom')}</SelectItem>
              </SelectContent>
            </Select>
            {preset === 'custom' && (
              <Input
                type="number"
                min={1}
                max={365}
                placeholder={t('moderation.daysPlaceholder')}
                value={customDays}
                onChange={(e) => setCustomDays(e.target.value)}
                className="bg-white/5 border-white/10"
              />
            )}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">{t('moderation.reason')}</label>
            <Textarea
              placeholder={t('moderation.reasonPlaceholder')}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              className="bg-white/5 border-white/10 min-h-[90px] resize-none"
            />
          </div>
          <label className="flex items-start gap-2.5 rounded-lg border border-white/10 bg-white/5 p-3 cursor-pointer">
            <Checkbox
              checked={purgeContent}
              onCheckedChange={(v) => setPurgeContent(v === true)}
              className="mt-0.5"
            />
            <span className="text-sm">
              <span className="font-medium">{t('moderation.purgeTitle')}</span>
              <span className="block text-xs text-muted-foreground">
                {t('moderation.purgeHint')}
              </span>
            </span>
          </label>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={banUser.isPending || deleteContent.isPending}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" onClick={handleBan} disabled={!valid || banUser.isPending || deleteContent.isPending}>
            {(banUser.isPending || deleteContent.isPending) ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {t('moderation.banUser')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
