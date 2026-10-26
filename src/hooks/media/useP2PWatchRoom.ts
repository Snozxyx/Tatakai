import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { FeatureFlag, isEnabled } from '@/core/feature-flags/feature-flags';
import { WatchPartySession, type P2PRoomState, type PeerSignal, type RoomConnectionStatus, type RoomMedia } from '@/core/watch-party/session';
import { MediaResourceServer, createWatchPartyTransport, registerWatchPartyMedia, isLocalMediaUrl } from '@/core/watch-party/media';
import { registerNativeSource } from '@/core/mobile/localProxyNative';
import type { WatchRoom } from './useWatchRoom';
import { parseP2PRoomState } from '@/core/watch-party/room-state';

// New RPCs are generated after the migration is deployed. Keep the untyped boundary here.
const db = supabase as any;
interface HostSource {
  url: string;
  isM3U8?: boolean;
  isEmbed?: boolean;
  originalUrl?: string;
  headers?: Record<string, string>;
}
interface Options {
  room?: WatchRoom;
  userId?: string;
  isMember: boolean;
  playerRef: MutableRefObject<HTMLVideoElement | null>;
  hostSource?: HostSource;
  headers?: Record<string, string>;
  subtitles?: RoomMedia['subtitles'];
  timelineId: string;
  memberIds: string[];
}

export function useP2PWatchRoom(options: Options) {
  const { room, userId, isMember, playerRef } = options;
  const queryClient = useQueryClient();
  const rolloutAvailable = isEnabled(FeatureFlag.WATCH_TOGETHER_P2P);
  const enabled = room?.p2p_enabled === true;
  const key = useMemo(() => ['watch-room-p2p', room?.id, userId], [room?.id, userId]);
  const { data: state, refetch, error: stateError, isFetchedAfterMount: stateFresh } = useQuery<P2PRoomState>({
    queryKey: key,
    enabled: !!room?.id && !!userId && isMember && (enabled || rolloutAvailable),
    queryFn: async () => {
      const { data, error } = await db.rpc('get_watch_room_p2p_state', { p_room_id: room!.id });
      if (error) throw new Error(error.message || 'Could not load the peer room. Apply the watchroom migration first.');
      return parseP2PRoomState(data);
    },
    refetchInterval: enabled ? 5000 : false,
    retry: 1,
  });
  const [status, setStatus] = useState<RoomConnectionStatus>('loading-source');
  const [message, setMessage] = useState('');
  const [drift, setDrift] = useState(0);
  const [mediaReady, setMediaReady] = useState(false);
  const [retryGeneration, setRetryGeneration] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [peerSubtitles, setPeerSubtitles] = useState<RoomMedia['subtitles']>([]);
  const sessionRef = useRef<WatchPartySession | null>(null);
  const resumeRef = useRef<{ revision: string; position: number } | null>(null);
  const publishedRef = useRef('');
  const [publishRetry, setPublishRetry] = useState(0);
  const serverRef = useRef<MediaResourceServer | null>(null);
  const sourceRef = useRef(options.hostSource);
  sourceRef.current = options.hostSource;
  const isHost = !!userId && state?.host_id === userId;
  const sourceToken = options.hostSource && !options.hostSource.isEmbed
    ? JSON.stringify([options.timelineId, options.hostSource.url, !!options.hostSource.isM3U8, options.headers, options.hostSource.headers]) : '';

  // Atomic server-assigned revision invalidates old commands and byte requests together.
  useEffect(() => {
    if (!stateFresh || !enabled || !isHost || !room?.id || !state || !sourceToken || !sourceRef.current) return;
    const token = `${state.host_epoch}:${sourceToken}`;
    if (publishedRef.current === token && state.media) return;
    const source = sourceRef.current;
    let cancelled = false;
    setPublishing(true);
    const media: RoomMedia = {
      url: source.originalUrl || source.url,
      format: source.isM3U8 ? 'hls' : 'mp4',
      timelineId: options.timelineId,
      subtitles: (options.subtitles || []).filter(track => {
        try { return ['http:', 'https:'].includes(new URL(track.url).protocol); } catch { return false; }
      }).map(track => ({ url: track.url, lang: track.lang || 'und', ...(track.label ? { label: track.label } : {}) })),
      audioTracks: [],
    };
    if (!publishedRef.current && state.media?.url === media.url && state.media.format === media.format && state.media.timelineId === media.timelineId) {
      // Refreshing the host must not reset the source revision or the room to zero.
      publishedRef.current = token;
      setPublishing(false);
      return;
    }
    setMediaReady(false);
    void db.rpc('publish_watch_room_p2p_media', {
      p_room_id: room.id, p_expected_epoch: state.host_epoch, p_media: media,
      p_expected_source_revision: state.source_revision,
    }).then(({ data, error }: { data: P2PRoomState; error: { message: string } | null }) => {
      if (cancelled) return;
      if (error) throw new Error(error.message);
      publishedRef.current = token;
      setPublishing(false);
      queryClient.setQueryData(key, parseP2PRoomState(data));
    }).catch(() => {
      if (!cancelled) { setStatus('failed'); setMessage('Could not publish the room source. Retry the connection.'); }
    }).finally(() => { if (!cancelled) setPublishing(false); });
    return () => { cancelled = true; };
    // Media metadata travels with a source revision; object re-renders must not republish it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateFresh, enabled, isHost, room?.id, state?.host_epoch, state?.source_revision, sourceToken, publishRetry]);

  const turnKey = JSON.stringify(state?.turn_servers || []);
  const hostSessionSourceKey = isHost ? sourceToken : '';
  useEffect(() => {
    setMediaReady(false);
    if (!stateFresh || !enabled || !state?.p2p_enabled || !state.source_revision || !state.media || !userId || !isMember) return;
    if (state.host_id === userId && (!sourceRef.current || sourceRef.current.isEmbed
      || state.media.url !== (sourceRef.current.originalUrl || sourceRef.current.url)
      || state.media.timelineId !== options.timelineId)) return;
    if (typeof RTCPeerConnection === 'undefined') {
      setStatus('failed'); setMessage('This device does not support WebRTC peer connections.'); return;
    }
    const initial = state;
    const initialPosition = resumeRef.current?.revision === state.source_revision
      ? resumeRef.current.position : state.current_time_seconds ?? room?.current_time_seconds ?? 0;
    let cancelled = false;
    let cleanupRegistry: (() => void) | undefined;
    let channel: ReturnType<typeof supabase.channel> | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let session: WatchPartySession | undefined;
    let server: MediaResourceServer | undefined;
    const subtitleRequests = new AbortController();
    const subtitleBlobs: string[] = [];
    setPeerSubtitles([]);
    const seen = new Set<string>();
    const report = (next: RoomConnectionStatus, detail = '') => {
      if (!cancelled) { setStatus(next); setMessage(detail); }
    };
    const receive = async (row: PeerSignal) => {
      if (cancelled || seen.has(row.id)) return;
      seen.add(row.id);
      if (seen.size > 2048) seen.delete(seen.values().next().value!);
      await session?.receive(row);
    };
    let polling = false;
    const readSignals = async () => {
      if (cancelled || polling) return;
      polling = true;
      try {
        // Page the complete short-lived inbox; a busy room must not starve behind seen rows.
        for (let offset = 0; offset < 4096 && !cancelled; offset += 256) {
          const { data, error } = await db.from('watch_room_p2p_signals').select('*')
            .eq('room_id', initial.room_id).eq('recipient_id', userId).eq('host_epoch', initial.host_epoch)
            .order('created_at').order('id').range(offset, offset + 255);
          if (error) throw error;
          for (const row of data || []) await receive(row);
          if (!data || data.length < 256) break;
        }
      } catch { report('connecting-peer', 'Signaling interrupted. Reconnecting to the room…'); }
      finally { polling = false; }
    };
    const start = async () => {
      if (initial.host_id === userId) {
        const source = sourceRef.current;
        let sourceUrl = source?.url || initial.media!.url;
        const headers = { ...options.headers, ...source?.headers };
        const desktop = (window as any).electron;
        if (desktop?.proxyExtensionSource && !/^http:\/\/(127\.|localhost)/i.test(sourceUrl)) {
          const result = await desktop.proxyExtensionSource({ url: sourceUrl, headers });
          sourceUrl = result?.url || result?.proxyUrl || sourceUrl;
        } else {
          sourceUrl = await registerNativeSource(sourceUrl, headers) || sourceUrl;
        }
        if (cancelled) return;
        const additionalResources = [];
        for (const track of initial.media!.subtitles || []) {
          let localUrl = track.url;
          if (desktop?.proxyExtensionSource && !isLocalMediaUrl(localUrl)) {
            const result = await desktop.proxyExtensionSource({ url: localUrl, headers });
            localUrl = result?.url || result?.proxyUrl || localUrl;
          } else localUrl = await registerNativeSource(localUrl, headers) || localUrl;
          additionalResources.push({ url: track.url, sourceUrl: localUrl });
        }
        if (cancelled) return;
        server = new MediaResourceServer({ rootUrl: initial.media!.url, sourceUrl, headers, format: initial.media!.format, additionalResources });
        serverRef.current = server;
      }
      session = new WatchPartySession({ state: initial, userId, video: () => playerRef.current,
        initialPosition,
        memberIds: options.memberIds,
        sourceServer: server,
        sendSignal: async (recipient, connectionId, kind, payload) => {
          const { error } = await db.rpc('send_watch_room_p2p_signal', {
            p_room_id: initial.room_id, p_recipient_id: recipient, p_host_epoch: initial.host_epoch,
            p_connection_id: connectionId, p_kind: kind, p_payload: payload,
          });
          if (error) throw new Error('Room signaling failed');
        },
        onStatus: report, onDrift: value => { if (!cancelled) setDrift(value); },
      });
      sessionRef.current = session;
      if (initial.host_id !== userId) {
        const transport = createWatchPartyTransport({ rootUrl: initial.media!.url,
          format: initial.media!.format,
          peer: () => session?.hostMedia,
          onMode: mode => report(mode === 'peer' ? 'connecting-peer' : 'loading-source'),
        });
        cleanupRegistry = registerWatchPartyMedia(initial.media!.url, transport);
        // Subtitle downloads use the same authorized host transport, not a third-party proxy.
        void (async () => {
          const tracks: NonNullable<RoomMedia['subtitles']> = [];
          let totalBytes = 0;
          // Caption downloads are sequential and retain at most 8 MiB per source.
          for (const track of initial.media!.subtitles || []) {
            if (cancelled) break;
            try {
              const response = await transport.fetch(track.url, { signal: subtitleRequests.signal });
              const bytes = await response.blob();
              if (bytes.size > 2 * 1024 * 1024 || totalBytes + bytes.size > 8 * 1024 * 1024) continue;
              const blob = URL.createObjectURL(bytes);
              if (cancelled) { URL.revokeObjectURL(blob); break; }
              totalBytes += bytes.size; subtitleBlobs.push(blob); tracks.push({ ...track, url: blob });
            } catch { /* An unavailable subtitle must not block room playback. */ }
          }
          if (!cancelled) setPeerSubtitles(tracks);
        })();
      }
      channel = supabase.channel(`watch-p2p-signals-${initial.room_id}-${userId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'watch_room_p2p_signals', filter: `recipient_id=eq.${userId}` }, payload => { void receive(payload.new as PeerSignal).catch(() => report('failed', 'Could not negotiate the peer connection. Retry the room.')); })
        .subscribe(() => { void readSignals(); });
      // Polling also covers missed realtime events and reconnect gaps.
      poll = setInterval(() => { void readSignals(); }, 2000);
      await readSignals();
      await session.start();
      if (cancelled) return;
      setMediaReady(true);
      if (initial.host_id === userId) {
        const beat = () => {
          const video = playerRef.current;
          void db.rpc('watch_room_p2p_heartbeat', { p_room_id: initial.room_id, p_expected_epoch: initial.host_epoch,
            p_position: video && Number.isFinite(video.currentTime) ? video.currentTime : null,
            p_is_playing: video ? !video.paused : null,
            p_expected_source_revision: initial.source_revision,
          })
            .then(({ error }: { error: unknown }) => { if (error) report('failed', 'Host authorization expired. Rejoin the room.'); });
        };
        beat(); heartbeat = setInterval(beat, 10000);
      }
    };
    void start().catch(() => report('failed', 'Could not prepare peer playback. Check source access and TURN settings, then retry.'));
    return () => {
      cancelled = true;
      if (session) resumeRef.current = { revision: initial.source_revision!, position: session.currentPosition };
      subtitleRequests.abort();
      for (const blob of subtitleBlobs) URL.revokeObjectURL(blob);
      clearInterval(poll); clearInterval(heartbeat);
      if (channel) void supabase.removeChannel(channel);
      cleanupRegistry?.(); session?.close(); server?.close();
      if (sessionRef.current === session) sessionRef.current = null;
      if (serverRef.current === server) serverRef.current = null;
    };
    // A fresh authenticated revision/epoch creates a fresh peer session. Heartbeats don't.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateFresh, enabled, state?.source_revision, state?.host_epoch, state?.host_id, state?.buffering_policy, turnKey, userId, isMember, retryGeneration, hostSessionSourceKey]);

  const memberKey = [...options.memberIds].sort().join(',');
  useEffect(() => { sessionRef.current?.setMembers(memberKey ? memberKey.split(',') : []); }, [memberKey]);
  useEffect(() => { if (enabled && isMember) void refetch(); }, [enabled, isMember, room?.host_epoch, room?.updated_at, refetch]);

  const configure = useCallback(async (settings: { enabled: boolean; bufferingPolicy: P2PRoomState['buffering_policy']; turnServers: RTCIceServer[] }) => {
    if (!room?.id) return;
    const { data, error } = await db.rpc('configure_watch_room_p2p', {
      p_room_id: room.id, p_enabled: settings.enabled, p_buffering_policy: settings.bufferingPolicy, p_turn_servers: settings.turnServers,
    });
    if (error) throw new Error(error.message);
    publishedRef.current = '';
    queryClient.setQueryData(key, parseP2PRoomState(data));
    await queryClient.invalidateQueries({ queryKey: ['watch-room', room.id] });
  }, [room?.id, queryClient, key]);
  const transfer = useCallback(async (targetId: string, takeover = false) => {
    if (!state) throw new Error('Room state is unavailable');
    if (takeover) {
      const source = options.hostSource || (state.media ? { url: state.media.url, isM3U8: state.media.format === 'hls' } : undefined);
      if (!source || source.isEmbed || isLocalMediaUrl(source.url)) throw new Error('The former host’s private source is unavailable on this device.');
      const probe = new MediaResourceServer({ rootUrl: source.url, headers: options.headers, format: source.isM3U8 ? 'hls' : 'mp4' });
      try {
        const result = await probe.fetch(source.url, source.isM3U8 ? undefined : { range: { start: 0, end: 65535 } });
        if (!result.ok) throw new Error('Source is not accessible');
        await result.body?.cancel();
      } finally { probe.close(); }
    }
    const { data, error } = await db.rpc('transfer_watch_room_p2p_host', { p_room_id: state.room_id,
      p_expected_epoch: state.host_epoch, p_target_user_id: targetId, p_takeover: takeover });
    if (error) throw new Error(error.message);
    queryClient.setQueryData(key, parseP2PRoomState(data));
    await queryClient.invalidateQueries({ queryKey: ['watch-room', state.room_id] });
  }, [state, options.hostSource, options.headers, queryClient, key]);
  const retry = useCallback(() => {
    setMessage(''); setStatus('connecting-peer'); publishedRef.current = '';
    setRetryGeneration(value => value + 1); setPublishRetry(value => value + 1); void refetch();
  }, [refetch]);
  const streamingData = useMemo(() => state?.media && mediaReady ? {
    sources: [{ url: state.media.url, isM3U8: state.media.format === 'hls', isEmbed: false, quality: 'Room source' }],
    headers: {}, subtitles: peerSubtitles || [], tracks: [], providerServers: [],
  } : undefined, [state?.media, mediaReady, peerSubtitles]);
  const unsupportedSource = enabled && isHost && options.hostSource?.isEmbed;
  return { enabled, rolloutAvailable, state, isHost, status: stateError || unsupportedSource ? 'failed' as const : status,
    message: unsupportedSource ? 'Choose an HLS or MP4 source. Embedded players cannot provide synchronized peer playback.' : stateError ? 'Could not load P2P room settings. Apply the migration and rejoin.' : message,
    drift, mediaReady, publishing, streamingData, configure, transfer, retry,
    requestPlay: (playing: boolean) => sessionRef.current?.requestPlay(playing),
  };
}
