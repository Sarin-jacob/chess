// Synthesised sound effects (no audio files) and haptic patterns.

let ctx: AudioContext | null = null;

function ac() {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function knock(t: number, freq: number, gain: number, decay = 0.08) {
  const a = ac();
  const len = Math.floor(a.sampleRate * decay);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
  const src = a.createBufferSource();
  src.buffer = buf;
  const bp = a.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = 2.5;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(bp).connect(g).connect(a.destination);
  src.start(a.currentTime + t);
}

function bell(t: number, freq: number, gain: number, dur = 1.2) {
  const a = ac();
  const start = a.currentTime + t;
  for (const [mult, amp] of [[1, 1], [2.76, 0.4], [5.4, 0.2]]) {
    const o = a.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq * mult;
    const g = a.createGain();
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(gain * amp, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur / mult);
    o.connect(g).connect(a.destination);
    o.start(start);
    o.stop(start + dur);
  }
}

export type Fx = 'move' | 'capture' | 'castle' | 'check' | 'win' | 'lose' | 'draw' | 'error' | 'start';

const SOUNDS: Record<Fx, () => void> = {
  move: () => knock(0, 900, 0.9),
  capture: () => { knock(0, 700, 1); knock(0.06, 1100, 0.8); },
  castle: () => { knock(0, 850, 0.8); knock(0.11, 950, 0.8); },
  check: () => { knock(0, 800, 0.8); bell(0.02, 880, 0.12, 0.8); },
  win: () => { bell(0, 523, 0.15); bell(0.18, 659, 0.13); bell(0.36, 784, 0.13, 2); },
  lose: () => { bell(0, 392, 0.15); bell(0.25, 311, 0.15, 2.2); },
  draw: () => { bell(0, 440, 0.13); bell(0.25, 440, 0.1, 1.6); },
  error: () => knock(0, 220, 0.6, 0.12),
  start: () => bell(0, 196, 0.16, 2.5),
};

const HAPTICS: Partial<Record<Fx, number[]>> = {
  move: [15],
  capture: [25, 40, 25],
  castle: [15, 30, 15],
  check: [50, 30, 50],
  win: [100, 50, 100, 50, 150],
  lose: [200],
  error: [10, 20, 10],
};

export function play(fx: Fx, opts: { sound: boolean; haptics: boolean }) {
  if (opts.sound) {
    try { SOUNDS[fx](); } catch { /* audio blocked until first gesture */ }
  }
  if (opts.haptics && HAPTICS[fx] && 'vibrate' in navigator) {
    try { navigator.vibrate(HAPTICS[fx]!); } catch { /* unsupported */ }
  }
}
