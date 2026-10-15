import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Trash2, CircleDot, CircleCheck, Ban, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SettingsBadge, type SettingsTone } from '@/components/settings/SettingsPrimitives';
import {
  clearLocalTorrentSessionHistory,
  getLocalTorrentSessionHistory,
  LocalTorrentSessionItem,
  removeLocalTorrentSessionHistory,
} from '@/lib/localStorage';
import { cn } from '@/lib/utils';

const STATUS_META: Record<LocalTorrentSessionItem['status'], { label: string; tone: SettingsTone; icon: any }> = {
  active: { get label() { return uiI18n.t('app.active_a733b809'); }, tone: 'success', icon: CircleDot },
  completed: { get label() { return uiI18n.t('app.completed_1798b3ba'); }, tone: 'primary', icon: CircleCheck },
  blocked: { get label() { return uiI18n.t('app.blocked_99613c74'); }, tone: 'danger', icon: Ban },
  error: { get label() { return uiI18n.t('app.error_7f2f6a15'); }, tone: 'warning', icon: AlertTriangle },
  stopped: { get label() { return uiI18n.t('app.stopped_51e9111b'); }, tone: 'muted', icon: CircleDot },
};

const formatDateTime = (value: string) => {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
};

export function TorrentSessionHistory() {
  useUiTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState<LocalTorrentSessionItem[]>([]);

  const refresh = () => {
    setItems(getLocalTorrentSessionHistory());
  };

  useEffect(() => {
    refresh();

    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'tatakai_torrent_session_history_v1') {
        refresh();
      }
    };

    const handleHistoryChanged = () => refresh();

    window.addEventListener('storage', handleStorage);
    window.addEventListener('tatakai-torrent-history-changed', handleHistoryChanged);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('tatakai-torrent-history-changed', handleHistoryChanged);
    };
  }, []);

  const visibleItems = useMemo(() => items.slice(0, 8), [items]);

  const handleResume = (item: LocalTorrentSessionItem) => {
    if (item.status !== 'active') return;
    navigate(`/watch/torrent-${item.sessionId}?torrent=true&sessionId=${item.sessionId}`);
  };

  const handleRemove = (sessionId: string) => {
    removeLocalTorrentSessionHistory(sessionId);
    refresh();
  };

  const handleClearAll = () => {
    clearLocalTorrentSessionHistory();
    refresh();
  };

  if (!visibleItems.length) {
    return <p className="py-3.5 text-sm text-muted-foreground">{uiI18n.t('app.no_torrent_sessions_recorded_yet_9eb43157')}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClearAll}
          className="gap-2 text-muted-foreground hover:text-foreground"
        >
          <Trash2 className="w-4 h-4" />
          {uiI18n.t('app.clear_all_c043160a')}
        </Button>
      </div>

      <div className="space-y-3">
        {visibleItems.map((item) => {
          const meta = STATUS_META[item.status] || STATUS_META.stopped;
          const Icon = meta.icon;
          const canResume = item.status === 'active';

          return (
            <div
              key={item.sessionId}
              className={cn(
                'rounded-2xl border p-4 transition-all',
                canResume
                  ? 'border-white/10 bg-white/[0.03] hover:border-primary/30 hover:bg-primary/5 cursor-pointer'
                  : 'border-white/5 bg-white/[0.02]',
              )}
              onClick={() => handleResume(item)}
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <SettingsBadge tone={meta.tone}>
                      <Icon className="w-3 h-3" />
                      {meta.label}
                    </SettingsBadge>
                    {item.fileName && (
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        {item.fileName}
                      </span>
                    )}
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-semibold truncate">
                      {item.animeName || item.torrentName || uiI18n.t('app.unknown_torrent_ce98986e')}
                    </h4>
                    <p className="text-xs text-muted-foreground truncate">
                      {item.fileName || uiI18n.t('app.no_file_selected_f76f1c1c')}
                      {item.episodeNumber ? uiI18n.t('app.episode_i18n_value_0_62a4e71d', { value0: item.episodeNumber }) : ''}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatDateTime(item.updatedAt)}
                      {item.error ? uiI18n.t('app.i18n_value_0_723b674d', { value0: item.error }) : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start">
                  {canResume && (
                    <Button
                      size="sm"
                      className="gap-2"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleResume(item);
                      }}
                    >
                      <Play className="w-4 h-4" />
                      {uiI18n.t('app.resume_b3bd0b5a')}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleRemove(item.sessionId);
                    }}
                    className="gap-2 text-muted-foreground hover:text-foreground"
                  >
                    <Trash2 className="w-4 h-4" />
                    {uiI18n.t('app.remove_e963907d')}
                  </Button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] text-muted-foreground">
                <div className="rounded-xl bg-white/5 px-3 py-2">
                  {uiI18n.t('app.peers_76cad1d3')} {item.seeders ?? 0} / {item.leechers ?? 0}
                </div>
                <div className="rounded-xl bg-white/5 px-3 py-2">{uiI18n.t('app.progress_04866c75')} {item.progress ?? 0}%</div>
                <div className="rounded-xl bg-white/5 px-3 py-2">
                  {uiI18n.t('app.session_ae2e2549')} {item.sessionId.slice(0, 12)}…
                </div>
                <div className="rounded-xl bg-white/5 px-3 py-2">
                  {uiI18n.t('app.started_fe3824e9')} {formatDateTime(item.startedAt)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
