// Serverless LAN play over a WebRTC data channel.
// Signalling is manual: the host shares an invite code (or link/QR), the guest
// answers with a reply code. Both are compressed SDP blobs with ICE candidates
// already gathered, so no signalling server is needed on the local network.
//
// Rivals you've met before can skip the reply. Each device keeps one certificate,
// so the host already knows the rival's fingerprint; the invite also carries the
// ICE login the guest must use. The host writes the guest's answer itself and the
// guest only has to open the link.

import type { Clocks, Rules } from './db';

export type LanMessage =
  | { t: 'hello'; v: 1; name: string; hostColor: 'w' | 'b'; realm: string; pgn: string; gameId: string; rules?: Rules; clock?: Clocks; auto?: boolean }
  | { t: 'hi'; name: string; auto?: boolean }
  | { t: 'move'; uci: string; ply: number; clock?: Clocks }
  | { t: 'flag'; color: 'w' | 'b' }
  | { t: 'resign' }
  | { t: 'draw'; action: 'offer' | 'accept' | 'decline' }
  | { t: 'rematch'; action: 'offer' | 'accept' }
  | { t: 'emote'; text: string }
  | { t: 'sync-req' };

export type LinkState = 'idle' | 'gathering' | 'waiting' | 'connecting' | 'open' | 'closed' | 'failed';

const PUBLIC_STUN = [{ urls: 'stun:stun.l.google.com:19302' }];

/** Login and expected fingerprint a guest must use to join without a reply. */
export interface QuickJoin {
  ufrag: string;
  pwd: string;
  /** Start of the fingerprint the host expects, so a guest on another device can tell at once. */
  fp: string;
}

export interface Signal {
  desc: RTCSessionDescriptionInit;
  quick?: QuickJoin;
  /** On a reply: the host's ICE ufrag, so a reply only lands on the invite it answers. */
  to?: string;
}

// ---------- Remembered rivals ----------

export interface Rival {
  fp: string;
  name: string;
  seen: number;
}

const RIVALS_KEY = 'frost-chess:rivals';

export function rivals(): Rival[] {
  try { return JSON.parse(localStorage.getItem(RIVALS_KEY) ?? '[]'); } catch { return []; }
}

export function rememberRival(fp: string, name: string) {
  if (!fp || !name) return;
  const list = [{ fp, name, seen: Date.now() }, ...rivals().filter((r) => r.fp !== fp)].slice(0, 8);
  try { localStorage.setItem(RIVALS_KEY, JSON.stringify(list)); } catch { /* storage full or blocked */ }
}

export function forgetRival(fp: string) {
  try { localStorage.setItem(RIVALS_KEY, JSON.stringify(rivals().filter((r) => r.fp !== fp))); } catch { /* ignore */ }
}

// ---------- This device's certificate ----------

const DAY = 864e5;
let certp: Promise<RTCCertificate | null> | null = null;

function keyStore<T>(fn: (s: IDBObjectStore) => IDBRequest<T>, mode: IDBTransactionMode = 'readonly'): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('frost-chess-keys', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const r = fn(db.transaction('kv', mode).objectStore('kv'));
      r.onsuccess = () => { resolve(r.result); db.close(); };
      r.onerror = () => { reject(r.error); db.close(); };
    };
  });
}

/** One long-lived certificate per device, so rivals can recognise it next time. */
function certificate(): Promise<RTCCertificate | null> {
  certp ??= (async () => {
    try {
      const saved = await keyStore<RTCCertificate | undefined>((s) => s.get('cert'));
      if (saved && saved.expires > Date.now() + 7 * DAY) return saved;
    } catch { /* no IndexedDB: make a fresh one */ }
    try {
      const algo = { name: 'ECDSA', namedCurve: 'P-256' };
      const cert = await RTCPeerConnection.generateCertificate({ ...algo, expires: 360 * DAY } as AlgorithmIdentifier)
        .catch(() => RTCPeerConnection.generateCertificate(algo));
      await keyStore((s) => s.put(cert, 'cert'), 'readwrite').catch(() => {});
      return cert;
    } catch {
      return null;
    }
  })();
  return certp;
}

const fingerprint = (sdp?: string) => sdp?.match(/a=fingerprint:(\S+ \S+)/)?.[1] ?? '';
const ufragOf = (sdp?: string) => sdp?.match(/a=ice-ufrag:(\S+)/)?.[1] ?? '';
const fpTag = (fp: string) => fp.replace(/[^0-9A-F]/gi, '').slice(0, 16).toUpperCase();

function randomToken(n: number) {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => abc[b % abc.length]).join('');
}

/** The answer a returning rival's browser will produce, written ahead of time by the host. */
function predictedAnswer(offer: string, q: QuickJoin, fp: string) {
  const mid = offer.match(/a=mid:(\S+)/)?.[1] ?? '0';
  return [
    'v=0', `o=- ${Date.now()} 2 IN IP4 127.0.0.1`, 's=-', 't=0 0', `a=group:BUNDLE ${mid}`, 'a=msid-semantic: WMS',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0',
    `a=ice-ufrag:${q.ufrag}`, `a=ice-pwd:${q.pwd}`, 'a=ice-options:trickle', `a=fingerprint:${fp}`, 'a=setup:active',
    `a=mid:${mid}`, 'a=sctp-port:5000', 'a=max-message-size:262144', '',
  ].join('\r\n');
}

// ---------- Codes ----------

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const out = new Blob([data as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

const b64url = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

export async function encodeSignal(desc: RTCSessionDescriptionInit, extra: { quick?: QuickJoin; to?: string } = {}): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify({ t: desc.type, s: desc.sdp, q: extra.quick, o: extra.to }));
  return b64url(await pipe(json, new CompressionStream('deflate-raw')));
}

export async function decodeSignal(code: string): Promise<Signal> {
  const clean = code.trim().replace(/^.*#(join|reply)=/, '').replace(/\s+/g, '');
  const raw = await pipe(unb64url(clean), new DecompressionStream('deflate-raw'));
  const { t, s, q, o } = JSON.parse(new TextDecoder().decode(raw));
  return { desc: { type: t, sdp: s }, quick: q, to: o };
}

/** True if `text` is a reply code or reply link (not an invite or something unrelated). */
export async function isReply(text: string) {
  try { return (await decodeSignal(text)).desc.type === 'answer'; } catch { return false; }
}

export class LanLink {
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null = null;
  state: LinkState = 'idle';
  /** Set when the host pre-wrote a returning rival's answer: no reply code is expected. */
  quick = false;
  onMessage: (m: LanMessage) => void = () => {};
  onState: (s: LinkState) => void = () => {};

  static async create(useStun: boolean) {
    return new LanLink(useStun, await certificate());
  }

  private constructor(useStun: boolean, cert: RTCCertificate | null) {
    this.pc = new RTCPeerConnection({ iceServers: useStun ? PUBLIC_STUN : [], certificates: cert ? [cert] : undefined });
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

  /** The other side's certificate fingerprint, once known. */
  get remoteFingerprint() {
    return fingerprint(this.pc.remoteDescription?.sdp);
  }

  /** Host: create the invite code. With a remembered rival's fingerprint, they can join without replying. */
  async host(rivalFp?: string): Promise<string> {
    this.set('gathering');
    this.bind(this.pc.createDataChannel('chess', { ordered: true }));
    await this.pc.setLocalDescription(await this.pc.createOffer());
    const offer = await this.gathered();
    let quick: QuickJoin | undefined;
    if (rivalFp) {
      quick = { ufrag: randomToken(8), pwd: randomToken(24), fp: fpTag(rivalFp) };
      await this.pc.setRemoteDescription({ type: 'answer', sdp: predictedAnswer(offer.sdp!, quick, rivalFp) });
      this.quick = true;
    }
    const code = await encodeSignal(offer, { quick });
    this.set('waiting');
    return code;
  }

  /** Host: accept the guest's reply code. */
  async accept(reply: string) {
    const { desc, to } = await decodeSignal(reply);
    if (desc.type !== 'answer') throw new Error("That's an invite, not a reply code.");
    if (to && to !== ufragOf(this.pc.localDescription?.sdp)) throw new Error('That reply answers a different invite.');
    if (this.pc.signalingState !== 'have-local-offer') throw new Error('This invite is already taken. Create a new one.');
    this.set('connecting');
    await this.pc.setRemoteDescription(desc);
  }

  /**
   * Guest: turn an invite into a reply code. Returns null when the invite was made for this
   * device and the host already knows our answer, so nothing has to be sent back.
   */
  async join(invite: string): Promise<string | null> {
    this.set('gathering');
    const { desc, quick } = await decodeSignal(invite);
    if (desc.type !== 'offer') throw new Error("That's a reply code. Open it on the host's device.");
    await this.pc.setRemoteDescription(desc);
    const answer = await this.pc.createAnswer();
    if (quick) {
      if (fpTag(fingerprint(answer.sdp)) !== quick.fp) {
        throw new Error('This invite was made for another device. Ask the host for a regular invite.');
      }
      const sdp = answer.sdp!
        .replace(/a=ice-ufrag:.*/g, `a=ice-ufrag:${quick.ufrag}`)
        .replace(/a=ice-pwd:.*/g, `a=ice-pwd:${quick.pwd}`)
        .replace(/a=setup:\w+/g, 'a=setup:active');
      await this.pc.setLocalDescription({ type: 'answer', sdp });
      if (!this.pc.localDescription?.sdp.includes(`a=ice-ufrag:${quick.ufrag}`)) {
        throw new Error("This browser can't take one-step invites. Ask the host for a regular invite.");
      }
      this.set('connecting');
      return null;
    }
    await this.pc.setLocalDescription(answer);
    const code = await encodeSignal(await this.gathered(), { to: ufragOf(desc.sdp) });
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
