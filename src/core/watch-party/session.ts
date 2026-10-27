import { randomUUID } from '../../lib/uuid';
import {
  ClockEstimator, PlaybackTimeline, ReadinessBarrier, getDriftCorrection,
  COMMAND_LEAD_MS, SYNC_INTERVAL_MS, type PlaybackSnapshot,
} from './sync';
import { MediaPeer, MediaResourceServer } from './media';
import { UploadBudget } from './upload-budget';

export interface RoomMedia {
  url: string;
  format: 'hls' | 'mp4';
  timelineId: string;
  subtitles?: { url: string; lang: string; label?: string }[];
  audioTracks?: { id: string; lang?: string; label?: string }[];
  bitrateBps?: number;
}
export interface P2PRoomState {
  room_id: string;
  host_id: string;
  host_epoch: number;
  p2p_enabled: boolean;
  source_revision: string | null;
  media: RoomMedia | null;
  buffering_policy: 'pause-together' | 'keep-playing';
  turn_servers: RTCIceServer[];
  host_seen_at: string;
  current_time_seconds?: number;
  is_playing?: boolean;
}
export interface PeerSignal {
  id: string;
  sender_id: string;
  recipient_id: string;
  host_epoch: number;
  connection_id: string;
  kind: 'hello' | 'offer' | 'answer' | 'ice' | 'bye';
  payload: Record<string, unknown>;
}
export type RoomConnectionStatus = 'loading-source' | 'connecting-peer' | 'buffering' | 'synchronized' | 'failed';
interface Peer {
  id: string;
  connectionId: string;
  pc: RTCPeerConnection;
  control?: RTCDataChannel;
  media?: MediaPeer;
  candidates: RTCIceCandidateInit[];
  restarts: number;
  rebuilds: number;
  recoveryTimer?: ReturnType<typeof setTimeout>;
  negotiating: Promise<void>;
  lastSeen: number;
  probe?: RTCDataChannel;
  probeStarted?: number;
  probeResolve?: () => void;
  probeReject?: (error: Error) => void;
  probePromise?: Promise<void>;
  probeTimeout?: ReturnType<typeof setTimeout>;
}
interface SessionOptions {
  state: P2PRoomState;
  userId: string;
  video: () => HTMLVideoElement | null;
  sendSignal: (recipient: string, connectionId: string, kind: PeerSignal['kind'], payload: Record<string, unknown>) => Promise<void>;
  sourceServer?: MediaResourceServer;
  onStatus: (status: RoomConnectionStatus, message?: string) => void;
  onDrift: (seconds: number) => void;
  memberIds?: string[];
  initialPosition?: number;
}

/** One host-to-viewer star. Database signaling authenticates identity; channels carry control/media. */
export class WatchPartySession {
  private peers = new Map<string, Peer>();
  private timeline: PlaybackTimeline;
  private clock = new ClockEstimator();
  private barrier = new ReadinessBarrier();
  private sequence = 0;
  private lastKnownPosition = 0;
  private disposed = false;
  private tickTimer: ReturnType<typeof setInterval>;
  private executionTimer: ReturnType<typeof setTimeout> | undefined;
  private lastPing = 0;
  private pendingPings = new Set<number>();
  private generatedEvents = new Map<string, number>();
  private seekTarget: number | undefined;
  private attachedVideo: HTMLVideoElement | null = null;
  private requestedPlay = false;
  private barrierPaused = false;
  private lastReadiness = 0;
  private lastSnapshot = 0;
  private lastHello = 0;
  private startedAt = performance.now();
  private failed = false;
  private earlyIce = new Map<string, RTCIceCandidateInit[]>();
  private upload = new UploadBudget();
  private listeners: Array<[string, EventListener]> = [];
  private members: Set<string> | undefined;
  private get isHost() { return this.options.userId === this.options.state.host_id; }

  constructor(private options: SessionOptions) {
    this.lastKnownPosition = options.initialPosition ?? options.state.current_time_seconds ?? 0;
    this.members = options.memberIds ? new Set(options.memberIds) : undefined;
    this.timeline = new PlaybackTimeline(options.state.host_epoch, options.state.source_revision || '');
    if (options.state.media?.bitrateBps) this.upload.setSourceBitrate(options.state.media.bitrateBps);
    this.tickTimer = setInterval(() => this.tick(), SYNC_INTERVAL_MS);
    if (this.isHost) this.command(false, options.initialPosition ?? options.state.current_time_seconds ?? 0, 1, 0);
    document.addEventListener('visibilitychange', this.resume);
    window.addEventListener('online', this.resume);
    options.onStatus('loading-source');
  }

  get hostMedia(): MediaPeer | undefined { return this.peers.get(this.options.state.host_id)?.media; }
  get currentPosition(): number { return this.lastKnownPosition; }
  setMembers(ids: string[]): void {
    this.members = new Set(ids);
    for (const id of this.peers.keys()) if (!this.members.has(id) && id !== this.options.state.host_id) this.dropPeer(id);
  }
  private resume = () => {
    if (document.visibilityState !== 'hidden') {
      this.clock.reset();
      if (!this.isHost) this.sendControl(this.options.state.host_id, { type: 'snapshot-request' });
      this.tick();
    }
  };

  async start(): Promise<void> {
    if (!this.isHost) await this.hello();
  }
  private async hello(): Promise<void> {
    if (this.disposed || this.peers.has(this.options.state.host_id)) return;
    this.lastHello = performance.now();
    this.options.onStatus('connecting-peer');
    await this.options.sendSignal(this.options.state.host_id, randomUUID(), 'hello', {});
  }
  async receive(signal: PeerSignal): Promise<void> {
    if (this.disposed || signal.recipient_id !== this.options.userId
      || signal.host_epoch !== this.options.state.host_epoch) return;
    const { sender_id: id } = signal;
    if (this.members && !this.members.has(id) && id !== this.options.state.host_id) return;
    if (!this.isHost && id !== this.options.state.host_id) return;
    if (this.isHost && id === this.options.userId) return;
    if (signal.kind === 'hello' && this.isHost) {
      const existing = this.peers.get(id);
      if (existing?.control?.readyState === 'open') return;
      if (existing && existing.pc.connectionState !== 'failed' && existing.pc.connectionState !== 'closed') return;
      if (this.peers.size >= 19 && !existing) return;
      this.dropPeer(id);
      const peer = this.makePeer(id, signal.connection_id);
      await this.offer(peer);
      return;
    }
    let peer = this.peers.get(id);
    if (!peer && signal.kind === 'ice') {
      const candidate = signal.payload.candidate as RTCIceCandidateInit;
      if (candidate && typeof candidate.candidate === 'string' && this.earlyIce.size < 20) {
        const candidates = this.earlyIce.get(signal.connection_id) || [];
        if (candidates.length < 64) candidates.push(candidate);
        this.earlyIce.set(signal.connection_id, candidates);
      }
      return;
    }
    if (signal.kind === 'offer' && !this.isHost && (!peer || peer.connectionId !== signal.connection_id)) {
      this.dropPeer(id);
      peer = this.makePeer(id, signal.connection_id);
    }
    if (!peer || peer.connectionId !== signal.connection_id) return;
    const current = peer;
    current.negotiating = current.negotiating.catch(() => {}).then(async () => {
      if (this.disposed || this.peers.get(id) !== current) return;
      if (signal.kind === 'offer' || signal.kind === 'answer') {
        const description = signal.payload.description as RTCSessionDescriptionInit;
        if (!description || description.type !== signal.kind || typeof description.sdp !== 'string') return;
        await current.pc.setRemoteDescription(description);
        for (const candidate of current.candidates.splice(0)) await current.pc.addIceCandidate(candidate);
        if (signal.kind === 'offer') {
          await current.pc.setLocalDescription(await current.pc.createAnswer());
          await this.signal(current, 'answer', { description: current.pc.localDescription?.toJSON() });
        }
      } else if (signal.kind === 'ice') {
        const candidate = signal.payload.candidate as RTCIceCandidateInit;
        if (!candidate || typeof candidate.candidate !== 'string') return;
        if (current.pc.remoteDescription) await current.pc.addIceCandidate(candidate);
        else if (current.candidates.length < 64) current.candidates.push(candidate);
      } else if (signal.kind === 'bye') this.dropPeer(id);
    }).catch(() => this.peerFailed(current, 'Could not negotiate the peer connection. Check your TURN settings and retry.'));
    await current.negotiating;
  }

  private makePeer(id: string, connectionId: string): Peer {
    const pc = new RTCPeerConnection({ iceServers: [
      { urls: 'stun:stun.cloudflare.com:3478' }, ...this.options.state.turn_servers,
    ] });
    const peer: Peer = { id, connectionId, pc, candidates: [], restarts: 0, rebuilds: 0, negotiating: Promise.resolve(), lastSeen: performance.now() };
    this.peers.set(id, peer);
    peer.candidates = this.earlyIce.get(connectionId) || [];
    this.earlyIce.delete(connectionId);
    this.barrier.update(id, { ready: false, bufferedSeconds: 0 }, performance.now());
    pc.onicecandidate = event => {
      if (event.candidate) void this.signal(peer, 'ice', { candidate: event.candidate.toJSON() }).catch(() => this.peerFailed(peer, 'Signaling failed. Retry the room connection.'));
    };
    const attach = (channel: RTCDataChannel) => {
      if (channel.label === 'control') {
        peer.control = channel;
        channel.onmessage = event => this.onControl(peer, event.data);
        channel.onopen = () => {
          peer.lastSeen = performance.now();
          const snapshot = this.timeline.latest();
          if (this.isHost && snapshot) this.sendControl(id, snapshot);
          if (!this.isHost) this.sendControl(id, { type: 'snapshot-request' });
        };
      } else if (channel.label === 'media') {
        peer.media = new MediaPeer(channel, this.isHost ? this.options.sourceServer : undefined,
          this.isHost ? { beforeServe: () => this.admitMedia(peer) } : undefined);
      } else if (channel.label === 'upload-probe') {
        peer.probe = channel;
        let received = 0;
        channel.binaryType = 'arraybuffer';
        channel.onmessage = event => {
          if (this.isHost || !(event.data instanceof ArrayBuffer) || event.data.byteLength > 16384) return;
          received += event.data.byteLength;
          if (received === 512 * 1024) this.sendControl(id, { type: 'upload-probe-result', bytes: received });
          if (received > 512 * 1024) channel.close();
        };
      } else channel.close();
    };
    pc.ondatachannel = event => attach(event.channel);
    if (this.isHost) {
      attach(pc.createDataChannel('control', { ordered: true }));
      attach(pc.createDataChannel('media', { ordered: true }));
      attach(pc.createDataChannel('upload-probe', { ordered: true }));
    }
    pc.onconnectionstatechange = () => {
      if (this.disposed || this.peers.get(id) !== peer) return;
      if (pc.connectionState === 'connected') {
        clearTimeout(peer.recoveryTimer);
        peer.recoveryTimer = undefined;
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        this.options.onStatus('connecting-peer', 'Reconnecting to host');
        if (!peer.recoveryTimer) peer.recoveryTimer = setTimeout(() => {
          peer.recoveryTimer = undefined;
          void this.recover(peer);
        }, 3000);
      }
    };
    peer.recoveryTimer = setTimeout(() => {
      peer.recoveryTimer = undefined;
      if (pc.connectionState !== 'connected') void this.recover(peer);
    }, 12000);
    return peer;
  }
  private signal(peer: Peer, kind: PeerSignal['kind'], payload: Record<string, unknown>) {
    return this.options.sendSignal(peer.id, peer.connectionId, kind, payload);
  }
  private async offer(peer: Peer, restart = false): Promise<void> {
    await peer.pc.setLocalDescription(await peer.pc.createOffer({ iceRestart: restart }));
    await this.signal(peer, 'offer', { description: peer.pc.localDescription?.toJSON() });
  }
  private async recover(peer: Peer): Promise<void> {
    if (this.disposed || this.peers.get(peer.id) !== peer) return;
    if (!this.isHost) {
      // The offerer owns ICE restarts; a viewer asks it to recover without replacing its session.
      if (peer.restarts++ >= 3) { this.fail('Cannot reach the host. Supply working TURN credentials or try another network.'); return; }
      await this.signal(peer, 'hello', {}).catch(() => {});
    } else if (peer.restarts < 2) {
      peer.restarts++;
      await this.offer(peer, true).catch(() => {});
    } else if (peer.rebuilds < 1) {
      const rebuilds = peer.rebuilds + 1;
      const id = peer.id;
      this.dropPeer(id);
      const replacement = this.makePeer(id, randomUUID());
      replacement.rebuilds = rebuilds;
      replacement.restarts = 2;
      await this.offer(replacement).catch(() => {});
      return;
    } else {
      this.peerFailed(peer, 'Peer connection failed after recovery attempts. Check TURN settings and retry.');
      return;
    }
    peer.recoveryTimer = setTimeout(() => {
      peer.recoveryTimer = undefined;
      if (peer.pc.connectionState !== 'connected') void this.recover(peer);
    }, 12000);
  }

  private sendControl(id: string, message: object): void {
    const channel = this.peers.get(id)?.control;
    if (channel?.readyState === 'open' && channel.bufferedAmount < 64 * 1024) {
      channel.send(JSON.stringify(message));
    }
  }
  private async admitMedia(peer: Peer): Promise<void> {
    if (!peer.probePromise) {
      peer.probePromise = new Promise<void>((resolve, reject) => {
        peer.probeResolve = resolve; peer.probeReject = reject;
        const start = () => {
          if (this.disposed || peer.probe?.readyState !== 'open') { reject(new Error('Upload probe is unavailable')); return; }
          peer.probeStarted = performance.now();
          const block = new Uint8Array(16384);
          for (let i = 0; i < 32; i++) peer.probe.send(block);
        };
        peer.probeTimeout = setTimeout(() => reject(new Error('Host upload measurement timed out. Retry or use a direct source.')), 10000);
        if (peer.probe?.readyState === 'open') start();
        else peer.probe?.addEventListener('open', start, { once: true });
      });
    }
    await peer.probePromise;
    const bitrate = this.options.sourceServer?.estimatedBitrate(this.options.video()?.duration || 0);
    if (bitrate) this.upload.setSourceBitrate(bitrate);
    this.upload.admit(peer.id);
  }
  private onControl(peer: Peer, raw: unknown): void {
    if (typeof raw !== 'string' || raw.length > 16384) return;
    let message: Record<string, unknown>;
    try { message = JSON.parse(raw); } catch { return; }
    if (!message || typeof message !== 'object') return;
    const now = performance.now();
    peer.lastSeen = now;
    if (message.type === 'ping' && this.isHost && typeof message.sentAt === 'number') {
      this.sendControl(peer.id, { type: 'pong', sentAt: message.sentAt, receivedAt: now, hostSentAt: performance.now() });
    } else if (message.type === 'pong' && !this.isHost && this.pendingPings.delete(message.sentAt as number)) {
      this.clock.addSample({ localSentAt: message.sentAt as number, localReceivedAt: now,
        hostReceivedAt: message.receivedAt as number, hostSentAt: message.hostSentAt as number });
      if (this.clock.ready) { const snapshot = this.timeline.latest(); if (snapshot) this.schedule(snapshot); }
    } else if (message.type === 'snapshot-request' && this.isHost) {
      const snapshot = this.timeline.latest();
      if (snapshot) this.sendControl(peer.id, snapshot);
    } else if (message.type === 'playback' && !this.isHost) {
      if (this.timeline.accept(message)) this.schedule(message as unknown as PlaybackSnapshot);
    } else if (message.type === 'ready' && this.isHost) {
      this.barrier.update(peer.id, { ready: message.ready === true, bufferedSeconds: Number(message.bufferedSeconds) }, now);
    } else if (message.type === 'upload-probe-result' && this.isHost && message.bytes === 512 * 1024 && peer.probeStarted) {
      this.upload.recordProbe(512 * 1024, now - peer.probeStarted);
      clearTimeout(peer.probeTimeout);
      peer.probeResolve?.(); peer.probeResolve = undefined; peer.probeStarted = undefined;
    }
  }

  private command(isPlaying: boolean, position: number, rate = 1, lead = COMMAND_LEAD_MS): void {
    if (!this.isHost || !Number.isFinite(position)) return;
    const duration = this.options.video()?.duration;
    if (Number.isFinite(duration) && duration! > 0) position = Math.min(position, duration!);
    const snapshot: PlaybackSnapshot = { version: 1, type: 'playback', hostEpoch: this.options.state.host_epoch,
      sequence: ++this.sequence, sourceRevision: this.options.state.source_revision || '',
      isPlaying, position: Math.max(0, position), rate, effectiveAt: performance.now() + lead };
    this.timeline.accept(snapshot);
    this.schedule(snapshot);
    for (const id of this.peers.keys()) this.sendControl(id, snapshot);
  }
  private schedule(snapshot: PlaybackSnapshot): void {
    clearTimeout(this.executionTimer);
    if (!this.isHost && !this.clock.ready) return;
    const now = this.isHost ? performance.now() : this.clock.toHostTime(performance.now());
    // Commands execute at their deadline; the 250ms loop is only drift correction.
    this.executionTimer = setTimeout(() => this.applyTimeline(), Math.max(0, snapshot.effectiveAt - now) + 1);
  }
  requestPlay(isPlaying: boolean, position?: number): void {
    if (!this.isHost) return;
    const video = this.options.video();
    this.requestedPlay = isPlaying;
    this.barrierPaused = false;
    const now = performance.now();
    const running = this.timeline.stateAt(now);
    // A scheduled pause anchors at its future execution time, not the click time.
    const target = position ?? (running?.isPlaying
      ? running.position + COMMAND_LEAD_MS / 1000 * running.rate
      : video?.currentTime ?? 0);
    this.command(isPlaying, target, running?.rate || 1);
  }
  private attachVideo(video: HTMLVideoElement): void {
    if (this.attachedVideo === video) return;
    this.detachVideo();
    this.attachedVideo = video;
    const intent = (event: Event) => {
      const generated = this.generatedEvents.get(event.type) || 0;
      if (generated) { this.generatedEvents.set(event.type, generated - 1); return; }
      if (event.type === 'seeked' && this.seekTarget !== undefined && Math.abs(video.currentTime - this.seekTarget) < 0.15) {
        this.seekTarget = undefined; return;
      }
      if (!this.isHost) { this.applyTimeline(); return; }
      if (event.type === 'play') this.requestPlay(true);
      else if (event.type === 'pause') this.requestPlay(false);
      else if (event.type === 'seeked') this.command(this.requestedPlay, video.currentTime, 1);
      else if (event.type === 'ratechange') this.command(this.requestedPlay, video.currentTime, video.playbackRate);
      this.applyTimeline();
    };
    for (const name of ['play', 'pause', 'seeked', 'ratechange']) {
      const listener = intent as EventListener;
      video.addEventListener(name, listener);
      this.listeners.push([name, listener]);
    }
    // Each adapter cancels only its obsolete reads. Cancelling every media RPC on
    // native `seeking` also aborts HLS's initial timestamp alignment and stalls startup.
  }
  private detachVideo(): void {
    for (const [name, listener] of this.listeners) this.attachedVideo?.removeEventListener(name, listener);
    this.listeners = [];
    this.attachedVideo = null;
  }
  private buffered(video: HTMLVideoElement): number {
    for (let i = 0; i < video.buffered.length; i++) {
      if (video.buffered.start(i) <= video.currentTime + 0.1 && video.buffered.end(i) > video.currentTime) {
        const end = video.buffered.end(i);
        // Near the end, all remaining media is sufficient readiness.
        return Number.isFinite(video.duration) && end >= video.duration - 0.1 ? 5 : end - video.currentTime;
      }
    }
    return 0;
  }
  private applyTimeline(): void {
    const video = this.options.video();
    if (!video || !video.readyState || (!this.isHost && !this.clock.ready)) return;
    const state = this.timeline.stateAt(this.isHost ? performance.now() : this.clock.toHostTime(performance.now()));
    if (!state) return;
    const correction = getDriftCorrection(state.position, video.currentTime, state.rate);
    const drift = Math.abs(state.position - video.currentTime);
    this.options.onDrift(drift);
    if (correction.kind === 'seek' && !video.seeking) {
      this.seekTarget = correction.position;
      video.currentTime = correction.position!;
    }
    if (Math.abs(video.playbackRate - correction.playbackRate) > 0.001) {
      this.markGenerated('ratechange');
      video.playbackRate = correction.playbackRate;
    }
    if (state.isPlaying && video.paused && this.buffered(video) > 0.25) {
      this.markGenerated('play');
      void video.play().catch(() => {
        this.generatedEvents.set('play', Math.max(0, (this.generatedEvents.get('play') || 0) - 1));
        this.options.onStatus('buffering', 'Tap the player to allow playback.');
      });
    } else if (!state.isPlaying && !video.paused) {
      this.markGenerated('pause');
      video.pause();
    }
    this.options.onStatus(this.buffered(video) < 0.25 ? 'buffering' : drift <= 0.1 ? 'synchronized' : 'buffering');
  }
  private tick(): void {
    if (this.disposed || this.failed) return;
    const now = performance.now();
    const video = this.options.video();
    if (video) this.attachVideo(video);
    if (!this.isHost) {
      const host = this.peers.get(this.options.state.host_id);
      if (!host && now - this.lastHello > 5000 && now - this.startedAt < 30000) void this.hello().catch(() => {});
      if (!host && now - this.startedAt >= 30000) this.fail('The host is unavailable. Retry or take over after its heartbeat expires.');
      if (now - this.lastPing >= (this.clock.ready ? 3000 : 250)) {
        this.lastPing = now;
        this.pendingPings.add(now);
        for (const sent of this.pendingPings) if (now - sent > 10000) this.pendingPings.delete(sent);
        this.sendControl(this.options.state.host_id, { type: 'ping', sentAt: now });
      }
      if (video && now - this.lastReadiness > 1000) {
        this.lastReadiness = now;
        this.sendControl(this.options.state.host_id, { type: 'ready', ready: video.readyState >= 3,
          bufferedSeconds: this.buffered(video) });
      }
      if (host?.control?.readyState === 'open' && now - host.lastSeen > 15000) {
        if (video && !video.paused) { this.markGenerated('pause'); video.pause(); }
        this.fail('The host stopped responding. Retry or take over after its heartbeat expires.');
        return;
      }
    } else if (video) {
      for (const peer of this.peers.values()) {
        if (now - peer.lastSeen > 5000) this.barrier.update(peer.id, { ready: false, bufferedSeconds: 0 }, now);
      }
      const allReady = this.buffered(video) >= 5 && this.barrier.inspect(now).ready;
      if (this.options.state.buffering_policy === 'pause-together' && this.requestedPlay) {
        if (!allReady && !this.barrierPaused) {
          this.barrierPaused = true;
          this.command(false, this.timeline.stateAt(now)?.position ?? video.currentTime, 1, 0);
        } else if (allReady && this.barrierPaused) {
          this.barrierPaused = false;
          this.command(true, video.currentTime);
        }
      }
      if (now - this.lastSnapshot > 3000) {
        this.lastSnapshot = now;
        const snapshot = this.timeline.latest();
        if (snapshot) for (const id of this.peers.keys()) this.sendControl(id, snapshot);
      }
    }
    this.applyTimeline();
    if (video && video.readyState >= 1) this.lastKnownPosition = video.currentTime;
  }
  private fail(message: string) {
    this.failed = true;
    const video = this.options.video();
    if (!this.isHost && video && !video.paused) { this.markGenerated('pause'); video.pause(); }
    this.options.onStatus('failed', message);
  }
  private markGenerated(event: string): void { this.generatedEvents.set(event, (this.generatedEvents.get(event) || 0) + 1); }
  private peerFailed(peer: Peer, message: string): void {
    if (!this.isHost) this.fail(message);
    this.dropPeer(peer.id);
  }
  private dropPeer(id: string): void {
    const peer = this.peers.get(id);
    if (!peer) return;
    this.peers.delete(id);
    clearTimeout(peer.recoveryTimer);
    clearTimeout(peer.probeTimeout);
    peer.probeReject?.(new Error('Peer disconnected during upload measurement'));
    peer.probe?.close();
    this.upload.remove(id);
    peer.pc.onconnectionstatechange = null;
    peer.media?.close();
    peer.control?.close();
    peer.pc.close();
    this.barrier.remove(id);
  }
  close(): void {
    this.disposed = true;
    clearInterval(this.tickTimer);
    clearTimeout(this.executionTimer);
    document.removeEventListener('visibilitychange', this.resume);
    window.removeEventListener('online', this.resume);
    this.detachVideo();
    for (const id of [...this.peers.keys()]) this.dropPeer(id);
  }
}
