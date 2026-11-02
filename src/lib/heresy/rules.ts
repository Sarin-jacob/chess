// Rules for the heterodox variants. chess.js only knows orthodox chess, so these paths run on
// a small engine of their own: 64 squares, a8 = 0 … h1 = 63, positions copied on every move.
// Each variant is the orthodox rules plus a few switches (see RULES).

export type Color = 'w' | 'b';
export type Kind = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export interface Piece { c: Color; k: Kind }

export interface Pos {
  board: (Piece | null)[];
  turn: Color;
  /** Castling rights, a subset of 'KQkq'. */
  castle: string;
  /** En passant target square, or -1. */
  ep: number;
  half: number;
  full: number;
  /** Checks delivered by each side (Three Palms). */
  checks: Record<Color, number>;
}

export interface VMove {
  from: number;
  to: number;
  piece: Kind;
  color: Color;
  captured?: Kind;
  promotion?: Kind;
  ep?: boolean;
  castle?: 'k' | 'q';
  /** Il Vaticano: the partner bishop's square and the two pawns taken. */
  vatican?: { partner: number; victims: number[] };
}

export type VariantId = 'holyhell' | 'vatican' | 'bongcloud' | 'threecheck' | 'atomic' | 'antichess' | 'shuffle' | 'devour';

export interface Rules {
  /** The king is royal: it can be checked and mated. */
  royal: boolean;
  castling: boolean;
  /** How far a king may stride in a straight line. */
  kingReach: 1 | 2;
  forcedEp: boolean;
  vatican: boolean;
  atomic: boolean;
  mustCapture: boolean;
  promoteToKing: boolean;
  checksToWin: number;
  /** A king reaching the enemy back rank wins. */
  ascend: boolean;
  /** The back rank starts in a random order, mirrored for black. */
  shuffle: boolean;
  /** A capturing piece (not a king) turns into what it captured. */
  devour: boolean;
}

const ORTHODOX: Rules = {
  royal: true, castling: true, kingReach: 1, forcedEp: false, vatican: false, atomic: false,
  mustCapture: false, promoteToKing: false, checksToWin: 0, ascend: false, shuffle: false, devour: false,
};

export const RULES: Record<VariantId, Rules> = {
  holyhell: { ...ORTHODOX, forcedEp: true },
  vatican: { ...ORTHODOX, vatican: true },
  bongcloud: { ...ORTHODOX, castling: false, kingReach: 2, ascend: true },
  threecheck: { ...ORTHODOX, checksToWin: 3 },
  atomic: { ...ORTHODOX, atomic: true },
  antichess: { ...ORTHODOX, royal: false, castling: false, mustCapture: true, promoteToKing: true },
  shuffle: { ...ORTHODOX, castling: false, shuffle: true },
  devour: { ...ORTHODOX, devour: true },
};

export const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');
export const sqName = (i: number) => 'abcdefgh'[i & 7] + (8 - (i >> 3));
export const sqIndex = (s: string) => (8 - +s[1]) * 8 + 'abcdefgh'.indexOf(s[0]);
const row = (i: number) => i >> 3;
const col = (i: number) => i & 7;
const on = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;

const KNIGHT: [number, number][] = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const DIAG: [number, number][] = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ORTHO: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const ALL = [...DIAG, ...ORTHO];

export const ORTHODOX_BACK: Kind[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];

/** Any order at all: bishops may share a colour and the king may stand anywhere. */
export function shuffledBack(): Kind[] {
  const a = ORTHODOX_BACK.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function startPos(rules: Rules, back: Kind[] = ORTHODOX_BACK): Pos {
  const board: (Piece | null)[] = Array(64).fill(null);
  for (let f = 0; f < 8; f++) {
    board[f] = { c: 'b', k: back[f] };
    board[8 + f] = { c: 'b', k: 'p' };
    board[48 + f] = { c: 'w', k: 'p' };
    board[56 + f] = { c: 'w', k: back[f] };
  }
  return { board, turn: 'w', castle: rules.castling ? 'KQkq' : '', ep: -1, half: 0, full: 1, checks: { w: 0, b: 0 } };
}

/** Piece placement plus the usual FEN fields, enough for the board component. */
export function toFen(p: Pos) {
  const rows: string[] = [];
  for (let r = 0; r < 8; r++) {
    let s = '';
    let gap = 0;
    for (let c = 0; c < 8; c++) {
      const x = p.board[r * 8 + c];
      if (!x) { gap++; continue; }
      if (gap) { s += gap; gap = 0; }
      s += x.c === 'w' ? x.k.toUpperCase() : x.k;
    }
    rows.push(s + (gap || ''));
  }
  return `${rows.join('/')} ${p.turn} ${p.castle || '-'} ${p.ep >= 0 ? sqName(p.ep) : '-'} ${p.half} ${p.full}`;
}

export function kingSq(p: Pos, c: Color) {
  return p.board.findIndex((x) => x?.c === c && x.k === 'k');
}

/** Is square `sq` attacked by side `by`? */
export function attacked(p: Pos, sq: number, by: Color, rules: Rules): boolean {
  const r = row(sq);
  const c = col(sq);
  const b = p.board;
  const at = (rr: number, cc: number) => (on(rr, cc) ? b[rr * 8 + cc] : null);
  // Pawns attack toward the enemy: a white pawn on the row below.
  const pr = by === 'w' ? r + 1 : r - 1;
  for (const dc of [-1, 1]) {
    const x = at(pr, c + dc);
    if (x?.c === by && x.k === 'p') return true;
  }
  for (const [dr, dc] of KNIGHT) {
    const x = at(r + dr, c + dc);
    if (x?.c === by && x.k === 'n') return true;
  }
  // In the Blood Furnace a king can't capture, so it attacks nothing.
  if (!rules.atomic)
    for (const [dr, dc] of ALL) {
      const x = at(r + dr, c + dc);
      if (x?.c === by && x.k === 'k') return true;
    }
  for (const [dirs, kinds] of [[DIAG, 'bq'], [ORTHO, 'rq']] as const)
    for (const [dr, dc] of dirs) {
      for (let k = 1; ; k++) {
        const rr = r + dr * k;
        const cc = c + dc * k;
        if (!on(rr, cc)) break;
        const x = b[rr * 8 + cc];
        if (!x) continue;
        if (x.c === by && kinds.includes(x.k)) return true;
        break;
      }
    }
  return false;
}

export function inCheck(p: Pos, c: Color, rules: Rules): boolean {
  if (!rules.royal) return false;
  const k = kingSq(p, c);
  if (k < 0) return false;
  if (rules.atomic) {
    // Touching kings: taking one would blow up the other, so neither is in check.
    const e = kingSq(p, other(c));
    if (e >= 0 && Math.abs(row(e) - row(k)) <= 1 && Math.abs(col(e) - col(k)) <= 1) return false;
  }
  return attacked(p, k, other(c), rules);
}

function pseudo(p: Pos, rules: Rules): VMove[] {
  const out: VMove[] = [];
  const us = p.turn;
  const them = other(us);
  const b = p.board;
  const promos: Kind[] = rules.promoteToKing ? ['q', 'r', 'b', 'n', 'k'] : ['q', 'r', 'b', 'n'];

  const add = (from: number, to: number, extra: Partial<VMove> = {}) => {
    const x = b[from]!;
    const target = b[to];
    out.push({ from, to, piece: x.k, color: us, ...(target ? { captured: target.k } : {}), ...extra });
  };

  for (let i = 0; i < 64; i++) {
    const x = b[i];
    if (!x || x.c !== us) continue;
    const r = row(i);
    const c = col(i);

    if (x.k === 'p') {
      const dir = us === 'w' ? -1 : 1;
      const last = us === 'w' ? 0 : 7;
      const home = us === 'w' ? 6 : 1;
      const push = (to: number, extra: Partial<VMove> = {}) => {
        if (row(to) === last) for (const k of promos) add(i, to, { ...extra, promotion: k });
        else add(i, to, extra);
      };
      const one = (r + dir) * 8 + c;
      if (on(r + dir, c) && !b[one]) {
        push(one);
        const two = (r + 2 * dir) * 8 + c;
        if (r === home && !b[two]) add(i, two);
      }
      for (const dc of [-1, 1]) {
        if (!on(r + dir, c + dc)) continue;
        const to = (r + dir) * 8 + c + dc;
        // Devouring a piece on the far rank turns the pawn into that piece, so no promotion choice.
        if (b[to]?.c === them) (rules.devour && row(to) === last ? add(i, to) : push(to));
        else if (to === p.ep) add(i, to, { ep: true, captured: 'p' });
      }
      continue;
    }

    if (x.k === 'n')
      for (const [dr, dc] of KNIGHT) {
        if (!on(r + dr, c + dc)) continue;
        const to = (r + dr) * 8 + c + dc;
        if (b[to]?.c !== us) add(i, to);
      }

    if (x.k === 'b' || x.k === 'r' || x.k === 'q') {
      const dirs = x.k === 'b' ? DIAG : x.k === 'r' ? ORTHO : ALL;
      for (const [dr, dc] of dirs)
        for (let k = 1; on(r + dr * k, c + dc * k); k++) {
          const to = (r + dr * k) * 8 + c + dc * k;
          if (b[to]?.c === us) break;
          add(i, to);
          if (b[to]) break;
        }
    }

    if (x.k === 'b' && rules.vatican)
      // Il Vaticano: bishop, two enemy pawns, bishop, all on one rank or file.
      for (const [dr, dc] of ORTHO) {
        if (!on(r + 3 * dr, c + 3 * dc)) continue;
        const sq = (k: number) => (r + k * dr) * 8 + c + k * dc;
        const [p1, p2, partner] = [b[sq(1)], b[sq(2)], b[sq(3)]];
        if (p1?.c === them && p1.k === 'p' && p2?.c === them && p2.k === 'p' && partner?.c === us && partner.k === 'b')
          out.push({ from: i, to: sq(3), piece: 'b', color: us, captured: 'p', vatican: { partner: sq(3), victims: [sq(1), sq(2)] } });
      }

    if (x.k === 'k') {
      for (const [dr, dc] of ALL)
        for (let k = 1; k <= rules.kingReach && on(r + dr * k, c + dc * k); k++) {
          const to = (r + dr * k) * 8 + c + dc * k;
          if (b[to]?.c === us) break;
          if (rules.atomic && b[to]) break; // kings never capture in the Furnace
          // The Bongcloud stride may not pass through an attacked square.
          if (k === 2 && attacked(p, (r + dr) * 8 + c + dc, them, rules)) break;
          add(i, to);
          if (b[to]) break;
        }
      if (rules.castling && !inCheck(p, us, rules)) {
        const base = us === 'w' ? 56 : 0;
        const [K, Q] = us === 'w' ? ['K', 'Q'] : ['k', 'q'];
        const clear = (...sqs: number[]) => sqs.every((s) => !b[base + s]);
        const safe = (...sqs: number[]) => sqs.every((s) => !attacked(p, base + s, them, rules));
        if (i === base + 4 && p.castle.includes(K) && clear(5, 6) && safe(5, 6)) add(i, base + 6, { castle: 'k' });
        if (i === base + 4 && p.castle.includes(Q) && clear(1, 2, 3) && safe(2, 3)) add(i, base + 2, { castle: 'q' });
      }
    }
  }
  return out;
}

export function makeMove(p: Pos, m: VMove, rules: Rules): Pos {
  const b = p.board.slice();
  const us = p.turn;
  const mover = b[m.from]!;
  b[m.from] = null;

  if (m.vatican) {
    b[m.to] = mover;
    b[m.from] = { c: us, k: 'b' }; // the partner takes the first bishop's square
    for (const v of m.vatican.victims) b[v] = null;
  } else {
    b[m.to] = m.promotion ? { c: us, k: m.promotion } : mover;
    if (m.ep) b[m.to + (us === 'w' ? 8 : -8)] = null;
    if (m.castle) {
      const base = us === 'w' ? 56 : 0;
      const [rf, rt] = m.castle === 'k' ? [7, 5] : [0, 3];
      b[base + rt] = b[base + rf];
      b[base + rf] = null;
    }
    if (rules.devour && m.captured && mover.k !== 'k') {
      // You become what you devour; a pawn made on the far rank is crowned.
      const far = row(m.to) === (us === 'w' ? 0 : 7);
      b[m.to] = { c: us, k: m.captured === 'p' && far ? 'q' : m.captured };
    }
    if (rules.atomic && m.captured) {
      // The blast takes the capturer, the captured piece and every non-pawn around.
      b[m.to] = null;
      const r = row(m.to);
      const c = col(m.to);
      for (const [dr, dc] of ALL) {
        if (!on(r + dr, c + dc)) continue;
        const s = (r + dr) * 8 + c + dc;
        if (b[s] && b[s]!.k !== 'p') b[s] = null;
      }
    }
  }

  // Rights survive only while king and rook still stand at home.
  const has = (s: number, c: Color, k: Kind) => b[s]?.c === c && b[s]!.k === k;
  let castle = '';
  if (has(60, 'w', 'k') && has(63, 'w', 'r') && p.castle.includes('K')) castle += 'K';
  if (has(60, 'w', 'k') && has(56, 'w', 'r') && p.castle.includes('Q')) castle += 'Q';
  if (has(4, 'b', 'k') && has(7, 'b', 'r') && p.castle.includes('k')) castle += 'k';
  if (has(4, 'b', 'k') && has(0, 'b', 'r') && p.castle.includes('q')) castle += 'q';

  const next: Pos = {
    board: b,
    turn: other(us),
    castle,
    ep: m.piece === 'p' && Math.abs(m.to - m.from) === 16 ? (m.from + m.to) / 2 : -1,
    half: m.piece === 'p' || m.captured ? 0 : p.half + 1,
    full: p.full + (us === 'b' ? 1 : 0),
    checks: { ...p.checks },
  };
  if (rules.checksToWin && inCheck(next, next.turn, rules)) next.checks[us]++;
  return next;
}

export function legalMoves(p: Pos, rules: Rules): VMove[] {
  let moves = pseudo(p, rules);
  const us = p.turn;
  if (rules.royal)
    moves = moves.filter((m) => {
      const after = makeMove(p, m, rules);
      if (rules.atomic) {
        if (kingSq(after, us) < 0) return false;
        if (kingSq(after, other(us)) < 0) return true;
      }
      return !inCheck(after, us, rules);
    });
  if (rules.mustCapture && moves.some((m) => m.captured)) moves = moves.filter((m) => m.captured);
  if (rules.forcedEp && moves.some((m) => m.ep)) moves = moves.filter((m) => m.ep);
  return moves;
}

export interface Outcome { winner: Color | null; reason: string }

/** Is the game over in this position (with `p.turn` to move)? */
export function outcome(p: Pos, rules: Rules, moves = legalMoves(p, rules)): Outcome | null {
  const them = other(p.turn);
  if (rules.atomic && kingSq(p, p.turn) < 0) return { winner: them, reason: 'king destroyed' };
  if (rules.checksToWin && p.checks[them] >= rules.checksToWin) return { winner: them, reason: 'third palm strike' };
  if (rules.ascend) {
    const k = kingSq(p, them);
    if (k >= 0 && row(k) === (them === 'w' ? 0 : 7)) return { winner: them, reason: 'the king ascended' };
  }
  if (!rules.royal) {
    if (!p.board.some((x) => x?.c === p.turn)) return { winner: p.turn, reason: 'every piece given away' };
    if (!moves.length) return { winner: p.turn, reason: 'no moves left' };
  } else if (!moves.length) {
    return inCheck(p, p.turn, rules) ? { winner: them, reason: 'checkmate' } : { winner: null, reason: 'stalemate' };
  }
  if (p.half >= 100) return { winner: null, reason: 'fifty-move rule' };
  if (rules.royal && p.board.every((x) => !x || x.k === 'k')) return { winner: null, reason: 'only kings remain' };
  return null;
}

const LETTER: Record<Kind, string> = { p: '', n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' };

/** Short algebraic notation for `m`, played from `p`. */
export function san(p: Pos, m: VMove, rules: Rules, moves = legalMoves(p, rules)): string {
  if (m.castle) return m.castle === 'k' ? 'O-O' : 'O-O-O';
  let s: string;
  if (m.vatican) s = `B${sqName(m.from)}⇄${sqName(m.to)}`;
  else if (m.piece === 'p') s = (m.captured ? sqName(m.from)[0] + 'x' : '') + sqName(m.to) + (m.promotion ? '=' + m.promotion.toUpperCase() : '');
  else {
    const rivals = moves.filter((o) => o !== m && !o.vatican && o.piece === m.piece && o.to === m.to && o.from !== m.from);
    let dis = '';
    if (rivals.length) {
      const f = sqName(m.from);
      dis = !rivals.some((o) => col(o.from) === col(m.from)) ? f[0] : !rivals.some((o) => row(o.from) === row(m.from)) ? f[1] : f;
    }
    s = LETTER[m.piece] + dis + (m.captured ? 'x' : '') + sqName(m.to);
  }
  const after = makeMove(p, m, rules);
  const end = outcome(after, rules);
  if (end?.winner === p.turn) return s + '#'; // mate, a destroyed king, an ascension…
  if (inCheck(after, after.turn, rules)) s += '+';
  return s;
}
