import { useState, useEffect } from 'react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Clock, Calendar, Bell, BellOff, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface NextEpisodeScheduleProps {
  animeId: string;
  animeName: string;
  airingTime?: string; // ISO string or Unix timestamp
  nextEpisodeNumber?: number;
  dayOfWeek?: string;
}

function formatTimeUntil(targetDate: Date): {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isOverdue: boolean;
} {
  const now = new Date();
  const diff = targetDate.getTime() - now.getTime();

  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, isOverdue: true };
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  return { days, hours, minutes, seconds, isOverdue: false };
}

function CountdownTimer({ targetDate }: { targetDate: Date }) {
  const [timeLeft, setTimeLeft] = useState(formatTimeUntil(targetDate));

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(formatTimeUntil(targetDate));
    }, 1000);

    return () => clearInterval(interval);
  }, [targetDate]);

  if (timeLeft.isOverdue) {
    return (
      <div className="text-center py-4">
        <p className="text-primary font-bold text-lg animate-pulse">Episode Available Now!</p>
      </div>
    );
  }

  return (
    <div className="flex gap-3 justify-center">
      {[
        { value: timeLeft.days, label: 'Days' },
        { value: timeLeft.hours, label: 'Hours' },
        { value: timeLeft.minutes, label: 'Mins' },
        { value: timeLeft.seconds, label: 'Secs' },
      ].map((item, idx) => (
        <div
          key={idx}
          className="flex flex-col items-center bg-muted/50 rounded-xl p-3 min-w-[60px]"
        >
          <span className="text-2xl font-bold tabular-nums">{String(item.value).padStart(2, '0')}</span>
          <span className="text-xs text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

export function NextEpisodeSchedule({
  animeId,
  animeName,
  airingTime,
  nextEpisodeNumber,
  dayOfWeek,
}: NextEpisodeScheduleProps) {
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [userTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);

  // If no airing time provided, don't render anything
  if (!airingTime) {
    return null;
  }

  const targetDate = new Date(airingTime);
  const isValidDate = !isNaN(targetDate.getTime());

  if (!isValidDate) {
    return null;
  }

  // Format the date in user's local timezone
  const localDateString = targetDate.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const localTimeString = targetDate.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  const handleNotifyToggle = async () => {
    if (!notifyEnabled) {
      // Web notification fallback
      if (!('Notification' in window)) {
        toast.error('Notifications not supported in this browser');
        return;
      }
      
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        setNotifyEnabled(true);
        toast.success('Notifications enabled');
      } else {
        toast.error('Notification permission denied');
      }
    } else {
      setNotifyEnabled(false);
      toast.info('Notifications disabled');
    }
  };

  // Check if notification was previously enabled
  useEffect(() => {
    const stored = localStorage.getItem(`notify_${animeId}`);
    if (stored === 'true') {
      setNotifyEnabled(true);

      // Re-verify permission/schedule if native? 
      // Too expensive to check schedule existence every mount, trust local storage.
    }
  }, [animeId]);

  return (
    <GlassPanel className="p-6 mb-8">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-lg font-semibold flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          Next Episode
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleNotifyToggle}
          className={cn(
            "gap-2",
            notifyEnabled && "text-primary"
          )}
        >
          {notifyEnabled ? (
            <>
              <Bell className="w-4 h-4 fill-current" />
              Notifying
            </>
          ) : (
            <>
              <BellOff className="w-4 h-4" />
              Notify Me
            </>
          )}
        </Button>
      </div>

      {nextEpisodeNumber && (
        <p className="text-center text-muted-foreground mb-4">
          Episode {nextEpisodeNumber} airs in:
        </p>
      )}

      <CountdownTimer targetDate={targetDate} />

      <div className="mt-6 space-y-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          <span>{localDateString}</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4" />
          <span>{localTimeString}</span>
        </div>
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4" />
          <span className="text-xs">{userTimezone}</span>
        </div>
      </div>

      {dayOfWeek && (
        <div className="mt-4 pt-4 border-t border-white/10 text-center">
          <span className="text-xs text-muted-foreground">
            This anime airs every <span className="text-foreground font-medium">{dayOfWeek}</span>
          </span>
        </div>
      )}
    </GlassPanel>
  );
}
