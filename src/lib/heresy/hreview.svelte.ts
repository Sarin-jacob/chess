// The Elder's review for the heterodox paths: the variant's own engine scores every position,
// each move is graded as in orthodox reviews (analysis.ts), and the walk replays the game on
// the board, halting before each turning point with the move played and the better one.
import { grade, isBad, moveAccuracy, type Verdict } from '../analysis';
import { scoreText } from '../engine';
import type { HeresyRequest, HeresyResponse } from './heresy.worker';
import { legalMoves, RULES, san, sqName, type Pos, type VariantId, type VMove } from './rules';

type Color = 'w' | 'b';

export interface HPly {
  ply: number;
  color: Color;
  san: string;
  verdict: Verdict;
  before: number;
  after: number;
  /** The engine's choice, when it differs from the move played. */
  best: { from: string; to: string; san: string } | null;
  accuracy: number;
  comment: string;
}

const same = (a: VMove, b: VMove) => a.from === b.from && a.to === b.to && (a.promotion ?? '') === (b.promotion ?? '') && !!a.vatican === !!b.vatican;

class HeresyReview {
  status = $state<'idle' | 'running' | 'done'>('idle');
  progress = $state(0);
  plies = $state.raw<HPly[]>([]);
  accuracy = $state<Record<Color, number>>({ w: 0, b: 0 });
  /** Every position of the reviewed game (index = moves played) and the moves between them. */
  positions = $state.raw<Pos[]>([]);
  moves = $state.raw<VMove[]>([]);
  you = $state<Color | null>(null);

  walking = $state(false);
  playing = $state(false);
  /** Moves shown on the board. */
  view = $state(0);
  halt = $state<number | null>(null);

  private workers: Worker[] = [];
  private run = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  /** Your own inaccuracies and worse; with nobody to coach, every mistake on either side. */
  stops = $derived.by(() => {
    const bad = (p: HPly) => (this.you ? p.color === this.you && isBad(p.verdict) : ['mistake', 'miss', 'blunder'].includes(p.verdict));
    return new Set(this.plies.filter((p) => p.best && bad(p)).map((p) => p.ply));
  });

  get halted() {
    return this.halt !== null && this.view === this.halt - 1;
  }

  /** Arrows for the halt: the move played, in its grade's colour, and the better one in green. */
  get arrows() {
    if (!this.walking || !this.halted) return [];
    const p = this.plies[this.halt! - 1];
    const m = this.moves[this.halt! - 1];
    const out = [{ from: sqName(m.from), to: sqName(m.to), color: VERDICT_COLOR[p.verdict] }];
    if (p.best) out.push({ from: p.best.from, to: p.best.to, color: '#3fae55' });
    return out;
  }

  async start(entries: { before: Pos; move: VMove; san: string }[], final: Pos, variant: VariantId, you: Color | null) {
    this.cancel();
    const run = ++this.run;
    const rules = RULES[variant];
    this.you = you;
    this.positions = [...entries.map((e) => e.before), final];
    this.moves = entries.map((e) => e.move);
    this.plies = [];
    this.status = 'running';
    this.progress = 0;
    const scores: HeresyResponse[] = [];
    const lanes = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1));
    this.workers = Array.from({ length: lanes }, () => new Worker(new URL('./heresy.worker.ts', import.meta.url), { type: 'module' }));
    let id = 0;
    const ask = (w: Worker, pos: Pos) =>
      new Promise<HeresyResponse>((resolve) => {
        const mine = ++id;
        const on = (e: MessageEvent<HeresyResponse>) => {
          if (e.data.id !== mine) return;
          w.removeEventListener('message', on);
          resolve(e.data);
        };
        w.addEventListener('message', on);
        w.postMessage({ id: mine, pos, variant, level: 4, ms: 500, depth: 6 } satisfies HeresyRequest);
      });
    let next = 0;
    let done = 0;
    await Promise.all(
      this.workers.map(async (w) => {
        while (next < this.positions.length) {
          const i = next++;
          const r = await ask(w, this.positions[i]);
          if (run !== this.run) return;
          scores[i] = r;
          this.progress = ++done / this.positions.length;
          this.gradeReady(entries, scores, rules);
        }
      }),
    );
    if (run !== this.run) return;
    this.stopWorkers();
    this.status = 'done';
  }

  private gradeReady(entries: { move: VMove; san: string }[], scores: HeresyResponse[], rules: (typeof RULES)[VariantId]) {
    const out = [...this.plies];
    for (let i = out.length; i < entries.length && scores[i] && scores[i + 1]; i++) {
      const m = entries[i].move;
      const pos = this.positions[i];
      const best = scores[i];
      const before = best.score;
      const after = -scores[i + 1].score;
      const legal = legalMoves(pos, rules);
      const playedBest = !!best.move && same(best.move, m);
      const g = grade(before, after, playedBest, legal.length === 1);
      const bestSan = !playedBest && best.move ? san(pos, best.move, rules, legal) : null;
      const better = bestSan ? ` Stronger was ${bestSan} (${scoreText(before)}).` : '';
      const label = LABEL[g.verdict];
      const comment =
        g.verdict === 'best' ? 'The Heavenly move: the Elder would play it too.'
          : g.verdict === 'forced' ? 'The only legal path.'
            : g.verdict === 'excellent' || g.verdict === 'good' ? `${label}.${better}`
              : g.verdict === 'miss' ? `A winning chance slipped away: ${scoreText(before)} → ${scoreText(after)}.${better}`
                : `${label}: ${scoreText(before)} → ${scoreText(after)}.${better}`;
      out.push({
        ply: i + 1,
        color: m.color,
        san: entries[i].san,
        verdict: g.verdict,
        before,
        after,
        best: bestSan && best.move ? { from: sqName(best.move.from), to: sqName(best.move.to), san: bestSan } : null,
        accuracy: moveAccuracy(g.loss),
        comment,
      });
    }
    if (out.length === this.plies.length) return;
    const mean = (c: Color) => {
      const a = out.filter((p) => p.color === c).map((p) => p.accuracy);
      return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
    };
    this.plies = out;
    this.accuracy = { w: mean('w'), b: mean('b') };
  }

  private stopWorkers() {
    for (const w of this.workers) w.terminate();
    this.workers = [];
  }

  cancel() {
    this.run++;
    this.stopWorkers();
    this.endWalk();
    this.status = 'idle';
  }

  // ---------- the walk ----------

  private later(ms: number) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.tick(), ms);
  }

  walk() {
    this.walking = true;
    this.halt = null;
    this.view = 0;
    this.playing = true;
    this.later(600);
  }

  private tick() {
    if (!this.walking || !this.playing) return;
    const n = this.moves.length;
    const next = this.view + 1;
    if (next <= n && this.plies.length < next) return this.later(300);
    if (next > n) {
      this.playing = false;
      return;
    }
    if (this.stops.has(next) && this.halt !== next) {
      this.pause();
      this.halt = next;
      return;
    }
    this.halt = null;
    this.view = next;
    this.later(this.stops.has(next) ? 1600 : 850);
  }

  pause() {
    this.playing = false;
    clearTimeout(this.timer);
  }

  toggle() {
    if (this.playing) return this.pause();
    if (this.view >= this.moves.length) {
      this.view = 0;
      this.halt = null;
    }
    this.playing = true;
    this.later(250);
  }

  stepTo(ply: number) {
    this.pause();
    this.view = Math.max(0, Math.min(this.moves.length, ply));
    this.halt = this.stops.has(this.view + 1) ? this.view + 1 : null;
  }

  next() { this.stepTo(this.view + 1); }
  prev() { this.stepTo(this.view - 1); }

  get nextStop(): number | null {
    const from = this.halted ? this.halt! : this.view;
    for (const s of [...this.stops].sort((a, b) => a - b)) if (s > from) return s;
    return null;
  }

  skipToNextStop() {
    const s = this.nextStop;
    if (s === null) return;
    this.pause();
    this.view = s - 1;
    this.halt = s;
  }

  endWalk() {
    this.pause();
    this.walking = false;
    this.halt = null;
  }
}

/** The same grades as orthodox reviews; kept local so the hidden path doesn't pull in the orthodox review store. */
const LABEL: Record<Verdict, string> = {
  brilliant: 'Heaven-Defying', book: 'Ancestral Form', best: 'Heavenly', excellent: 'Masterful', good: 'Sound', forced: 'Only Path',
  inaccuracy: 'Wavering', mistake: 'Misstep', miss: 'Lost Opening', blunder: 'Qi Deviation',
};
export const VERDICT_COLOR: Record<Verdict, string> = {
  brilliant: '#2ec4c9', book: '#b59a6a', best: '#4cc38a', excellent: '#7ec9a4', good: '#a4b8ad', forced: '#94a0b4',
  inaccuracy: '#e6c14f', mistake: '#f08a3c', miss: '#cf6fd8', blunder: '#e5484d',
};
export const VERDICT_SYMBOL: Record<Verdict, string> = {
  brilliant: '!!', book: '卷', best: '★', excellent: '!', good: '✓', forced: '□', inaccuracy: '?!', mistake: '?', miss: '✗', blunder: '??',
};
export { LABEL as VERDICT_LABEL };

export const hreview = new HeresyReview();
