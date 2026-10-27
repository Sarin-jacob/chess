import { Chess, type Move, type Square } from 'chess.js';
import { saveGame, type GameRecord, type Mode, type Result } from './db';
import { bestMove, cancelEngine, LEVEL_NAMES } from './engine';
import { play, type Fx } from './fx';
import { LanLink, type LanMessage, type LinkState } from './lan';
import { applyRealm, randomRealm, realmById, type Realm } from './realms';
import { settings } from './settings.svelte';

export type Color = 'w' | 'b';

export interface NewGameOptions {
  mode: Mode;
  /** Colour for the player on this device ('random' resolved here). */
  color?: Color | 'random';
  level?: number;
  realm?: string;
}

const uid = (): string => (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));
const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');

class Game {
  private chess = new Chess();

  id = $state(uid());
  mode = $state<Mode>('ai');
  you = $state<Color | null>('w');
  level = $state(settings.level);
  realm = $state<Realm>(realmById('frost'));
  startedAt = $state(Date.now());

  /** False until a match is begun or resumed; the board is just scenery until then. */
  active = $state(false);
  fen = $state(this.chess.fen());
  history = $state.raw<Move[]>([]);
  result = $state<Result>('*');
  reason = $state('');
  thinking = $state(false);
  hint = $state<{ from: string; to: string } | null>(null);
  /** Ply being reviewed in the move list; null = live position. */
  viewPly = $state<number | null>(null);
  orientation = $state<Color>('w');

  // LAN
  link: LanLink | null = null;
  linkState = $state<LinkState>('idle');
  isHost = $state(false);
  opponent = $state('');
  drawOffer = $state<'none' | 'sent' | 'received'>('none');
  rematchOffer = $state<'none' | 'sent' | 'received'>('none');

  turn = $derived<Color>(this.fen.split(' ')[1] as Color);
  over = $derived(this.result !== '*');
  lastMove = $derived(this.history.at(-1) ?? null);

  // ---------- setup ----------

  /** Show a fresh board in a (random or fixed) realm without starting a match. */
  idle() {
    cancelEngine();
    this.chess = new Chess();
    this.active = false;
    this.thinking = false;
    this.result = '*';
    this.reason = '';
    this.hint = null;
    this.viewPly = null;
    this.pickRealm();
    this.sync();
  }

  newGame(opts: NewGameOptions) {
    cancelEngine();
    this.thinking = false;
    this.chess = new Chess();
    this.active = true;
    this.id = uid();
    this.mode = opts.mode;
    this.level = opts.level ?? settings.level;
    const color = opts.color === 'random' || !opts.color ? (Math.random() < 0.5 ? 'w' : 'b') : opts.color;
    this.you = opts.mode === 'local' ? null : color;
    this.orientation = this.you ?? 'w';
    this.startedAt = Date.now();
    this.result = '*';
    this.reason = '';
    this.hint = null;
    this.viewPly = null;
    this.drawOffer = 'none';
    this.rematchOffer = 'none';
    this.pickRealm(opts.realm);
    this.writeHeaders();
    this.sync();
    this.fx('start');
    this.persist();
    this.maybeEngine();
  }

  /** Choose the realm for a fresh match: the fixed one, or a random one that differs from the last. */
  private pickRealm(forced?: string) {
    const id = forced ?? (settings.realm === 'random' ? randomRealm(this.realm.id).id : settings.realm);
    this.setRealm(id);
  }

  setRealm(id: string) {
    this.realm = realmById(id);
    applyRealm(this.realm);
  }

  resume(rec: GameRecord) {
    cancelEngine();
    this.chess = new Chess();
    try {
      this.chess.loadPgn(rec.pgn);
    } catch {
      this.chess.load(rec.fen);
    }
    this.active = true;
    this.id = rec.id;
    this.mode = rec.mode;
    this.you = rec.you;
    this.level = rec.level ?? settings.level;
    this.orientation = rec.you ?? 'w';
    this.startedAt = rec.startedAt;
    this.result = rec.result;
    this.reason = rec.reason ?? '';
    this.viewPly = null;
    this.hint = null;
    this.setRealm(settings.realm === 'random' ? rec.realm : settings.realm);
    this.sync();
    this.maybeEngine();
  }

  private names(): { white: string; black: string } {
    const me = settings.name || 'You';
    if (this.mode === 'local') return { white: 'White', black: 'Black' };
    const them = this.mode === 'ai' ? LEVEL_NAMES[this.level - 1] : this.opponent || 'Rival';
    return this.you === 'w' ? { white: me, black: them } : { white: them, black: me };
  }

  private writeHeaders() {
    const { white, black } = this.names();
    this.chess.setHeader('Event', this.mode === 'ai' ? 'Duel with the sect' : this.mode === 'lan' ? 'LAN duel' : 'Courtyard match');
    this.chess.setHeader('Site', this.realm.name);
    this.chess.setHeader('Date', new Date(this.startedAt).toISOString().slice(0, 10).replace(/-/g, '.'));
    this.chess.setHeader('White', white);
    this.chess.setHeader('Black', black);
    this.chess.setHeader('Result', this.result);
  }

  private sync() {
    this.fen = this.chess.fen();
    this.history = this.chess.history({ verbose: true });
  }

  private record(): GameRecord {
    const { white, black } = this.names();
    return {
      id: this.id,
      mode: this.mode,
      realm: this.realm.id,
      white,
      black,
      you: this.you,
      level: this.mode === 'ai' ? this.level : undefined,
      pgn: this.chess.pgn(),
      fen: this.fen,
      moves: this.history.length,
      result: this.result,
      reason: this.reason || undefined,
      startedAt: this.startedAt,
      updatedAt: Date.now(),
    };
  }

  persist() {
    // Skip empty games so the archive doesn't fill up with abandoned boards.
    if (this.history.length === 0 && this.result === '*') return;
    saveGame(this.record());
  }

  private fx(f: Fx) {
    play(f, settings);
  }

  // ---------- moves ----------

  /** Whose pieces the person on this device may move right now. */
  get movable(): Color | null {
    if (!this.active || this.over || this.thinking || this.viewPly !== null) return null;
    if (this.mode === 'local') return this.turn;
    if (this.mode === 'lan' && this.linkState !== 'open') return null;
    return this.turn === this.you ? this.you : null;
  }

  legalFrom(square: string): Move[] {
    return this.chess.moves({ square: square as Square, verbose: true });
  }

  tryMove(from: string, to: string, promotion?: string): boolean {
    if (!this.movable) return false;
    let m: Move;
    try {
      m = this.chess.move({ from, to, promotion: promotion ?? 'q' });
    } catch {
      this.fx('error');
      return false;
    }
    this.after(m);
    if (this.mode === 'lan') this.link?.send({ t: 'move', uci: m.lan, ply: this.history.length });
    this.maybeEngine();
    return true;
  }

  private after(m: Move) {
    this.hint = null;
    this.drawOffer = 'none';
    this.sync();
    this.checkEnd();
    if (this.over) this.fx(this.result === '1/2-1/2' ? 'draw' : this.youWon() === false ? 'lose' : 'win');
    else if (this.chess.isCheck()) this.fx('check');
    else if (m.isKingsideCastle() || m.isQueensideCastle()) this.fx('castle');
    else this.fx(m.captured ? 'capture' : 'move');
    if (this.mode === 'local' && settings.autoFlip && !this.over) this.orientation = this.turn;
    this.persist();
  }

  /** true/false for the local player, null when it's not their game (pass-and-play) or undecided. */
  youWon(): boolean | null {
    if (this.result === '*' || this.result === '1/2-1/2' || !this.you) return null;
    return (this.result === '1-0') === (this.you === 'w');
  }

  private checkEnd() {
    const c = this.chess;
    if (c.isCheckmate()) this.finish(this.turn === 'w' ? '0-1' : '1-0', 'checkmate');
    else if (c.isStalemate()) this.finish('1/2-1/2', 'stalemate');
    else if (c.isInsufficientMaterial()) this.finish('1/2-1/2', 'insufficient material');
    else if (c.isThreefoldRepetition()) this.finish('1/2-1/2', 'threefold repetition');
    else if (c.isDrawByFiftyMoves()) this.finish('1/2-1/2', 'fifty-move rule');
  }

  private finish(result: Result, reason: string) {
    this.result = result;
    this.reason = reason;
    this.chess.setHeader('Result', result);
    this.chess.setHeader('Termination', reason);
    this.thinking = false;
    this.viewPly = null;
  }

  private async maybeEngine() {
    if (this.mode !== 'ai' || this.over || this.turn === this.you) return;
    this.thinking = true;
    const id = this.id;
    const ply = this.history.length;
    const started = performance.now();
    const res = await bestMove(this.fen, this.level);
    // Give fast replies a moment so the move doesn't feel instantaneous.
    const wait = 350 - (performance.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    if (id !== this.id || ply !== this.history.length) return;
    this.thinking = false;
    const m = this.chess.move({ from: res.from, to: res.to, promotion: res.promotion });
    this.after(m);
  }

  async askHint() {
    if (!this.movable || this.mode === 'lan') return;
    const fen = this.fen;
    const res = await bestMove(fen, 6);
    if (fen === this.fen) this.hint = { from: res.from, to: res.to };
  }

  undo() {
    if (this.mode === 'lan' || this.history.length === 0) return;
    cancelEngine();
    this.thinking = false;
    this.chess.undo();
    if (this.mode === 'ai' && this.turn !== this.you && this.history.length > 1) this.chess.undo();
    this.result = '*';
    this.reason = '';
    this.chess.setHeader('Result', '*');
    this.chess.removeHeader('Termination');
    this.hint = null;
    this.viewPly = null;
    this.sync();
    this.persist();
    this.maybeEngine();
  }

  resign() {
    if (!this.active || this.over) return;
    const loser = this.mode === 'local' ? this.turn : this.you!;
    this.finish(loser === 'w' ? '0-1' : '1-0', `${loser === 'w' ? 'White' : 'Black'} resigned`);
    if (this.mode === 'lan') this.link?.send({ t: 'resign' });
    this.fx(this.mode === 'local' ? 'draw' : 'lose');
    this.persist();
  }

  offerDraw() {
    if (!this.active || this.over) return;
    if (this.mode !== 'lan') {
      this.finish('1/2-1/2', 'agreement');
      this.fx('draw');
      this.persist();
      return;
    }
    if (this.drawOffer === 'received') return this.answerDraw(true);
    this.drawOffer = 'sent';
    this.link?.send({ t: 'draw', action: 'offer' });
  }

  answerDraw(accept: boolean) {
    this.link?.send({ t: 'draw', action: accept ? 'accept' : 'decline' });
    this.drawOffer = 'none';
    if (accept) {
      this.finish('1/2-1/2', 'agreement');
      this.fx('draw');
      this.persist();
    }
  }

  flip() {
    this.orientation = other(this.orientation);
  }

  /** FEN of the position currently on screen (live or under review). */
  get shownFen(): string {
    if (this.viewPly === null) return this.fen;
    return this.viewPly === 0 ? new Chess().fen() : this.history[this.viewPly - 1].after;
  }

  get shownMove(): Move | null {
    if (this.viewPly === null) return this.lastMove;
    return this.viewPly === 0 ? null : this.history[this.viewPly - 1];
  }

  step(delta: number | 'start' | 'end') {
    const n = this.history.length;
    const cur = this.viewPly ?? n;
    const next = delta === 'start' ? 0 : delta === 'end' ? n : Math.max(0, Math.min(n, cur + delta));
    this.viewPly = next === n ? null : next;
  }

  inCheckSquare(): string | null {
    const fen = this.shownFen;
    const c = fen === this.fen ? this.chess : new Chess(fen);
    if (!c.isCheck()) return null;
    const t = c.turn();
    for (const row of c.board()) for (const p of row) if (p && p.type === 'k' && p.color === t) return p.square;
    return null;
  }

  pgn() {
    return this.chess.pgn();
  }

  // ---------- LAN ----------

  private makeLink() {
    this.link?.close();
    const link = new LanLink(settings.useStun);
    link.onState = (s) => {
      this.linkState = s;
      if (s === 'open' && this.isHost) this.sendHello();
      if (s === 'open' && !this.isHost) link.send({ t: 'hi', name: settings.name });
    };
    link.onMessage = (m) => this.onLan(m);
    this.link = link;
    return link;
  }

  async hostLan(color: Color | 'random'): Promise<string> {
    this.isHost = true;
    this.opponent = '';
    const resolved = color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : color;
    this.newGame({ mode: 'lan', color: resolved });
    return this.makeLink().host();
  }

  acceptReply(code: string) {
    return this.link!.accept(code);
  }

  async joinLan(invite: string): Promise<string> {
    this.isHost = false;
    this.opponent = '';
    return this.makeLink().join(invite);
  }

  leaveLan() {
    this.link?.close();
    this.link = null;
    this.linkState = 'idle';
  }

  private sendHello() {
    this.link?.send({ t: 'hello', v: 1, name: settings.name, hostColor: this.you!, realm: this.realm.id, pgn: this.chess.pgn(), gameId: this.id });
  }

  private onLan(m: LanMessage) {
    switch (m.t) {
      case 'hello': {
        // Guest adopts the host's game and realm.
        cancelEngine();
        this.chess = new Chess();
        try { if (m.pgn) this.chess.loadPgn(m.pgn); } catch { /* fresh board */ }
        this.active = true;
        this.id = m.gameId;
        this.mode = 'lan';
        this.you = other(m.hostColor);
        this.orientation = this.you;
        this.opponent = m.name;
        this.startedAt = Date.now();
        this.result = '*';
        this.reason = '';
        this.viewPly = null;
        this.drawOffer = 'none';
        this.rematchOffer = 'none';
        this.setRealm(m.realm);
        this.writeHeaders();
        this.sync();
        this.fx('start');
        break;
      }
      case 'hi':
        this.opponent = m.name;
        this.writeHeaders();
        this.persist();
        break;
      case 'move': {
        if (this.turn === this.you) return;
        try {
          const mv = this.chess.move(m.uci);
          this.after(mv);
        } catch {
          this.link?.send({ t: 'sync-req' });
        }
        break;
      }
      case 'sync-req':
        if (this.isHost) this.sendHello();
        break;
      case 'resign':
        this.finish(this.you === 'w' ? '1-0' : '0-1', `${this.opponent || 'Rival'} resigned`);
        this.fx('win');
        this.persist();
        break;
      case 'draw':
        if (m.action === 'offer') this.drawOffer = 'received';
        else if (m.action === 'decline') this.drawOffer = 'none';
        else {
          this.drawOffer = 'none';
          this.finish('1/2-1/2', 'agreement');
          this.fx('draw');
          this.persist();
        }
        break;
      case 'rematch':
        if (m.action === 'offer') this.rematchOffer = 'received';
        else if (this.isHost) this.startRematch();
        break;
      case 'emote':
        break;
    }
  }

  offerRematch() {
    if (this.rematchOffer === 'received') {
      if (this.isHost) this.startRematch();
      else this.link?.send({ t: 'rematch', action: 'accept' });
      return;
    }
    this.rematchOffer = 'sent';
    this.link?.send({ t: 'rematch', action: 'offer' });
  }

  private startRematch() {
    const color = other(this.you!);
    this.newGame({ mode: 'lan', color });
    this.sendHello();
  }
}

export const game = new Game();
