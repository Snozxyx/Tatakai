import { afterEach, expect, mock, spyOn, test } from 'bun:test';
import { WatchPartySession, type P2PRoomState, type PeerSignal } from '../src/core/watch-party/session';

const state: P2PRoomState = {
  room_id: 'room', host_id: 'host', host_epoch: 1, p2p_enabled: true,
  source_revision: 'source-one', media: { url: 'https://cdn.example/video.mp4', format: 'mp4', timelineId: 'episode-one' },
  buffering_policy: 'keep-playing', turn_servers: [], host_seen_at: new Date().toISOString(),
};
const active: WatchPartySession[] = [];
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalRTC = Object.getOwnPropertyDescriptor(globalThis, 'RTCPeerConnection');

class FakePeerConnection {
  connectionState = 'new';
  localDescription: { toJSON: () => unknown } | null = null;
  onconnectionstatechange: (() => void) | null = null;
  createDataChannel(label: string) {
    return Object.assign(new EventTarget(), { label, readyState: 'connecting', bufferedAmount: 0, close() {}, send() {} });
  }
  async createOffer() { return { type: 'offer', sdp: 'test-offer' }; }
  async setLocalDescription(description: unknown) { this.localDescription = { toJSON: () => description }; }
  close() { this.connectionState = 'closed'; }
}

function session(video: HTMLVideoElement | null = null) {
  Object.defineProperty(globalThis, 'document', { configurable: true, value: new EventTarget() });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
  Object.defineProperty(globalThis, 'RTCPeerConnection', { configurable: true, value: FakePeerConnection });
  const instance = new WatchPartySession({ state, userId: 'host', video: () => video,
    sendSignal: mock(async () => {}), onStatus: mock(() => {}), onDrift: mock(() => {}),
  });
  active.push(instance);
  return instance;
}
const hello = (): PeerSignal => ({ id: crypto.randomUUID(), sender_id: 'viewer', recipient_id: 'host', host_epoch: 1,
  connection_id: 'connection-one', kind: 'hello', payload: {} });

afterEach(() => {
  for (const instance of active.splice(0)) instance.close();
  mock.restore();
  for (const [key, descriptor] of [['document', originalDocument], ['window', originalWindow], ['RTCPeerConnection', originalRTC]] as const) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

test('a connected peer clears its timer handle so a later disconnect can arm recovery', async () => {
  const instance = session();
  await instance.receive(hello());
  const peer = (instance as any).peers.get('viewer');
  expect(peer.recoveryTimer).toBeDefined();
  peer.pc.connectionState = 'connected'; peer.pc.onconnectionstatechange();
  expect(peer.recoveryTimer).toBeUndefined();
  peer.pc.connectionState = 'disconnected'; peer.pc.onconnectionstatechange();
  expect(peer.recoveryTimer).toBeDefined();
});

test('duplicate hello signaling does not destroy a pending peer handshake', async () => {
  const instance = session();
  await instance.receive(hello());
  const peer = (instance as any).peers.get('viewer');
  await instance.receive(hello());
  expect((instance as any).peers.get('viewer')).toBe(peer);
  expect(peer.pc.connectionState).toBe('new');
});

test('room membership revocation closes that peer without failing healthy host playback', async () => {
  const instance = session();
  await instance.receive(hello());
  const peer = (instance as any).peers.get('viewer');
  instance.setMembers(['host']);
  expect(peer.pc.connectionState).toBe('closed');
  expect((instance as any).peers.size).toBe(0);
  expect((instance as any).failed).toBe(false);
  await instance.receive(hello());
  expect((instance as any).peers.size).toBe(0);
});

test('one rebuild does not reset the two-ICE-restart recovery budget', async () => {
  const instance = session();
  await instance.receive(hello());
  const peer = (instance as any).peers.get('viewer');
  peer.restarts = 2;
  await (instance as any).recover(peer);
  const replacement = (instance as any).peers.get('viewer');
  expect(replacement.restarts).toBe(2);
  expect(replacement.rebuilds).toBe(1);
  await (instance as any).recover(replacement);
  expect((instance as any).peers.size).toBe(0);
  expect((instance as any).failed).toBe(false);
});

test('a scheduled pause anchors at its execution position rather than rewinding the lead interval', () => {
  let now = 1000;
  spyOn(performance, 'now').mockImplementation(() => now);
  const video = { currentTime: 10.5 } as HTMLVideoElement;
  const instance = session(video);
  instance.requestPlay(true, 10);
  now = 2500;
  expect((instance as any).timeline.stateAt(now).position).toBeCloseTo(10.5);
  instance.requestPlay(false);
  expect((instance as any).timeline.latest().position).toBeCloseTo(11.5);
});
