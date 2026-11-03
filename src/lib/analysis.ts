// The review's judgement, kept free of UI state so it can be tested on its own: how a move is
// graded from the engine's scores, and the names of what it did (forks, pins, mate patterns).
// Text may hold glossary tokens, [[term]] or [[term|shown words]], see glossary.ts.
import { Chess, type Move, type Square } from 'chess.js';
import { MATE } from './search';

export type Verdict = 'brilliant' | 'book' | 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'miss' | 'forced';
type Color = 'w' | 'b';

const SEVERITY: Record<Verdict, number> = { brilliant: 0, book: 0, best: 0, forced: 0, excellent: 1, good: 2, inaccuracy: 3, mistake: 4, miss: 4, blunder: 5 };
export const isBad = (v: Verdict) => SEVERITY[v] >= 3;

export const isMateScore = (s: number) => Math.abs(s) > MATE - 1000;
/** Moves to mate for a mate score. */
export const mateIn = (s: number) => Math.ceil((MATE - Math.abs(s)) / 2);

/** Winning chance (0–100) for a score, the curve lichess uses. */
export function winChance(cp: number) {
  if (isMateScore(cp)) return cp > 0 ? 100 : 0;
  const c = Math.max(-2000, Math.min(2000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
}

/** One scale for every score: any mate outweighs material, and a quicker mate counts more. */
function flat(s: number) {
  if (isMateScore(s)) return Math.sign(s) * (5000 - (MATE - Math.abs(s)) * 50);
  return Math.max(-3000, Math.min(3000, s));
}

export const moveAccuracy = (loss: number) => Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669 + 1));

export interface Grading {
  verdict: Verdict;
  /** Winning chance given away, 0–100. */
  loss: number;
  /** A forced mate was on the board and the move let it go. */
  missedMate: boolean;
  /** The move lets the opponent force mate. */
  allowedMate: boolean;
}

/**
 * Grade a move from the best score before it and the score after it, both from the mover's side.
 * Winning chance does the main work, as on lichess, but it barely moves once a game is decided,
 * so centipawns and mates keep a lost or won position from making every move look perfect.
 */
export function grade(before: number, after: number, playedBest: boolean, only: boolean): Grading {
  const loss = Math.max(0, winChance(before) - winChance(after));
  const cpLoss = Math.max(0, flat(before) - flat(after));
  const hadMate = isMateScore(before) && before > 0;
  const keptMate = isMateScore(after) && after > 0;
  const missedMate = hadMate && !keptMate && !playedBest;
  const allowedMate = isMateScore(after) && after < 0 && !(isMateScore(before) && before < 0);

  let v: Verdict;
  if (only) v = 'forced';
  else if (playedBest || cpLoss <= 10) v = 'best';
  else if (hadMate && keptMate) v = cpLoss <= 100 ? 'excellent' : 'good'; // a slower mate is still a mate
  else if (loss < 2 && cpLoss <= 40) v = 'excellent';
  else if (loss < 5 && cpLoss <= 100) v = 'good';
  else if (loss < 10) v = 'inaccuracy';
  else if (loss < 20) v = 'mistake';
  else v = 'blunder';

  if (allowedMate && v !== 'forced' && SEVERITY[v] < SEVERITY.mistake) v = 'mistake';
  // Throwing away a win, or a mate, without actually losing is a miss rather than a blunder.
  if (v !== 'forced' && after > -150 && (missedMate || ((v === 'mistake' || v === 'blunder') && before >= 250))) v = 'miss';
  return { verdict: v, loss, missedMate, allowedMate };
}

// ---------- what a move did ----------

const VAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
export const PIECE_NAME: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const FILES = 'abcdefgh';
const xy = (sq: string): [number, number] => [FILES.indexOf(sq[0]), +sq[1] - 1];
const at = (x: number, y: number) => (x >= 0 && x < 8 && y >= 0 && y < 8 ? ((FILES[x] + (y + 1)) as Square) : null);
const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');

function kingOf(c: Chess, color: Color): Square {
  for (const row of c.board()) for (const p of row) if (p && p.type === 'k' && p.color === color) return p.square;
  throw new Error('no king');
}

function around(sq: string): Square[] {
  const [x, y] = xy(sq);
  const out: Square[] = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (dx || dy) { const s = at(x + dx, y + dy); if (s) out.push(s); }
  return out;
}

export interface MateName { term: string; label: string }

/** Name the checkmate on the board, made by move `m` (the `ply`th of the game), if it has one. */
export function matePattern(c: Chess, m: { from: string; to: string; color: string }, ply: number): MateName | null {
  const us = m.color as Color;
  const them = other(us);
  const K = kingOf(c, them);
  const [kx, ky] = xy(K);
  const mover = c.get(m.to as Square);
  if (!mover) return null;
  const [mx, my] = xy(m.to);
  const near = around(K);
  const own = (sq: Square) => c.get(sq)?.color === them;
  const knights = c.board().flat().filter((p) => p && p.color === us && p.type === 'n').map((p) => p!.square);
  const heavy = (t: string) => t === 'r' || t === 'q';

  if (mover.type === 'q' && us === 'b' && ply === 4 && m.to === 'h4') return { term: 'foolsMate', label: 'Fool’s Mate' };
  if (mover.type === 'q' && ply <= 8 && m.to === (us === 'w' ? 'f7' : 'f2')) return { term: 'scholarsMate', label: 'Scholar’s Mate' };
  if (mover.type === 'n' && near.every(own)) return { term: 'smotheredMate', label: 'smothered mate' };

  const home = them === 'w' ? 0 : 7;
  const inward = them === 'w' ? 1 : -1;
  if (heavy(mover.type) && ky === home && my === home) {
    const front = [at(kx - 1, ky + inward), at(kx, ky + inward), at(kx + 1, ky + inward)].filter(Boolean) as Square[];
    if (front.every(own)) return { term: 'backRankMate', label: 'back-rank mate' };
  }
  const corner = (kx === 0 || kx === 7) && (ky === 0 || ky === 7);
  if (mover.type === 'r' && corner && Math.abs(mx - kx) + Math.abs(my - ky) === 1 && knights.some((n) => c.attackers(m.to as Square, us).includes(n)))
    return { term: 'arabianMate', label: 'Arabian mate' };
  if (heavy(mover.type) && (kx === 0 || kx === 7) && mx === kx && knights.some((n) => near.some((s) => c.attackers(s, us).includes(n))) && near.some(own))
    return { term: 'anastasiasMate', label: 'Anastasia’s mate' };
  if (mover.type === 'b') {
    const bishops = c.board().flat().filter((p) => p && p.color === us && p.type === 'b' && p.square !== m.to).map((p) => p!.square);
    if (bishops.some((b) => near.some((s) => c.attackers(s, us).includes(b))) && near.some(own)) return { term: 'bodensMate', label: 'Boden’s mate' };
  }
  if (mover.type === 'q' && mx === kx && Math.abs(my - ky) === 2) {
    const l = at(kx - 1, ky);
    const r = at(kx + 1, ky);
    if (l && r && own(l) && own(r)) return { term: 'epauletteMate', label: 'epaulette mate' };
  }
  // Two heavy pieces climbing the board side by side.
  const edgeRank = ky === 0 || ky === 7;
  const edgeFile = kx === 0 || kx === 7;
  if (heavy(mover.type) && ((edgeRank && my === ky) || (edgeFile && mx === kx))) {
    const step = edgeRank ? (ky === 0 ? 1 : -1) : kx === 0 ? 1 : -1;
    const helper = c.board().flat().some((p) => p && p.color === us && heavy(p.type) && p.square !== m.to && (edgeRank ? xy(p.square)[1] === ky + step : xy(p.square)[0] === kx + step));
    if (helper) return { term: 'ladderMate', label: 'ladder mate' };
  }
  if (mover.type === 'q' && Math.max(Math.abs(mx - kx), Math.abs(my - ky)) === 1) return { term: 'kissOfDeath', label: 'queen’s kiss' };
  return null;
}

export interface Motif { id: string; text: string }

/** What a move does, in words: a mate's name, checks, forks, pins, skewers, sacrifices. */
export function motifs(m: Move, ply: number): Motif[] {
  const c = new Chess(m.after);
  const us = m.color as Color;
  const them = other(us);
  const out: Motif[] = [];
  const mover = c.get(m.to as Square);
  if (!mover) return out;
  const name = PIECE_NAME[mover.type];

  if (c.isCheckmate()) {
    const p = matePattern(c, m, ply);
    out.push({ id: 'mate', text: p ? `[[checkmate|Checkmate]]: a [[${p.term}|${p.label}]].` : '[[checkmate|Checkmate]].' });
    return out;
  }
  if (m.flags.includes('e')) out.push({ id: 'enPassant', text: 'Taken [[enPassant|en passant]].' });
  if (m.promotion && m.promotion !== 'q') out.push({ id: 'underpromotion', text: `An [[underpromotion]] to a ${PIECE_NAME[m.promotion]}.` });

  if (c.isCheck()) {
    const checkers = c.attackers(kingOf(c, them), us);
    if (checkers.length >= 2) out.push({ id: 'doubleCheck', text: 'A [[doubleCheck|double check]]: only the king can answer it.' });
    else if (!checkers.includes(m.to as Square)) out.push({ id: 'discovered', text: `A [[discoveredCheck|discovered check]]: the ${PIECE_NAME[m.piece]} stepped aside and unveiled an attack on the king.` });
  }

  // Fork: one piece now hits two targets worth more than itself, or left undefended.
  const targets = c.board().flat().filter((p): p is NonNullable<typeof p> => {
    if (!p || p.color !== them || !c.attackers(p.square, us).includes(m.to as Square)) return false;
    return p.type === 'k' || VAL[p.type] > VAL[mover.type] || (VAL[p.type] >= 3 && c.attackers(p.square, them).length === 0);
  });
  if (targets.length >= 2 && mover.type !== 'k')
    out.push({ id: 'fork', text: `A [[fork]]: the ${name} attacks ${targets.map((t) => (t.type === 'k' ? 'the king' : `the ${PIECE_NAME[t.type]}`)).join(' and ')}.` });

  // Pins and skewers along the lines of a bishop, rook or queen.
  if ('brq'.includes(mover.type)) {
    const dirs = [...(mover.type !== 'b' ? [[1, 0], [-1, 0], [0, 1], [0, -1]] : []), ...(mover.type !== 'r' ? [[1, 1], [1, -1], [-1, 1], [-1, -1]] : [])];
    const [x0, y0] = xy(m.to);
    for (const [dx, dy] of dirs) {
      const hit: { type: string; color: string; square: Square }[] = [];
      for (let i = 1; i < 8 && hit.length < 2; i++) {
        const s = at(x0 + dx * i, y0 + dy * i);
        if (!s) break;
        const p = c.get(s);
        if (p) hit.push({ ...p, square: s });
      }
      if (hit.length < 2 || hit[0].color !== them || hit[1].color !== them) continue;
      const [a, b] = hit;
      // Only pins worth naming: a minor piece or better, held to the king or to a heavy piece worth winning.
      const worth = (t: { type: string; square: Square }) => VAL[t.type] > VAL[mover.type] || c.attackers(t.square, them).length === 0;
      if (b.type === 'k' && VAL[a.type] >= 3 && a.type !== 'k') out.push({ id: 'pin', text: `A [[pin]]: the ${PIECE_NAME[a.type]} cannot move without exposing the king.` });
      else if (a.type !== 'k' && VAL[a.type] >= 3 && VAL[b.type] >= 5 && VAL[b.type] > VAL[a.type] && worth(b)) out.push({ id: 'pin', text: `A [[pin]]: the ${PIECE_NAME[a.type]} shields the ${PIECE_NAME[b.type]} behind it.` });
      else if (VAL[a.type] > VAL[b.type] && VAL[b.type] >= 3 && worth(b)) out.push({ id: 'skewer', text: `A [[skewer]]: ${a.type === 'k' ? 'the king' : `the ${PIECE_NAME[a.type]}`} must step aside and the ${PIECE_NAME[b.type]} behind falls.` });
    }
  }

  // Sacrifice: material offered that the opponent can take at a profit.
  if (mover.type !== 'k') {
    const defended = c.attackers(m.to as Square, us).length > 0;
    const takers = c.attackers(m.to as Square, them).map((s) => c.get(s)!.type).filter((t) => t !== 'k' || !defended);
    if (takers.length) {
      const cheapest = Math.min(...takers.map((t) => VAL[t]));
      const risk = defended ? Math.max(0, VAL[mover.type] - cheapest) : VAL[mover.type];
      const net = risk - (m.captured ? VAL[m.captured] : 0);
      if (net >= 2) out.push({ id: 'sacrifice', text: `A [[sacrifice]]: the ${name} is offered up.` });
    }
  }
  return out;
}

/** A line of UCI moves from a position, in SAN with move numbers, and the mate it ends in. */
export function lineText(fen: string, uci: string[], firstPly: number): { text: string; mate: MateName | null } {
  const c = new Chess(fen);
  const parts: string[] = [];
  let last: Move | null = null;
  uci.forEach((u, i) => {
    const ply = firstPly + i;
    try {
      last = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    } catch {
      return;
    }
    const n = Math.ceil(ply / 2);
    parts.push(ply % 2 ? `${n}. ${last!.san}` : i === 0 ? `${n}… ${last!.san}` : last!.san);
  });
  const mate = last && c.isCheckmate() ? matePattern(c, last, firstPly + uci.length - 1) : null;
  return { text: parts.join(' '), mate };
}
