// A small alpha-beta engine, run off the main thread by engine.worker.ts.
// It drives chess.js through its internal (0x88) move API, which skips the
// SAN/FEN work the public `moves({ verbose })` does for every move.
// Principal variation search with a transposition table (on chess.js's own Zobrist hash),
// null-move pruning, killer and history move ordering, and a check extension.
import { Chess } from 'chess.js';

type Internal = { color: 'w' | 'b'; from: number; to: number; piece: string; captured?: string; promotion?: string; flags: number };
interface Engine {
  isCheck(): boolean;
  isInsufficientMaterial(): boolean;
  isThreefoldRepetition(): boolean;
  _moves(o?: { legal?: boolean }): Internal[];
  _makeMove(m: Internal): void;
  _undoMove(): void;
  _board: ({ type: string; color: 'w' | 'b' } | undefined)[];
  _turn: 'w' | 'b';
  _hash: bigint;
  _isKingAttacked(color: 'w' | 'b'): boolean;
  _getPositionCount(hash: bigint): number;
}

/**
 * `depth` and `ms` override the level's search, for full-strength analysis. `mate` also hunts
 * for a forced mate by checks of up to that many moves, beyond what the search can see.
 */
export interface EngineRequest { id: number; fen: string; level: number; depth?: number; ms?: number; mate?: number }
/**
 * `score` is in centipawns for the side to move; `from` is empty when there is no legal move.
 * `line` is the forced mate found by the mate hunt, as UCI moves.
 */
export interface EngineResponse { id: number; from: string; to: string; promotion?: string; score: number; depth: number; nodes: number; line?: string[] }

const VALUE: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

// Piece-square tables, white's view, rank 8 first (matches 0x88 row order).
const PST: Record<string, number[]> = {
  p: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  n: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  b: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  r: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  k: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
  ke: [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50],
};

/** Search settings per difficulty level (1..8). */
const LEVELS: Record<number, { depth: number; ms: number; noise: number; quiesce: boolean }> = {
  1: { depth: 1, ms: 200, noise: 400, quiesce: false },
  2: { depth: 1, ms: 300, noise: 150, quiesce: false },
  3: { depth: 2, ms: 500, noise: 60, quiesce: false },
  4: { depth: 2, ms: 700, noise: 20, quiesce: true },
  5: { depth: 3, ms: 1200, noise: 8, quiesce: true },
  6: { depth: 5, ms: 2000, noise: 0, quiesce: true },
  7: { depth: 6, ms: 3500, noise: 0, quiesce: true },
  8: { depth: 9, ms: 6000, noise: 0, quiesce: true },
};

export const MATE = 100000;
const algebraic = (i: number) => 'abcdefgh'[i & 7] + (8 - (i >> 4));
const uci = (m: Internal) => algebraic(m.from) + algebraic(m.to) + (m.promotion ?? '');

let nodes = 0;
let deadline = 0;
let stopped = false;

function evaluate(c: Engine): number {
  const board = c._board;
  let score = 0;
  let nonPawn = 0;
  for (let i = 0; i < 128; i++) {
    if (i & 0x88) { i += 7; continue; }
    const p = board[i];
    if (p && p.type !== 'p' && p.type !== 'k') nonPawn += VALUE[p.type];
  }
  const endgame = nonPawn <= 1300;
  for (let i = 0; i < 128; i++) {
    if (i & 0x88) { i += 7; continue; }
    const p = board[i];
    if (!p) continue;
    const sq = ((i >> 4) << 3) | (i & 7);
    const idx = p.color === 'w' ? sq : ((7 - (i >> 4)) << 3) | (i & 7);
    const table = p.type === 'k' && endgame ? PST.ke : PST[p.type];
    const v = VALUE[p.type] + table[idx];
    score += p.color === 'w' ? v : -v;
  }
  return c._turn === 'w' ? score : -score;
}

// ---------- memory between positions ----------

const EXACT = 0;
const LOWER = 1;
const UPPER = 2;
interface TTEntry { depth: number; score: number; flag: number; move: number }
/** Positions already searched, keyed by hash; kept across searches until it grows too big. */
const tt = new Map<bigint, TTEntry>();
const TT_MAX = 150_000;
/** Quiet moves that refuted a line, two per ply, tried early in sibling lines. */
let killers: number[][] = [];
/** How often each quiet from→to move caused a cutoff. */
const history = new Int32Array(128 * 128);
/** Hashes along the line being searched, to spot repetitions. */
const path: bigint[] = [];
/** Stands in for the side-to-move key while a null move is on the board. */
const NULL_KEY = 0x9e3779b97f4a7c15n;
const NULL_FLAG = 128;

const PROMO = 'nbrq';
const mkey = (m: Internal) => (m.from << 10) | (m.to << 3) | (m.promotion ? PROMO.indexOf(m.promotion) + 1 : 0);
// Mate scores are stored relative to the position, not the root.
const toTT = (s: number, ply: number) => (s > MATE - 1000 ? s + ply : s < -MATE + 1000 ? s - ply : s);
const fromTT = (s: number, ply: number) => (s > MATE - 1000 ? s - ply : s < -MATE + 1000 ? s + ply : s);

function order(moves: Internal[], ttMove: number, ply: number) {
  const k = killers[ply] ?? [];
  const score = (m: Internal) => {
    const key = mkey(m);
    if (key === ttMove) return 1e9;
    if (m.captured) return 1e8 + 10 * VALUE[m.captured] - VALUE[m.piece];
    if (m.promotion) return 9e7 + VALUE[m.promotion];
    if (key === k[0]) return 8e7;
    if (key === k[1]) return 7.9e7;
    return history[m.from * 128 + m.to];
  };
  return moves.map((m) => ({ m, s: score(m) })).sort((a, b) => b.s - a.s).map((x) => x.m);
}

/** Any piece besides pawns: without one, passing a move (null move) can be the only good move. */
function hasPieces(c: Engine, color: 'w' | 'b') {
  for (let i = 0; i < 128; i++) {
    if (i & 0x88) { i += 7; continue; }
    const p = c._board[i];
    if (p && p.color === color && p.type !== 'p' && p.type !== 'k') return true;
  }
  return false;
}

function quiesce(c: Engine, alpha: number, beta: number, qdepth: number): number {
  nodes++;
  const stand = evaluate(c);
  if (stand >= beta) return stand;
  if (alpha < stand) alpha = stand;
  if (qdepth <= 0) return alpha;
  const us = c._turn;
  for (const m of order(c._moves({ legal: false }).filter((m) => m.captured || m.promotion), -1, 0)) {
    c._makeMove(m);
    if (c._isKingAttacked(us)) {
      c._undoMove();
      continue;
    }
    const s = -quiesce(c, -beta, -alpha, qdepth - 1);
    c._undoMove();
    if (s >= beta) return s;
    if (s > alpha) alpha = s;
  }
  return alpha;
}

function search(c: Engine, depth: number, alpha: number, beta: number, ply: number, q: boolean, nullOk = true): number {
  if ((++nodes & 1023) === 0 && performance.now() > deadline) stopped = true;
  if (stopped) return 0;
  const h = c._hash;
  if (ply > 0) {
    // A position seen before, in this line or earlier in the game, is a draw.
    for (let i = ply - 2; i >= 0; i -= 2) if (path[i] === h) return 0;
    if (c._getPositionCount(h) > 0 || c.isInsufficientMaterial()) return 0;
  }
  path[ply] = h;
  const us = c._turn;
  const inCheck = c._isKingAttacked(us);
  // Stronger searches look one move further while in check, so mating attacks and escapes
  // aren't cut off halfway.
  if (q && inCheck && ply < 16) depth++;
  if (depth <= 0) return q ? quiesce(c, alpha, beta, 6) : evaluate(c);

  const e = tt.get(h);
  let ttMove = -1;
  if (e) {
    ttMove = e.move;
    if (ply > 0 && e.depth >= depth) {
      const s = fromTT(e.score, ply);
      if (e.flag === EXACT || (e.flag === LOWER && s >= beta) || (e.flag === UPPER && s <= alpha)) return s;
    }
  }

  // Null move: if even passing keeps us at or above beta, a real move will too.
  if (q && nullOk && !inCheck && depth >= 3 && ply > 0 && Math.abs(beta) < MATE - 1000 && hasPieces(c, us) && evaluate(c) >= beta) {
    c._makeMove({ color: us, from: 0, to: 0, piece: 'k', flags: NULL_FLAG });
    c._hash = h ^ NULL_KEY; // chess.js leaves the hash alone for a null move
    const s = -search(c, depth - 3, -beta, -beta + 1, ply + 1, q, false);
    c._undoMove();
    c._hash = h;
    if (stopped) return 0;
    if (s >= beta) return s >= MATE - 1000 ? beta : s;
  }

  const a0 = alpha;
  let legal = 0;
  let best = -Infinity;
  let bestKey = -1;
  for (const m of order(c._moves({ legal: false }), ttMove, ply)) {
    c._makeMove(m);
    if (c._isKingAttacked(us)) {
      c._undoMove();
      continue;
    }
    legal++;
    let s: number;
    if (legal === 1) s = -search(c, depth - 1, -beta, -alpha, ply + 1, q);
    else {
      // Every other move only has to prove it's no better; search properly if it is.
      s = -search(c, depth - 1, -alpha - 1, -alpha, ply + 1, q);
      if (s > alpha && s < beta && !stopped) s = -search(c, depth - 1, -beta, -alpha, ply + 1, q);
    }
    c._undoMove();
    if (stopped) return 0;
    if (s > best) {
      best = s;
      bestKey = mkey(m);
    }
    if (s > alpha) alpha = s;
    if (alpha >= beta) {
      if (!m.captured && !m.promotion) {
        const k = (killers[ply] ??= [-1, -1]);
        if (k[0] !== bestKey) [k[1], k[0]] = [k[0], bestKey];
        history[m.from * 128 + m.to] += depth * depth;
      }
      break;
    }
  }
  if (!legal) return inCheck ? -MATE + ply : 0;
  if (tt.size > TT_MAX) tt.clear();
  tt.set(h, { depth, score: toTT(best, ply), flag: best <= a0 ? UPPER : best >= beta ? LOWER : EXACT, move: bestKey });
  return best;
}

/**
 * A forced mate in at most `n` moves where every move of the attacker gives check, or null.
 * Returns the line, defended by the reply that holds out longest.
 */
function mateLine(c: Engine, n: number): Internal[] | null {
  for (const m of c._moves({ legal: true })) {
    if ((++nodes & 255) === 0 && performance.now() > deadline) stopped = true;
    if (stopped) return null;
    c._makeMove(m);
    if (c.isCheck()) {
      const replies = c._moves({ legal: true });
      if (!replies.length) {
        c._undoMove();
        return [m];
      }
      let longest: Internal[] | null = null;
      if (n > 1) {
        for (const r of replies) {
          c._makeMove(r);
          const sub = mateLine(c, n - 1);
          c._undoMove();
          if (!sub) { longest = null; break; }
          if (!longest || sub.length + 1 > longest.length) longest = [r, ...sub];
        }
      }
      if (longest) {
        c._undoMove();
        return [m, ...longest];
      }
    }
    c._undoMove();
  }
  return null;
}

export function think(fen: string, level: number, depth?: number, ms?: number, mate = 0): Omit<EngineResponse, 'id'> {
  const base = LEVELS[Math.min(8, Math.max(1, level))];
  const cfg = depth ? { depth, ms: ms ?? base.ms, noise: 0, quiesce: true } : base;
  const c = new Chess(fen) as unknown as Engine;
  const root = c._moves({ legal: true });
  if (!root.length) return { from: '', to: '', score: c.isCheck() ? -MATE : 0, depth: 0, nodes: 0 };
  nodes = 0;
  stopped = false;
  deadline = performance.now() + cfg.ms;
  killers = [];
  history.fill(0);
  path[0] = c._hash;

  let best = root[0];
  let bestScore = -Infinity;
  let reached = 0;
  let scored: { m: Internal; s: number }[] = [];
  for (let depth = 1; depth <= cfg.depth; depth++) {
    const current: { m: Internal; s: number }[] = [];
    let alpha = -Infinity;
    // Last iteration's best first, then the rest as they scored.
    const ordered = depth === 1 ? order(root, tt.get(c._hash)?.move ?? -1, 0) : [best, ...scored.map((x) => x.m).filter((m) => m !== best)];
    for (const m of ordered) {
      c._makeMove(m);
      let s: number;
      // Weaker levels need honest scores for every move, to pick among near-equals.
      if (cfg.noise > 0 || !current.length) s = -search(c, depth - 1, -Infinity, -alpha + cfg.noise, 1, cfg.quiesce);
      else {
        s = -search(c, depth - 1, -alpha - 1, -alpha, 1, cfg.quiesce);
        if (s > alpha && !stopped) s = -search(c, depth - 1, -Infinity, -alpha, 1, cfg.quiesce);
      }
      c._undoMove();
      if (stopped) break;
      current.push({ m, s });
      if (s > alpha) alpha = s;
    }
    if (stopped && current.length === 0) break;
    current.sort((a, b) => b.s - a.s);
    scored = current;
    best = current[0].m;
    bestScore = current[0].s;
    reached = depth;
    if (stopped || Math.abs(bestScore) > MATE - 100) break;
  }

  // Weaker levels pick randomly among moves within `noise` of the best.
  if (cfg.noise > 0 && scored.length) {
    const pool = scored.filter((x) => x.s >= bestScore - cfg.noise * Math.random());
    const pick = pool[Math.floor(Math.random() * pool.length)];
    best = pick.m;
    bestScore = pick.s;
  }

  // The mate hunt: forcing lines of checks run deeper than the full search can afford.
  let line: string[] | undefined;
  if (mate > 0) {
    stopped = false;
    deadline = performance.now() + 250;
    const found = bestScore > MATE - 1000 ? MATE - bestScore : Infinity;
    for (let n = 1; n <= mate && 2 * n - 1 <= found; n++) {
      const c2 = new Chess(fen) as unknown as Engine;
      const l = mateLine(c2, n);
      if (stopped) break;
      if (l) {
        best = l[0];
        bestScore = MATE - (2 * n - 1);
        line = l.map(uci);
        break;
      }
    }
  }

  return { from: algebraic(best.from), to: algebraic(best.to), promotion: best.promotion, score: bestScore, depth: reached, nodes, line };
}
