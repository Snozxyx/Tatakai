import { useEffect, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { notificationSoundEnabled, setNotificationSound } from '@/lib/notificationSound';
import { toast } from 'sonner';

export function NotificationSoundToggle() {
  const [enabled, setEnabled] = useState(notificationSoundEnabled);
  useEffect(() => {
    const update = () => setEnabled(notificationSoundEnabled());
    window.addEventListener('storage', update);
    window.addEventListener('notification-sound-change', update);
    return () => {
      window.removeEventListener('storage', update);
      window.removeEventListener('notification-sound-change', update);
    };
  }, []);
  return <label className="my-3 flex items-center justify-between gap-4 text-sm">
    Notification sound
    <Switch aria-label="Notification sound" checked={enabled} onCheckedChange={(value) => {
      try { setNotificationSound(value); } catch { toast.error('Could not save sound preference.'); }
    }} />
  </label>;
}
