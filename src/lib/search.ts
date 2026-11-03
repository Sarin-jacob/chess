// A small alpha-beta engine, run off the main thread by engine.worker.ts.
// It drives chess.js through its internal (0x88) move API, which skips the
// SAN/FEN work the public `moves({ verbose })` does for every move.
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
  6: { depth: 4, ms: 2000, noise: 0, quiesce: true },
  7: { depth: 5, ms: 3500, noise: 0, quiesce: true },
  8: { depth: 7, ms: 6000, noise: 0, quiesce: true },
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

function order(moves: Internal[], best?: Internal) {
  const key = (m: Internal) =>
    (best && m.from === best.from && m.to === best.to && m.promotion === best.promotion ? 100000 : 0) +
    (m.captured ? 10 * VALUE[m.captured] - VALUE[m.piece] + 1000 : 0) +
    (m.promotion ? VALUE[m.promotion] : 0);
  return moves.sort((a, b) => key(b) - key(a));
}

function quiesce(c: Engine, alpha: number, beta: number, qdepth: number): number {
  nodes++;
  const stand = evaluate(c);
  if (stand >= beta) return beta;
  if (alpha < stand) alpha = stand;
  if (qdepth <= 0) return alpha;
  const caps = order(c._moves({ legal: true }).filter((m) => m.captured || m.promotion));
  for (const m of caps) {
    c._makeMove(m);
    const s = -quiesce(c, -beta, -alpha, qdepth - 1);
    c._undoMove();
    if (s >= beta) return beta;
    if (s > alpha) alpha = s;
  }
  return alpha;
}

function search(c: Engine, depth: number, alpha: number, beta: number, ply: number, q: boolean): number {
  if ((++nodes & 1023) === 0 && performance.now() > deadline) stopped = true;
  if (stopped) return 0;
  const moves = c._moves({ legal: true });
  if (moves.length === 0) return c.isCheck() ? -MATE + ply : 0;
  if (ply > 0 && (c.isInsufficientMaterial() || c.isThreefoldRepetition())) return 0;
  // Stronger searches look one move further while in check, so mating attacks and escapes
  // aren't cut off halfway.
  if (q && depth <= 0 && ply < 12 && c.isCheck()) depth = 1;
  if (depth <= 0) return q ? quiesce(c, alpha, beta, 6) : evaluate(c);
  for (const m of order(moves)) {
    c._makeMove(m);
    const s = -search(c, depth - 1, -beta, -alpha, ply + 1, q);
    c._undoMove();
    if (stopped) return 0;
    if (s >= beta) return beta;
    if (s > alpha) alpha = s;
  }
  return alpha;
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

  let best = root[0];
  let bestScore = -Infinity;
  let reached = 0;
  let scored: { m: Internal; s: number }[] = [];
  for (let depth = 1; depth <= cfg.depth; depth++) {
    const current: { m: Internal; s: number }[] = [];
    let alpha = -Infinity;
    for (const m of order(root, best)) {
      c._makeMove(m);
      const s = -search(c, depth - 1, -Infinity, -alpha + cfg.noise, 1, cfg.quiesce);
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
