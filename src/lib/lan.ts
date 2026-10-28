// Serverless LAN play over a WebRTC data channel.
// Signalling is manual: the host shares an invite code (or link/QR), the guest
// answers with a reply code. Both are compressed SDP blobs with ICE candidates
// already gathered, so no signalling server is needed on the local network.

import type { Clocks, Rules } from './db';

export type LanMessage =
  | { t: 'hello'; v: 1; name: string; hostColor: 'w' | 'b'; realm: string; pgn: string; gameId: string; rules?: Rules; clock?: Clocks }
  | { t: 'hi'; name: string }
  | { t: 'move'; uci: string; ply: number; clock?: Clocks }
  | { t: 'flag'; color: 'w' | 'b' }
  | { t: 'resign' }
  | { t: 'draw'; action: 'offer' | 'accept' | 'decline' }
  | { t: 'rematch'; action: 'offer' | 'accept' }
  | { t: 'emote'; text: string }
  | { t: 'sync-req' };

export type LinkState = 'idle' | 'gathering' | 'waiting' | 'connecting' | 'open' | 'closed' | 'failed';

const PUBLIC_STUN = [{ urls: 'stun:stun.l.google.com:19302' }];

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const out = new Blob([data as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

const b64url = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

export async function encodeSignal(desc: RTCSessionDescriptionInit): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify({ t: desc.type, s: desc.sdp }));
  return b64url(await pipe(json, new CompressionStream('deflate-raw')));
}

export async function decodeSignal(code: string): Promise<RTCSessionDescriptionInit> {
  const clean = code.trim().replace(/^.*#join=/, '').replace(/\s+/g, '');
  const raw = await pipe(unb64url(clean), new DecompressionStream('deflate-raw'));
  const { t, s } = JSON.parse(new TextDecoder().decode(raw));
  return { type: t, sdp: s };
}

export class LanLink {
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null = null;
  state: LinkState = 'idle';
  onMessage: (m: LanMessage) => void = () => {};
  onState: (s: LinkState) => void = () => {};

  constructor(useStun: boolean) {
    this.pc = new RTCPeerConnection({ iceServers: useStun ? PUBLIC_STUN : [] });
    this.pc.onconnectionstatechange = () => {
      const s = this.pc.connectionState;
      if (s === 'failed') this.set('failed');
      else if (s === 'disconnected' || s === 'closed') this.set('closed');
    };
    this.pc.ondatachannel = (e) => this.bind(e.channel);
  }

  private set(s: LinkState) {
    this.state = s;
    this.onState(s);
  }

  private bind(dc: RTCDataChannel) {
    this.dc = dc;
    dc.onopen = () => this.set('open');
    dc.onclose = () => this.set('closed');
    dc.onmessage = (e) => {
      try { this.onMessage(JSON.parse(e.data)); } catch (err) { console.warn('bad message', err); }
    };
  }

  private async gathered(): Promise<RTCSessionDescriptionInit> {
    if (this.pc.iceGatheringState !== 'complete') {
      await new Promise<void>((resolve) => {
        const done = () => { if (this.pc.iceGatheringState === 'complete') resolve(); };
        this.pc.addEventListener('icegatheringstatechange', done);
        // Don't wait forever on slow/absent STUN; host candidates arrive almost instantly.
        setTimeout(resolve, 2500);
      });
    }
    return this.pc.localDescription!;
  }

  /** Host: create the invite code. */
  async host(): Promise<string> {
    this.set('gathering');
    this.bind(this.pc.createDataChannel('chess', { ordered: true }));
    await this.pc.setLocalDescription(await this.pc.createOffer());
    const code = await encodeSignal(await this.gathered());
    this.set('waiting');
    return code;
  }

  /** Host: accept the guest's reply code. */
  async accept(reply: string) {
    this.set('connecting');
    await this.pc.setRemoteDescription(await decodeSignal(reply));
  }

  /** Guest: turn an invite code into a reply code. */
  async join(invite: string): Promise<string> {
    this.set('gathering');
    await this.pc.setRemoteDescription(await decodeSignal(invite));
    await this.pc.setLocalDescription(await this.pc.createAnswer());
    const code = await encodeSignal(await this.gathered());
    this.set('connecting');
    return code;
  }

  send(m: LanMessage) {
    if (this.dc?.readyState === 'open') this.dc.send(JSON.stringify(m));
  }

  close() {
    this.dc?.close();
    this.pc.close();
    this.set('closed');
  }
}
