/// <reference lib="webworker" />
// Alpha-beta search for the heterodox variants, with an evaluation that knows each
// variant's goal (lose your pieces, land checks, march the king…).
import { PST } from '../pst';
import { inCheck, kingSq, legalMoves, makeMove, outcome, RULES, type Outcome, type Pos, type Rules, type VariantId, type VMove } from './rules';

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
  { depth: 4, ms: 3500, noise: 4 },
];
/** How many plies of captures to follow past the search's horizon. */
const QUIET_DEPTH = 6;

let deadline = 0;
let stopped = false;
let nodes = 0;

// ---------- memory of positions already searched ----------

const EXACT = 0;
const LOWER = 1;
const UPPER = 2;
const TT_MAX = 200_000;
interface Entry { depth: number; score: number; flag: number; move: number }
const tt = new Map<number, Entry>();
let ttVariant: VariantId | null = null;
/** Two quiet moves per ply that have refuted something, tried early next time. */
let killers: number[][] = [];

const PIECE: Record<string, number> = { p: 0, n: 1, b: 2, r: 3, q: 4, k: 5 };
const CASTLE: Record<string, number> = { K: 1, Q: 2, k: 4, q: 8 };
// Random keys from a fixed seed: 64 squares x 12 pieces, then turn, castling, en passant and checks.
const [ZA, ZB] = (() => {
  let x = 0x9e3779b9;
  const next = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return x >>> 0; };
  const table = () => Uint32Array.from({ length: 64 * 12 + 1 + 16 + 65 + 16 }, next);
  return [table(), table()];
})();
const Z_TURN = 768;
const Z_CASTLE = 769;
const Z_EP = 785;
const Z_CHECKS = 850;

/** A 53-bit key for the position, the most a number holds exactly. */
function hash(p: Pos) {
  let a = 0;
  let b = 0;
  const mix = (i: number) => { a ^= ZA[i]; b ^= ZB[i]; };
  for (let i = 0; i < 64; i++) {
    const x = p.board[i];
    if (x) mix(i * 12 + PIECE[x.k] + (x.c === 'w' ? 0 : 6));
  }
  if (p.turn === 'b') mix(Z_TURN);
  let rights = 0;
  for (const c of p.castle) rights |= CASTLE[c];
  mix(Z_CASTLE + rights);
  mix(Z_EP + p.ep + 1);
  mix(Z_CHECKS + (p.checks.w & 3) * 4 + (p.checks.b & 3));
  return (a >>> 0) * 2097152 + (b >>> 11);
}

const moveId = (m: VMove) => (m.from * 64 + m.to) * 8 + (m.promotion ? PIECE[m.promotion] + 1 : 0);

/** Wins are stored by distance from the position, not from the root of whichever search found them. */
const toStore = (s: number, ply: number) => (s > MATE - 1000 ? s + ply : s < -(MATE - 1000) ? s - ply : s);
const fromStore = (s: number, ply: number) => (s > MATE - 1000 ? s - ply : s < -(MATE - 1000) ? s + ply : s);

/** Below this much material on both sides together, kings come out of hiding. */
const ENDGAME = 2600;

function evaluate(p: Pos, rules: Rules, variant: VariantId): number {
  const anti = variant === 'antichess';
  let s = 0;
  let heavy = 0;
  for (const x of p.board) if (x && x.k !== 'p') heavy += VALUE[x.k];
  p.board.forEach((x, i) => {
    if (!x) return;
    const sq = x.c === 'w' ? i : i ^ 56;
    let v: number;
    // Giving everything away has no good squares, only pieces you still have to lose.
    if (anti) v = -(x.k === 'k' ? 250 : VALUE[x.k]);
    else if (x.k !== 'k') v = VALUE[x.k] + PST[x.k][sq];
    else if (variant === 'bongcloud') v = (7 - (sq >> 3)) * 22; // the king marches, it does not hide
    else v = (heavy < ENDGAME ? PST.ke : PST.k)[sq];
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

/** What a capture is worth to its side. Devouring swaps your piece for what it took, so a queen taking a pawn is a loss. */
function gain(m: VMove, rules: Rules) {
  const taken = VALUE[m.captured!];
  return rules.devour && m.piece !== 'k' ? 2 * taken - VALUE[m.piece] : taken;
}

function order(moves: VMove[], rules: Rules, first = -1, ply = -1) {
  const killer = ply >= 0 ? killers[ply] : undefined;
  const capture = (m: VMove) => {
    if (!m.captured) return 0;
    if (rules.devour) {
      const g = gain(m, rules);
      return g < 0 ? g : g + 1000;
    }
    return 10 * VALUE[m.captured] - VALUE[m.piece] + 1000;
  };
  const key = (m: VMove) => {
    const id = moveId(m);
    if (id === first) return 1e6;
    if (killer && !m.captured && (killer[0] === id || killer[1] === id)) return 500;
    return capture(m) + (m.promotion ? VALUE[m.promotion] : 0) + (m.vatican ? 3000 : 0);
  };
  return moves.sort((a, b) => key(b) - key(a));
}

const ended = (end: Outcome, p: Pos, ply: number) => (end.winner === null ? 0 : end.winner === p.turn ? MATE - ply : -(MATE - ply));

/** Moves that change the position too sharply to stop the search on. */
function loud(m: VMove, p: Pos, rules: Rules, qd: number) {
  if (m.captured) return !rules.devour || gain(m, rules) >= 0;
  if (m.promotion) return m.promotion === 'q';
  if (rules.ascend && m.piece === 'k') return m.to >> 3 === (m.color === 'w' ? 0 : 7);
  if (rules.checksToWin && qd < 2) return inCheck(makeMove(p, m, rules), m.color === 'w' ? 'b' : 'w', rules);
  return false;
}

/** Plays out the captures at the end of a line, so it is never judged halfway through a trade. */
function quiesce(p: Pos, moves: VMove[], alpha: number, beta: number, ply: number, qd: number, rules: Rules, variant: VariantId): number {
  if ((++nodes & 255) === 0 && performance.now() > deadline) stopped = true;
  if (stopped) return 0;
  const stand = evaluate(p, rules, variant);
  if (qd >= QUIET_DEPTH) return stand;
  // Standing still is only an option with a quiet move to play: not in check, and not when a capture is forced.
  const free = !inCheck(p, p.turn, rules) && moves.some((m) => !m.captured);
  if (free) {
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
  }
  for (const m of order(free ? moves.filter((x) => loud(x, p, rules, qd)) : moves, rules)) {
    const next = makeMove(p, m, rules);
    const replies = legalMoves(next, rules);
    const end = outcome(next, rules, replies);
    const s = end ? -ended(end, next, ply + 1) : -quiesce(next, replies, -beta, -alpha, ply + 1, qd + 1, rules, variant);
    if (stopped) return 0;
    if (s >= beta) return beta;
    if (s > alpha) alpha = s;
  }
  return alpha;
}

function search(p: Pos, depth: number, alpha: number, beta: number, ply: number, rules: Rules, variant: VariantId): number {
  if ((++nodes & 255) === 0 && performance.now() > deadline) stopped = true;
  if (stopped) return 0;
  const key = hash(p);
  const seen = tt.get(key);
  if (seen && seen.depth >= depth) {
    const s = fromStore(seen.score, ply);
    if (seen.flag === EXACT) return Math.max(alpha, Math.min(beta, s));
    if (seen.flag === LOWER && s >= beta) return beta;
    if (seen.flag === UPPER && s <= alpha) return alpha;
  }
  const moves = legalMoves(p, rules);
  const end = outcome(p, rules, moves);
  if (end) return ended(end, p, ply);
  if (depth <= 0) return quiesce(p, moves, alpha, beta, ply, 0, rules, variant);
  const opened = alpha;
  let best = seen?.move ?? -1;
  for (const m of order(moves, rules, best, ply)) {
    const s = -search(makeMove(p, m, rules), depth - 1, -beta, -alpha, ply + 1, rules, variant);
    if (stopped) return 0;
    if (s >= beta) {
      const id = moveId(m);
      if (!m.captured) {
        const k = (killers[ply] ??= []);
        if (k[0] !== id) { k[1] = k[0]; k[0] = id; }
      }
      remember(key, depth, beta, LOWER, id, ply);
      return beta;
    }
    if (s > alpha) {
      alpha = s;
      best = moveId(m);
    }
  }
  remember(key, depth, alpha, alpha > opened ? EXACT : UPPER, best, ply);
  return alpha;
}

function remember(key: number, depth: number, score: number, flag: number, move: number, ply: number) {
  if (tt.size >= TT_MAX) tt.clear();
  tt.set(key, { depth, score: toStore(score, ply), flag, move });
}

function think(pos: Pos, variant: VariantId, level: number, ms?: number, depth?: number): { move: VMove | null; score: number } {
  const rules = RULES[variant];
  const base = LEVELS[Math.min(4, Math.max(1, level)) - 1];
  const cfg = ms ? { depth: depth ?? 6, ms, noise: 0 } : base;
  const root = order(legalMoves(pos, rules), rules);
  // A finished game (some variants end with moves still on the board) has nothing to search.
  const end = outcome(pos, rules, root);
  if (end || !root.length) return { move: null, score: !end || end.winner === null ? 0 : end.winner === pos.turn ? MATE : -MATE };
  deadline = performance.now() + cfg.ms;
  stopped = false;
  nodes = 0;
  killers = [];
  if (ttVariant !== variant) {
    tt.clear();
    ttVariant = variant;
  }
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
  // Moves the search proved worse only come back as "no better than the best", so with no
  // margin they tie with it. The sort keeps the real best first; never pick among those ties.
  if (!cfg.noise) return { move: scored[0].m, score: scored[0].s };
  const best = scored[0].s;
  const margin = cfg.noise * Math.random();
  const pool = scored.filter((x) => x.s > best - cfg.noise && x.s >= best - margin);
  const pick = pool[Math.floor(Math.random() * pool.length)];
  return { move: pick.m, score: pick.s };
}

self.onmessage = (e: MessageEvent<HeresyRequest>) => {
  const { id, pos, variant, level, ms, depth } = e.data;
  (self as DedicatedWorkerGlobalScope).postMessage({ id, ...think(pos, variant, level, ms, depth) } satisfies HeresyResponse);
};
