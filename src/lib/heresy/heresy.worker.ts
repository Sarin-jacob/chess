/// <reference lib="webworker" />
// Alpha-beta search for the heterodox variants, with an evaluation that knows each
// variant's goal (lose your pieces, land checks, march the king…).
import { inCheck, kingSq, legalMoves, makeMove, outcome, RULES, type Pos, type Rules, type VariantId, type VMove } from './rules';

/** `ms` and `depth` override the level for full-strength analysis (the review). */
export interface HeresyRequest { id: number; pos: Pos; variant: VariantId; level: number; ms?: number; depth?: number }
/** `score` is for the side to move, ±MATE - plies for a forced win. */
export interface HeresyResponse { id: number; move: VMove | null; score: number }

const VALUE: Record<string, number> = { p: 100, n: 310, b: 330, r: 500, q: 900, k: 0 };
const MATE = 100000;
// Level 1..4: depth, think time, and how much worse than best a pick may be.
const LEVELS = [
  { depth: 1, ms: 300, noise: 180 },
  { depth: 2, ms: 800, noise: 50 },
  { depth: 3, ms: 1800, noise: 10 },
  { depth: 4, ms: 3500, noise: 0 },
];

let deadline = 0;
let stopped = false;
let nodes = 0;

/** Bonus for standing near the centre, 0..30. */
const centre = (i: number) => 30 - 5 * (Math.abs(3.5 - (i >> 3)) + Math.abs(3.5 - (i & 7)));

function evaluate(p: Pos, rules: Rules, variant: VariantId): number {
  let s = 0;
  p.board.forEach((x, i) => {
    if (!x) return;
    let v = variant === 'antichess' ? -(x.k === 'k' ? 250 : VALUE[x.k]) : VALUE[x.k];
    if (x.k !== 'k') v += centre(i) / (x.k === 'p' ? 3 : 2);
    if (x.k === 'p' && variant !== 'antichess') v += (x.c === 'w' ? 6 - (i >> 3) : (i >> 3) - 1) * 6;
    if (x.k === 'k' && variant === 'bongcloud') v += (x.c === 'w' ? 7 - (i >> 3) : i >> 3) * 22;
    s += x.c === p.turn ? v : -v;
  });
  if (variant === 'threecheck') s += 260 * (p.checks[p.turn] - p.checks[p.turn === 'w' ? 'b' : 'w']);
  if (variant === 'atomic') {
    // Pieces touching the enemy king are a bomb waiting to go off.
    const ek = kingSq(p, p.turn === 'w' ? 'b' : 'w');
    if (ek >= 0) for (const i of [-9, -8, -7, -1, 1, 7, 8, 9]) if (p.board[ek + i]?.c === p.turn) s += 25;
  }
  if (inCheck(p, p.turn, rules)) s -= 30;
  return s;
}

function order(moves: VMove[]) {
  const key = (m: VMove) => (m.captured ? 10 * VALUE[m.captured] - VALUE[m.piece] + 1000 : 0) + (m.promotion ? VALUE[m.promotion] : 0) + (m.vatican ? 3000 : 0);
  return moves.sort((a, b) => key(b) - key(a));
}

function search(p: Pos, depth: number, alpha: number, beta: number, ply: number, rules: Rules, variant: VariantId): number {
  if ((++nodes & 255) === 0 && performance.now() > deadline) stopped = true;
  if (stopped) return 0;
  const moves = legalMoves(p, rules);
  const end = outcome(p, rules, moves);
  if (end) return end.winner === null ? 0 : end.winner === p.turn ? MATE - ply : -(MATE - ply);
  if (depth <= 0) return evaluate(p, rules, variant);
  for (const m of order(moves)) {
    const s = -search(makeMove(p, m, rules), depth - 1, -beta, -alpha, ply + 1, rules, variant);
    if (stopped) return 0;
    if (s >= beta) return beta;
    if (s > alpha) alpha = s;
  }
  return alpha;
}

function think(pos: Pos, variant: VariantId, level: number, ms?: number, depth?: number): { move: VMove | null; score: number } {
  const rules = RULES[variant];
  const base = LEVELS[Math.min(4, Math.max(1, level)) - 1];
  const cfg = ms ? { depth: depth ?? 6, ms, noise: 0 } : base;
  const root = order(legalMoves(pos, rules));
  // A finished game (some variants end with moves still on the board) has nothing to search.
  const end = outcome(pos, rules, root);
  if (end || !root.length) return { move: null, score: !end || end.winner === null ? 0 : end.winner === pos.turn ? MATE : -MATE };
  deadline = performance.now() + cfg.ms;
  stopped = false;
  nodes = 0;
  let scored = root.map((m) => ({ m, s: 0 }));
  for (let depth = 1; depth <= cfg.depth; depth++) {
    const current: { m: VMove; s: number }[] = [];
    let alpha = -Infinity;
    for (const { m } of scored) {
      const s = -search(makeMove(pos, m, rules), depth - 1, -Infinity, -alpha + cfg.noise, 1, rules, variant);
      if (stopped) break;
      current.push({ m, s });
      if (s > alpha) alpha = s;
    }
    // A round cut short by the clock is thrown away; the last full one stands.
    if (stopped) break;
    scored = current.sort((a, b) => b.s - a.s);
    if (Math.abs(scored[0].s) > MATE - 100) break;
  }
  const best = scored[0].s;
  const pool = scored.filter((x) => x.s >= best - cfg.noise * Math.random());
  const pick = pool[Math.floor(Math.random() * pool.length)];
  return { move: pick.m, score: pick.s };
}

self.onmessage = (e: MessageEvent<HeresyRequest>) => {
  const { id, pos, variant, level, ms, depth } = e.data;
  (self as DedicatedWorkerGlobalScope).postMessage({ id, ...think(pos, variant, level, ms, depth) } satisfies HeresyResponse);
};
