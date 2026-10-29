import { Radio } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { SettingsSection, SettingRow } from '@/components/settings/SettingsPrimitives';
import { useSocialPrivacy } from '@/hooks/community/useSocialActivity';
import type { SocialPrivacy } from '@/lib/socialActivity';

const controls: { key: keyof SocialPrivacy; title: string; description: string }[] = [
  { key: 'show_online', title: 'Show when I’m online', description: 'Show your online status on profiles and member lists. Turning this off also hides your current activity.' },
  { key: 'show_last_seen', title: 'Show last online', description: 'Let other signed-in users see when you last used Tatakai.' },
  { key: 'share_watching', title: 'Share what I’m watching', description: 'Show your current anime on your profile and in friends activity.' },
  { key: 'share_reading', title: 'Share what I’m reading', description: 'Show your current manga or novel on your profile and in friends activity.' },
];
export function SocialPrivacyControls() {
  const { data, isLoading, isError, refetch, update } = useSocialPrivacy();
  return <SettingsSection id="social-activity" icon={Radio} title="Online status & activity" description="Choose what others can see. Private profiles never share activity. These settings apply across your devices.">
    {isError ? <div className="space-y-2"><p className="text-sm text-muted-foreground">Activity privacy couldn’t load.</p><Button variant="outline" onClick={() => void refetch()}>Retry</Button></div>
      : controls.map(control => <SettingRow key={control.key} title={control.title} description={control.description} control={<Switch aria-label={control.title} checked={data?.[control.key] ?? false} disabled={isLoading || !data || update.isPending} onCheckedChange={value => {
        if (data) update.mutate({ ...data, [control.key]: value }, { onError: () => toast.error('Couldn’t save activity privacy. Please try again.') });
      }} />} />)}
  </SettingsSection>;
}
