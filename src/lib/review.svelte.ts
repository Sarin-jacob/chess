// Game review: the engine scores every position of a finished game, each move is graded
// (analysis.ts) and named (forks, pins, mate patterns, the opening), and the Elder turns the
// patterns into advice. Text may hold glossary tokens, [[term]] or [[term|shown words]].
// The walk replays the game on the board and halts before each turning point, with the
// move played and the Elder's choice drawn as arrows.
import { Chess, type Move } from 'chess.js';
import { grade, isBad, lineText, mateIn, moveAccuracy, motifs, type Motif, type Verdict } from './analysis';
import { judge } from './drill';
import { TERMS } from './glossary';
import { analyse, isMate, lanes, scoreText, stopAnalysis } from './engine';
import { game } from './game.svelte';
import { openingOf } from './openings';
import { trials } from './trials.svelte';
import type { EngineResponse } from './search';

export type { Verdict };

type Color = 'w' | 'b';

/** Each grade has a sect name and its everyday chess name. */
export const VERDICTS: Record<Verdict, { label: string; plain: string; symbol: string; color: string }> = {
  brilliant: { label: 'Heaven-Defying', plain: 'brilliant', symbol: '!!', color: '#2ec4c9' },
  book: { label: 'Ancestral Form', plain: 'book move', symbol: '卷', color: '#b59a6a' },
  best: { label: 'Heavenly', plain: 'best move', symbol: '★', color: '#4cc38a' },
  excellent: { label: 'Masterful', plain: 'excellent', symbol: '!', color: '#7ec9a4' },
  good: { label: 'Sound', plain: 'good', symbol: '✓', color: '#a4b8ad' },
  forced: { label: 'Only Path', plain: 'only move', symbol: '□', color: '#94a0b4' },
  inaccuracy: { label: 'Wavering', plain: 'inaccuracy', symbol: '?!', color: '#e6c14f' },
  mistake: { label: 'Misstep', plain: 'mistake', symbol: '?', color: '#f08a3c' },
  miss: { label: 'Lost Opening', plain: 'missed win', symbol: '✗', color: '#cf6fd8' },
  blunder: { label: 'Qi Deviation', plain: 'blunder', symbol: '??', color: '#e5484d' },
};

export interface PlyReview {
  ply: number;
  color: Color;
  san: string;
  verdict: Verdict;
  /** Score with best play before the move, and after the move played, both from the mover's side. */
  before: number;
  after: number;
  /** The engine's choice, when it differs from the move played. */
  best: { san: string; from: string; to: string } | null;
  accuracy: number;
  comment: string;
  /** What the move did: fork, pin, mate pattern… (ids from analysis.ts). */
  motifs: string[];
  /** The forced mate that was missed, as moves, and as UCI. */
  missLine?: string;
  lineUci?: string[];
}

export interface Tip { color: Color; tone: 'warn' | 'good' | 'info'; title: string; text: string }

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const NAME: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

function sanOf(fen: string, from: string, to: string, promotion?: string) {
  try { return new Chess(fen).move({ from, to, promotion }).san; } catch { return null; }
}

/** Non-pawn material on the board (both sides), to tell the endgame apart. */
function heavyMaterial(fen: string) {
  let n = 0;
  for (const ch of fen.split(' ')[0]) n += VALUE[ch.toLowerCase()] && ch.toLowerCase() !== 'p' ? VALUE[ch.toLowerCase()] : 0;
  return n;
}

const moveNo = (ply: number) => `${Math.ceil(ply / 2)}${ply % 2 ? '.' : '…'}`;

class Review {
  /** Which game (id + length) the results belong to. */
  key = $state('');
  status = $state<'idle' | 'running' | 'done'>('idle');
  progress = $state(0);
  /** Shown in the Moves panel instead of the plain move list. */
  open = $state(false);
  plies = $state.raw<PlyReview[]>([]);
  /** Score of every position (index = plies played), from white's side. */
  evals = $state.raw<number[]>([]);
  accuracy = $state<Record<Color, number>>({ w: 0, b: 0 });
  tips = $state.raw<Tip[]>([]);
  /** Heart demons this review added to the trials. */
  newDemons = $state(0);
  /** The named opening and how many moves of it came straight from the book. */
  opening = $state<{ name: string | null; plies: number }>({ name: null, plies: 0 });
  /** The side reviewed for, or null when both sides are (pass-and-play, imports). */
  you = $state<Color | null>(null);
  private run = 0;

  /** The walk: the board replays the game by itself. */
  walking = $state(false);
  playing = $state(false);
  /** Halted on the position before this ply, to show what should have been played. */
  halt = $state<number | null>(null);
  /**
   * Finding the better move yourself at a turning point: the position, then the move tried
   * (`after` is the position it leads to) and the Elder's judgement of it.
   */
  retry = $state<{ ply: number; fen: string; after: string | null; move: { from: string; to: string } | null; result: null | { kind: 'checking' | 'right' | 'close' | 'wrong'; text: string } } | null>(null);
  private timer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Plies the walk halts before. Your own inaccuracies and worse; with nobody to coach,
   * every mistake on either side.
   */
  stops = $derived.by(() => {
    const bad = (p: PlyReview) =>
      this.you ? p.color === this.you && ['inaccuracy', 'mistake', 'miss', 'blunder'].includes(p.verdict) : ['mistake', 'miss', 'blunder'].includes(p.verdict);
    return new Set(this.plies.filter((p) => p.best && bad(p)).map((p) => p.ply));
  });

  async start(key: string, history: Move[], you: Color | null, result: string) {
    this.open = true;
    if (this.key === key && this.status !== 'idle') return;
    const run = ++this.run;
    stopAnalysis('review');
    this.key = key;
    this.you = you;
    this.plies = [];
    this.status = 'running';
    this.progress = 0;
    this.evals = [];
    this.newDemons = 0;
    const header = (k: string) => game.pgn().match(new RegExp(`\\[${k} "([^"]*)"\\]`))?.[1];
    const meta = { id: key.split(':')[0], title: `${header('White') ?? 'White'} vs ${header('Black') ?? 'Black'}`, date: game.startedAt };
    this.opening = openingOf(history);
    const fens = [history[0].before, ...history.map((m) => m.after)];
    const scores: EngineResponse[] = [];
    // Positions are shared out to several workers; each move is graded as soon as the
    // positions on both sides of it are in, so the walk can start before the end.
    let next = 0;
    let done = 0;
    const lane = async (n: number) => {
      while (next < fens.length) {
        const i = next++;
        // The mate hunt finds forced mates by checks a few moves past the search's horizon.
        const r = await analyse(fens[i], { depth: 12, ms: 500, mate: 4 }, `review:${n}`);
        if (run !== this.run) return;
        scores[i] = r;
        this.progress = ++done / fens.length;
        this.gradeReady(history, fens, scores);
      }
    };
    await Promise.all(Array.from({ length: lanes() }, (_, n) => lane(n)));
    if (run !== this.run) return;
    stopAnalysis('review');
    this.newDemons = this.summonDemons(fens, meta);
    this.counsel(history, fens, you, result);
    this.status = 'done';
  }

  close() {
    this.open = false;
  }

  cancel() {
    this.run++;
    stopAnalysis('review');
    this.status = 'idle';
    this.key = '';
    this.open = false;
    this.endWalk();
  }

  // ---------- the walk ----------

  private get cur() {
    return game.viewPly ?? game.history.length;
  }

  private later(ms: number) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.tick(), ms);
  }

  /** Replay the game from the first move; it starts once the analysis is done. */
  walk() {
    this.walking = true;
    this.halt = null;
    game.hint = null;
    game.viewPly = 0;
    this.playing = true;
    this.later(600);
  }

  private tick() {
    if (!this.walking || !this.playing) return;
    const n = game.history.length;
    const next = this.cur + 1;
    // Still being analysed: wait for the Elder to catch up.
    if (next <= n && this.plies.length < next) return this.later(300);
    if (next > n) {
      this.playing = false;
      return;
    }
    if (this.stops.has(next) && this.halt !== next) {
      this.haltAt(next);
      return;
    }
    this.halt = null;
    game.hint = null;
    game.viewPly = next;
    // Linger on a turning point once it has been played, and on anything with a name, so it sinks in.
    const p = this.plies[next - 1];
    const named = p && (p.verdict === 'brilliant' || p.motifs.length > 0 || (p.verdict === 'book' && next === this.opening.plies));
    this.later(this.stops.has(next) || named ? 1700 : 850);
  }

  pause() {
    this.playing = false;
    clearTimeout(this.timer);
  }

  // ---------- finding the better move yourself ----------

  /** At a turning point, hide the answer and let the board be played from the position before it. */
  startRetry() {
    if (!this.halted) return;
    const p = this.plies[this.halt! - 1];
    if (!p?.best) return;
    this.pause();
    this.retry = { ply: p.ply, fen: game.history[p.ply - 1].before, after: null, move: null, result: null };
  }

  retryLegal(square: string) {
    const r = this.retry;
    if (!r || r.after) return [];
    return new Chess(r.fen).moves({ square: square as never, verbose: true });
  }

  /** Judge a move tried at a turning point: the Elder's own, or one about as good, or not. */
  async attempt(from: string, to: string, promotion?: string) {
    const r = this.retry;
    if (!r || r.after) return false;
    const c = new Chess(r.fen);
    let m: Move;
    try {
      m = c.move({ from, to, promotion: promotion ?? 'q' });
    } catch {
      return false;
    }
    const p = this.plies[r.ply - 1];
    this.retry = { ...r, after: c.fen(), move: { from: m.from, to: m.to }, result: { kind: 'checking', text: 'The Elder weighs your move…' } };
    const j = await judge(r.fen, m, p.best!, p.before, 'retry');
    if (this.retry?.ply !== r.ply || this.retry.after !== c.fen()) return true;
    this.retry = { ...this.retry, result: { kind: j.kind, text: j.kind === 'wrong' ? j.text + ' Look again.' : j.text } };
    return true;
  }

  /** Put the position back for another try. */
  retryAgain() {
    if (this.retry) this.retry = { ...this.retry, after: null, move: null, result: null };
  }

  endRetry() {
    this.retry = null;
    stopAnalysis('retry');
  }

  /** Play on from here; from the end it starts over. */
  toggle() {
    this.endRetry();
    if (this.playing) return this.pause();
    if (this.cur >= game.history.length) {
      game.viewPly = 0;
      this.halt = null;
    }
    this.playing = true;
    this.later(250);
  }

  /** Stop on the position before `ply`, showing what was played and what was better. */
  haltAt(ply: number) {
    this.pause();
    this.endRetry();
    this.walking = true;
    game.hint = null;
    game.viewPly = ply - 1;
    this.halt = ply;
  }

  /** Go to a position by hand; it halts if the next move is a turning point. */
  stepTo(ply: number) {
    this.pause();
    this.endRetry();
    const n = game.history.length;
    const to = Math.max(0, Math.min(n, ply));
    game.hint = null;
    game.viewPly = to;
    this.halt = this.stops.has(to + 1) ? to + 1 : null;
  }

  next() { this.stepTo(this.cur + 1); }
  prev() { this.stepTo(this.cur - 1); }

  /** True while the board shows the position before the halted move. */
  get halted() {
    return this.halt !== null && game.viewPly === this.halt - 1;
  }

  /** The turning point after the one on screen, if any. */
  get nextStop(): number | null {
    const from = this.halted ? this.halt! : this.cur;
    for (const s of [...this.stops].sort((a, b) => a - b)) if (s > from) return s;
    return null;
  }

  skipToNextStop() {
    const s = this.nextStop;
    if (s !== null) this.haltAt(s);
  }

  endWalk() {
    this.pause();
    this.endRetry();
    if (!this.walking) return;
    this.walking = false;
    this.halt = null;
    game.hint = null;
    game.viewPly = null;
  }

  /** Grade every move whose positions are both analysed, in order, from where it left off. */
  private gradeReady(history: Move[], fens: string[], scores: EngineResponse[]) {
    const out = [...this.plies];
    const evals = [...this.evals];
    for (let i = evals.length; i < fens.length && scores[i]; i++) evals.push(fens[i].split(' ')[1] === 'w' ? scores[i].score : -scores[i].score);
    for (let i = out.length; i < history.length && scores[i] && scores[i + 1]; i++) {
      const m = history[i];
      const best = scores[i];
      const reply = scores[i + 1];
      const before = best.score;
      const after = -reply.score;
      const playedBest = best.from === m.from && best.to === m.to && (best.promotion ?? '') === (m.promotion ?? '');
      const only = new Chess(fens[i]).moves().length === 1;
      const g = grade(before, after, playedBest, only);
      const found = motifs(m, i + 1);

      let verdict = g.verdict;
      // A sacrifice the engine stands behind, when the game was still in the balance, is brilliant.
      if ((verdict === 'best' || verdict === 'excellent') && found.some((f) => f.id === 'sacrifice') && after > -50 && before < 600) verdict = 'brilliant';
      if (i < this.opening.plies) verdict = 'book';

      const bestSan = playedBest || !best.from ? null : sanOf(fens[i], best.from, best.to, best.promotion);
      const replySan = reply.from ? sanOf(fens[i + 1], reply.from, reply.to, reply.promotion) : null;
      const replyTakes = reply.from ? new Chess(fens[i + 1]).get(reply.to as never) : null;
      const missLine = g.missedMate && best.line ? lineText(fens[i], best.line, i + 1) : null;
      const threat = g.allowedMate && reply.line ? lineText(fens[i + 1], reply.line, i + 2) : null;

      out.push({
        ply: i + 1,
        color: m.color,
        san: m.san,
        verdict,
        before,
        after,
        best: bestSan && verdict !== 'book' ? { san: bestSan, from: best.from, to: best.to } : null,
        accuracy: moveAccuracy(g.loss),
        motifs: found.map((f) => f.id),
        lineUci: missLine ? best.line : undefined,
        missLine: missLine ? missLine.text + (missLine.mate ? `, a [[${missLine.mate.term}|${missLine.mate.label}]]` : '') : undefined,
        comment: this.comment(verdict, m, {
          before, after, bestSan, replySan, replyTakes, motifs: found, missLine, threat,
          opening: i < this.opening.plies ? openingOf(history.slice(0, i + 1)).name : null,
        }),
      });
    }
    const mean = (c: Color) => {
      const a = out.filter((p) => p.color === c).map((p) => p.accuracy);
      return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
    };
    this.evals = evals;
    if (out.length === this.plies.length) return;
    this.plies = out;
    this.accuracy = { w: mean('w'), b: mean('b') };
  }

  private comment(
    v: Verdict,
    m: Move,
    c: {
      before: number; after: number; bestSan: string | null; replySan: string | null;
      replyTakes: { type: string; color: Color } | null | undefined; motifs: Motif[];
      missLine: ReturnType<typeof lineText> | null; threat: ReturnType<typeof lineText> | null; opening: string | null;
    },
  ) {
    const better = c.bestSan ? ` Stronger was ${c.bestSan} (${scoreText(c.before)}).` : '';
    const did = c.motifs.map((x) => ' ' + x.text).join('');
    const named = (l: ReturnType<typeof lineText>) => (l.mate ? `, a [[${l.mate.term}|${l.mate.label}]]` : '');
    switch (v) {
      case 'book': return `An [[book|ancestral form]], straight from opening theory${c.opening ? `: the ${c.opening}` : ''}.`;
      case 'brilliant': return `Heaven-defying!${did} The Elder has looked, and it holds.`;
      case 'best': return 'The Heavenly move: the engine would play it too.' + did;
      case 'excellent': return 'Masterful. Within a hair of the best.' + did + better;
      case 'good': return 'Sound, if not the sharpest.' + did + better;
      case 'forced': return 'The only legal path. Nothing else could be done.' + did;
      case 'miss':
        if (c.missLine)
          return `A forced [[checkmate]] in ${mateIn(c.before)} slipped away: ${c.missLine.text}${named(c.missLine)}. ${m.san} still stands at ${scoreText(c.after)}. In sharp positions, look at every check first.`;
        return `A winning chance slipped away: you were ${scoreText(c.before)}, and after ${m.san} only ${scoreText(c.after)}.` + better +
          (c.bestSan && /[x+#]/.test(c.bestSan) ? ' Look for forcing [[tactic|tactics]] first when you are ahead.' : '');
      default: {
        const grade = v === 'blunder' ? '[[blunder|Qi deviation]]' : v === 'mistake' ? '[[mistake|Misstep]]' : '[[inaccuracy|Wavering]]';
        let why = '';
        if (c.threat) why = ` It allows a forced [[checkmate]]: ${c.threat.text}${named(c.threat)}.`;
        else if (isMate(-c.after) && c.after < 0) why = ` It lets the opponent force [[checkmate]] (${c.replySan}).`;
        else if (c.replySan && c.replyTakes && c.replyTakes.color === m.color && VALUE[c.replyTakes.type] >= 1)
          why = ` It leaves your ${NAME[c.replyTakes.type]} [[hanging|hanging]]: ${c.replySan} takes it.`;
        else if (c.replySan) why = ` The answer ${c.replySan} hurts.`;
        return `${grade}: ${scoreText(c.before)} → ${scoreText(c.after)}.${why}${better}`;
      }
    }
  }

  /**
   * The game as PGN with the Elder's grades as symbols ($2 = ?, $4 = ?? …), notes as comments and
   * [%eval] scores, which lichess and most chess apps show.
   */
  annotatedPgn(pgn: string, history: Move[]) {
    const headers = pgn.split('\n').filter((l) => l.startsWith('[') && !/^\[(Annotator|Opening) /.test(l));
    if (this.opening.name) headers.push(`[Opening "${this.opening.name}"]`);
    headers.push('[Annotator "The Elder, Chess of the Nine Peaks"]');
    const result = pgn.match(/\[Result "([^"]+)"\]/)?.[1] ?? '*';
    const plain = (t: string) =>
      t.replace(/\[\[(\w+)(?:\|([^\]]+))?\]\]/g, (_, term: string, shown?: string) => shown ?? TERMS[term]?.word.toLowerCase() ?? term).replace(/[{}]/g, '');
    const NAG: Partial<Record<Verdict, string>> = { brilliant: ' $3', inaccuracy: ' $6', mistake: ' $2', miss: ' $2', blunder: ' $4', forced: ' $7' };
    const evalText = (cp: number) => (isMate(cp) ? `#${cp > 0 ? '' : '-'}${mateIn(cp)}` : (cp / 100).toFixed(2));
    const out: string[] = [];
    let numbered = false;
    history.forEach((m, i) => {
      const p = this.plies[i];
      const no = i % 2 === 0 ? `${i / 2 + 1}. ` : numbered ? `${Math.ceil(i / 2)}... ` : '';
      const notes: string[] = [];
      const ev = this.evals[i + 1];
      // No eval once the mate is on the board.
      if (ev !== undefined && !(isMate(ev) && mateIn(ev) === 0)) notes.push(`[%eval ${evalText(ev)}]`);
      if (p) {
        const lastBook = p.verdict === 'book' && p.ply === this.opening.plies;
        if (isBad(p.verdict) || p.verdict === 'brilliant' || p.motifs.length || lastBook) notes.push(plain(p.comment));
      }
      out.push(`${no}${m.san}${p ? (NAG[p.verdict] ?? '') : ''}${notes.length ? ` { ${notes.join(' ')} }` : ''}`);
      numbered = notes.length > 0;
    });
    out.push(result);
    // Wrap the movetext at 80 columns, as PGN readers expect.
    const lines: string[] = [];
    let line = '';
    for (const w of out.join(' ').split(' ')) {
      if (line && line.length + w.length + 1 > 80) {
        lines.push(line);
        line = w;
      } else line = line ? `${line} ${w}` : w;
    }
    if (line) lines.push(line);
    return `${headers.join('\n')}\n\n${lines.join('\n')}\n`;
  }

  /** Your clear mistakes become heart demons, to be faced again as trials. */
  private summonDemons(fens: string[], source: { id: string; title: string; date: number }) {
    const found = this.plies
      .filter((p) => p.best && ['miss', 'mistake', 'blunder'].includes(p.verdict) && (!this.you || p.color === this.you))
      .map((p) => ({
        fen: fens[p.ply - 1],
        best: p.best!,
        score: p.before,
        line: p.lineUci,
        label: isMate(p.before) && p.before > 0 ? `Find the mate in ${mateIn(p.before)}` : p.before >= 200 ? 'Find the winning blow' : 'Find the move that holds',
        played: p.san,
        game: { ...source, ply: p.ply },
      }));
    return trials.add(found);
  }

  private counsel(history: Move[], fens: string[], you: Color | null, result: string) {
    const tips: Tip[] = [];
    const sides: Color[] = you ? [you] : ['w', 'b'];
    for (const c of sides) {
      const mine = this.plies.filter((p) => p.color === c);
      if (!mine.length) continue;
      const who = you ? 'You' : c === 'w' ? 'White' : 'Black';
      const yours = you ? 'your' : 'their';
      const bad = mine.filter((p) => p.verdict === 'blunder' || p.verdict === 'mistake');

      // Pieces left en prise.
      const hung = bad.filter((p) => p.comment.includes('[[hanging'));
      if (hung.length)
        tips.push({ color: c, tone: 'warn', title: 'Guard the treasury', text: `${who} left material [[hanging|hanging]] ${hung.length === 1 ? 'once' : hung.length + ' times'} (move ${hung.map((p) => moveNo(p.ply) + ' ' + p.san).slice(0, 3).join(', ')}). Before each move, ask what the opponent can capture, check or threaten next.` });

      // Allowed mate.
      const mated = bad.filter((p) => p.comment.includes('[[checkmate'));
      if (mated.length)
        tips.push({ color: c, tone: 'warn', title: 'Mind the king', text: `${moveNo(mated[0].ply)} ${mated[0].san} opened the gates to a forced [[checkmate]]. When the enemy queen and rooks gather near ${yours} king, look at every check they have.` });

      // Missed wins and tactics.
      const missedMate = mine.filter((p) => isMate(p.before) && p.before > 0 && !(isMate(p.after) && p.after > 0));
      if (missedMate.length) {
        const p = missedMate[0];
        tips.push({ color: c, tone: 'warn', title: 'The killing blow', text: `${missedMate.length > 1 ? `${missedMate.length} forced mates went unplayed. The first: on` : 'On'} ${moveNo(p.ply)} a forced [[checkmate]] in ${mateIn(p.before)} was there${p.missLine ? `: ${p.missLine}` : p.best ? `, starting ${p.best.san}` : ''}. Checks first: in every sharp position, look at each check before quieter moves.` });
      }
      const tactics = mine.filter((p) => !isBad(p.verdict) && p.motifs.some((id) => ['fork', 'pin', 'skewer', 'doubleCheck', 'discovered'].includes(id)));
      if (tactics.length >= 2)
        tips.push({ color: c, tone: 'good', title: 'A sharp blade', text: `${who} struck with ${tactics.length} tactics (${tactics.slice(0, 3).map((p) => `${moveNo(p.ply)} ${p.san}`).join(', ')}). That eye for [[fork|forks]] and [[pin|pins]] wins games.` });
      const brilliant = mine.filter((p) => p.verdict === 'brilliant');
      if (brilliant.length)
        tips.push({ color: c, tone: 'good', title: 'Heaven-defying', text: `${moveNo(brilliant[0].ply)} ${brilliant[0].san} offered material and the Elder agrees it was right: a true [[sacrifice]].` });
      const missed = mine.filter((p) => (p.verdict === 'miss' || p.verdict === 'mistake' || p.verdict === 'blunder') && p.best && /[x+]/.test(p.best.san));
      if (missed.length >= 2)
        tips.push({ color: c, tone: 'info', title: 'Strike while you can', text: `${who} passed up ${missed.length} forcing moves that won more (e.g. ${moveNo(missed[0].ply)} ${missed[0].best!.san}). Train [[tactic|tactics]] (forks, pins) for a few minutes a day: it is the fastest way to improve.` });

      // Opening habits, from this side's first moves.
      const own = history.filter((m) => m.color === c);
      const early = own.slice(0, 6);
      if (early.slice(0, 4).some((m) => m.piece === 'q'))
        tips.push({ color: c, tone: 'info', title: 'Let the queen rest', text: `The queen came out on move ${early.findIndex((m) => m.piece === 'q') + 1}. Early on, she gets chased and you lose [[tempo|tempi]]. Bring knights and bishops out first: [[development]].` });
      const twice = early.findIndex((m, i) => i > 0 && m.piece !== 'p' && !m.captured && early.slice(0, i).some((e) => e.to === m.from));
      if (twice > 0)
        tips.push({ color: c, tone: 'info', title: 'One step, one piece', text: `In the [[opening]] ${you ? 'you' : who} moved the same piece twice (${early[twice].san}) before the rest were out. Each move should bring a new piece into play.` });
      if (own.length >= 15 && !own.some((m) => m.flags.includes('k') || m.flags.includes('q')) && own.some((m) => m.piece === 'k'))
        tips.push({ color: c, tone: 'info', title: 'Seal the inner chamber', text: `${who} never castled and the king walked instead. [[castling|Castling]] early keeps the king safe and connects the rooks: [[kingSafety|king safety]].` });

      // Weakest phase.
      const phase = (p: PlyReview) => (p.ply <= 20 ? 'opening' : heavyMaterial(fens[p.ply - 1]) <= 26 ? 'endgame' : 'middlegame');
      const overall = this.accuracy[c];
      const byPhase = (['opening', 'middlegame', 'endgame'] as const)
        .map((ph) => ({ ph, list: mine.filter((p) => phase(p) === ph) }))
        .filter((x) => x.list.length >= 4)
        .map((x) => ({ ph: x.ph, acc: x.list.reduce((s, p) => s + p.accuracy, 0) / x.list.length }))
        .sort((a, b) => a.acc - b.acc);
      if (byPhase.length > 1 && byPhase[0].acc < overall - 8) {
        const advice = {
          opening: 'Learn the ideas behind one or two openings for each colour rather than long lines.',
          middlegame: 'Slow down when the position gets sharp: list the opponent’s threats before choosing a plan.',
          endgame: 'Study the basic endings: activate the king, and push passed pawns.',
        }[byPhase[0].ph];
        tips.push({ color: c, tone: 'info', title: `The ${byPhase[0].ph} is ${yours} weak gate`, text: `[[accuracy|Accuracy]] dropped to ${Math.round(byPhase[0].acc)}% in the [[${byPhase[0].ph}]]. ${advice}` });
      }

      // An advantage that slipped away.
      const peak = mine.reduce((a, p) => (p.before > a.before ? p : a), mine[0]);
      const won = (c === 'w' && result === '1-0') || (c === 'b' && result === '0-1');
      if (peak.before >= 300 && !won && result !== '*')
        tips.push({ color: c, tone: 'warn', title: 'Hold what you have taken', text: `${who} stood ${scoreText(peak.before)} around move ${Math.ceil(peak.ply / 2)} but did not win. When ahead in [[material]], trade pieces ([[simplify|simplification]]) and keep everything defended.` });

      if (overall >= 88 && !bad.length)
        tips.push({ color: c, tone: 'good', title: 'Clear mind, steady hands', text: `${Math.round(overall)}% [[accuracy]] with no mistakes. A disciplined game, worthy of the inner sect.` });
    }
    if (this.newDemons)
      tips.push({ color: you ?? 'w', tone: 'info', title: 'Heart demons stir', text: `${this.newDemons} ${this.newDemons === 1 ? 'moment' : 'moments'} from this game became heart demons. Face them in the Archive (卷) until each is slain.` });
    // How it ended, when it ended in a named mate.
    const last = this.plies.at(-1);
    const mate = last && history.length ? motifs(history.at(-1)!, history.length).find((m) => m.id === 'mate') : null;
    if (last && mate && /\[\[(?!checkmate)/.test(mate.text))
      tips.push({ color: last.color, tone: you && last.color !== you ? 'warn' : 'good', title: 'The final form', text: `${moveNo(last.ply)} ${last.san} ended it. ${mate.text}` });
    this.tips = tips;
  }
}

export const review = new Review();
