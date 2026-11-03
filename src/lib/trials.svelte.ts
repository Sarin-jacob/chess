// Heart Demon trials (心魔): positions from your own reviewed games where a win was missed or
// a blunder made, kept to be faced again on the board. A demon is slain when you find the move.
// Forced mates are played out to the end, the Elder answering for the other side.
import { Chess, type Move } from 'chess.js';
import { isMateScore, mateIn } from './analysis';
import { judge } from './drill';
import { stopAnalysis } from './engine';
import { game } from './game.svelte';
import { MATE } from './search';

export interface Demon {
  id: string;
  fen: string;
  best: { from: string; to: string; san: string };
  /** The best score, for the side to move. */
  score: number;
  /** A forced mate's line, as UCI moves. */
  line?: string[];
  label: string;
  /** What was played instead. */
  played: string;
  game: { id: string; title: string; date: number; ply: number };
  slain: boolean;
  tries: number;
}

type Status = 'move' | 'checking' | 'right' | 'close' | 'wrong' | 'shown';
export interface Trial {
  demon: Demon;
  fen: string;
  lastMove: { from: string; to: string } | null;
  /** Index into the mate line of the move expected next. */
  step: number;
  /** Off the stored line, but still mating: judged move by move. */
  freeform: boolean;
  status: Status;
  text: string;
  arrows: { from: string; to: string; color: string }[];
}

const KEY = 'nine-peaks-demons';
const MAX = 300;
const uci = (m: Move) => m.from + m.to + (m.promotion ?? '');
const sideOf = (fen: string) => (fen.split(' ')[1] === 'w' ? 'White' : 'Black');

function load(): Demon[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

class Trials {
  demons = $state<Demon[]>(load());
  active = $state<Trial | null>(null);

  get waiting() {
    return this.demons.filter((d) => !d.slain);
  }

  private save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.demons)); } catch { /* storage full or blocked */ }
  }

  /** Keep new demons (one per position); returns how many were new. */
  add(found: Omit<Demon, 'id' | 'slain' | 'tries'>[]) {
    const known = new Set(this.demons.map((d) => d.fen));
    const fresh = found.filter((d) => !known.has(d.fen)).map((d) => ({ ...d, id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2), slain: false, tries: 0 }));
    if (!fresh.length) return 0;
    // When full, the oldest slain demons make room first.
    let all = [...this.demons, ...fresh];
    while (all.length > MAX) {
      const i = all.findIndex((d) => d.slain);
      all.splice(i >= 0 ? i : 0, 1);
    }
    this.demons = all;
    this.save();
    return fresh.length;
  }

  /** Today's demon: the same one all day, until it is slain. */
  today(): Demon | null {
    const w = this.waiting;
    if (!w.length) return null;
    const day = Math.floor(Date.now() / 86_400_000);
    return w[day % w.length];
  }

  /** Another unslain demon, the least tried first. */
  another(): Demon | null {
    const w = this.waiting.filter((d) => d.id !== this.active?.demon.id);
    if (!w.length) return this.today();
    const least = Math.min(...w.map((d) => d.tries));
    const pool = w.filter((d) => d.tries === least);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  face(d: Demon) {
    // You play the side to move, from the bottom of the board.
    game.orientation = d.fen.split(' ')[1] as 'w' | 'b';
    this.active = { demon: d, fen: d.fen, lastMove: null, step: 0, freeform: false, status: 'move', text: `${sideOf(d.fen)} to move. ${d.label}.`, arrows: [] };
  }

  legalFrom(square: string) {
    const t = this.active;
    if (!t || t.status !== 'move') return [];
    return new Chess(t.fen).moves({ square: square as never, verbose: true });
  }

  async attempt(from: string, to: string, promotion?: string) {
    const t = this.active;
    if (!t || t.status !== 'move') return false;
    const c = new Chess(t.fen);
    let m: Move;
    try {
      m = c.move({ from, to, promotion: promotion ?? 'q' });
    } catch {
      return false;
    }
    const d = t.demon;
    if (t.step === 0) this.touch(d);
    const moved = { ...t, fen: c.fen(), lastMove: { from: m.from, to: m.to } };
    this.active = { ...moved, status: 'checking', text: 'The Elder weighs your move…' };

    // On the stored mate line.
    const line = d.line;
    if (line && !t.freeform && line[t.step] === uci(m)) {
      if (c.isCheckmate() || t.step + 1 >= line.length) return this.slay(`${m.san}! Mate.`);
      return this.answer(moved, line[t.step + 1], `${m.san}!`, t.step + 2, false);
    }
    if (c.isCheckmate()) return this.slay(`${m.san}! Mate.`);

    // Anything else is weighed by the Elder: at the start against the stored best, mid-mate
    // only on whether the mate still holds.
    const bestScore = t.step === 0 && !t.freeform ? d.score : MATE - 1;
    const best = t.step === 0 && !t.freeform ? d.best : { from: '', to: '', san: '' };
    const j = await judge(t.fen, m, best, bestScore, 'trial');
    if (this.active?.demon.id !== d.id || this.active.fen !== c.fen()) return true;
    if (j.kind === 'right') {
      const mating = isMateScore(bestScore) && bestScore > 0;
      if (mating && j.reply) {
        const r = j.reply;
        return this.answer(moved, r.from + r.to + (r.promotion ?? ''), `${m.san} keeps the mate.`, t.step + 2, true);
      }
      return this.slay(j.text);
    }
    this.active = { ...moved, status: j.kind, text: j.text };
    return true;
  }

  /** The Elder replies for the demon's side, then it's your move again. */
  private answer(t: Trial, reply: string, said: string, step: number, freeform: boolean) {
    const c = new Chess(t.fen);
    let r: Move;
    try {
      r = c.move({ from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply[4] });
    } catch {
      return this.slay(said);
    }
    this.active = { ...t, status: 'checking', text: `${said} The demon answers…` };
    setTimeout(() => {
      if (this.active?.demon.id !== t.demon.id) return;
      this.active = { ...t, fen: c.fen(), lastMove: { from: r.from, to: r.to }, step, freeform, status: 'move', text: `${said} ${r.san}. Keep going.` };
    }, 600);
    return true;
  }

  private slay(text: string) {
    const t = this.active!;
    this.demons = this.demons.map((d) => (d.id === t.demon.id ? { ...d, slain: true } : d));
    this.save();
    this.active = { ...t, status: 'right', text: `${text} The heart demon is slain.` };
    return true;
  }

  private touch(d: Demon) {
    this.demons = this.demons.map((x) => (x.id === d.id ? { ...x, tries: x.tries + 1 } : x));
    this.save();
  }

  again() {
    const t = this.active;
    if (t) this.face(t.demon);
  }

  /** Show the answer: the best move, and a mate's whole line in words. */
  reveal() {
    const t = this.active;
    if (!t) return;
    const d = t.demon;
    let text = `The answer was ${d.best.san}.`;
    if (d.line) {
      const c = new Chess(d.fen);
      const sans: string[] = [];
      for (const u of d.line) {
        try { sans.push(c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san); } catch { break; }
      }
      text = `Mate in ${mateIn(d.score)}: ${sans.join(' ')}.`;
    }
    this.active = { ...t, fen: d.fen, lastMove: null, status: 'shown', text, arrows: [{ from: d.best.from, to: d.best.to, color: '#3fae55' }] };
  }

  leave() {
    this.active = null;
    stopAnalysis('trial');
  }
}

export const trials = new Trials();
