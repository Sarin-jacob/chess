<script lang="ts">
  import { onMount, tick, untrack, type Component } from 'svelte';
  import { Chess } from 'chess.js';
  import Board from './lib/Board.svelte';
  import { cultivation } from './lib/cultivation.svelte';
  import { lastUnfinished } from './lib/db';
  import EvalBar from './lib/EvalBar.svelte';
  import { LEVEL_NAMES } from './lib/engine';
  import { game, type Color } from './lib/game.svelte';
  import ArchivePanel from './lib/panels/ArchivePanel.svelte';
  import MovesPanel from './lib/panels/MovesPanel.svelte';
  import PlayPanel from './lib/panels/PlayPanel.svelte';
  import RealmPanel from './lib/panels/RealmPanel.svelte';
  import SettingsPanel from './lib/panels/SettingsPanel.svelte';
  import { pieceImages } from './lib/pieceSets';
  import { review, VERDICTS } from './lib/review.svelte';
  import ReviewWalk from './lib/ReviewWalk.svelte';
  import { enterFullscreen, exitFullscreen, keepAwake, onFullscreenExit } from './lib/screen';
  import Scenery from './lib/Scenery.svelte';
  import { settings } from './lib/settings.svelte';
  import TrialCard from './lib/TrialCard.svelte';
  import { trials } from './lib/trials.svelte';
  import { REALMS } from './lib/realms';
  import Veil from './lib/Veil.svelte';

  type Tab = 'play' | 'moves' | 'archive' | 'realm' | 'settings';
  const TABS: { id: Tab; label: string; hz: string }[] = [
    { id: 'play', label: 'Play', hz: '弈' },
    { id: 'moves', label: 'Moves', hz: '譜' },
    { id: 'archive', label: 'Archive', hz: '卷' },
    { id: 'realm', label: 'Realms', hz: '境' },
    { id: 'settings', label: 'Settings', hz: '設' },
  ];

  let tab = $state<Tab>('play');
  // The heterodox paths live at #/heresy, behind a mark in Settings; fetched only when visited.
  let heresy = $state(location.hash.startsWith('#/heresy'));
  let heresyJoin = $state(location.hash.match(/^#\/heresy\?join=(.+)$/)?.[1] ?? '');
  let HeresyPage = $state<Component<any> | null>(null);
  $effect(() => {
    if (heresy && !HeresyPage) import('./lib/heresy/HeresyPage.svelte').then((m) => (HeresyPage = m.default));
  });
  function leaveHeresy() {
    history.replaceState(null, '', location.pathname);
    heresy = false;
  }
  let joinCode = $state('');
  let ready = $state(false);
  let dismissed = $state('');
  // The 3D board pulls in three.js, so it is only fetched once someone asks for it.
  let Board3D = $state<Component<any> | null>(null);
  let load3d = $state<'idle' | 'loading' | 'failed'>('idle');
  $effect(() => {
    if (!settings.view3d || Board3D || load3d === 'loading') return;
    load3d = 'loading';
    import('./lib/Board3D.svelte')
      .then((m) => { Board3D = m.default; load3d = 'idle'; })
      .catch((e) => { console.warn('3D view failed to load', e); load3d = 'failed'; });
  });

  $effect(() => keepAwake(settings.keepAwake && game.active && !game.over && !game.study));

  // Full view for the flat board: the stage fills the screen and the page underneath can't scroll.
  let focus = $state(false);
  $effect(() => {
    if (!focus) return;
    enterFullscreen();
    document.documentElement.classList.add('locked');
    const off = onFullscreenExit(() => (focus = false));
    return () => { off(); exitFullscreen(); document.documentElement.classList.remove('locked'); };
  });
  /** Switch board, staying in full view if it was on. */
  async function toggle3d() {
    const wasFull = focus || full3d;
    focus = false;
    full3d = false;
    settings.view3d = !settings.view3d;
    if (!wasFull) return;
    await tick();
    if (settings.view3d) full3d = true;
    else focus = true;
  }

  let stageEl = $state<HTMLDivElement>();
  /** The 3D board's own full view. */
  let full3d = $state(false);
  let panelEl = $state<HTMLElement>();

  /** Bring the board into view (on phones the panels sit below it). */
  function showBoard() {
    const r = stageEl?.getBoundingClientRect();
    if (r && !focus && !full3d && (r.top < 0 || r.top > innerHeight * 0.35)) stageEl!.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function showPanel(t: Tab) {
    tab = t;
    const r = panelEl?.getBoundingClientRect();
    if (r && r.top > innerHeight * 0.6) panelEl!.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // A match just began (or was opened): the gate slides open and the board comes into view.
  /** The king in check on a board position, if any. */
  function checkOf(fen: string): string | null {
    const c = new Chess(fen);
    if (!c.isCheck()) return null;
    for (const row of c.board()) for (const p of row) if (p && p.type === 'k' && p.color === c.turn()) return p.square;
    return null;
  }

  type Arrow = { from: string; to: string; color: string };
  // What the board shows: a heart demon trial, a "find it yourself" try in the walk, or the game.
  const view = $derived.by(() => {
    const t = trials.active;
    if (t)
      return {
        fen: t.fen, movable: t.status === 'move' ? (t.fen.split(' ')[1] as Color) : null, last: t.lastMove, arrows: t.arrows as Arrow[], check: checkOf(t.fen), hint: null,
        legal: (sq: string) => trials.legalFrom(sq), move: (f: string, to: string, p?: string) => (trials.attempt(f, to, p), true),
      };
    const r = review.retry;
    if (r) {
      const fen = r.after ?? r.fen;
      return {
        fen, movable: r.after ? null : (fen.split(' ')[1] as Color), last: r.move, arrows: [] as Arrow[], check: checkOf(fen), hint: null,
        legal: (sq: string) => review.retryLegal(sq), move: (f: string, to: string, p?: string) => (review.attempt(f, to, p), true),
      };
    }
    return {
      fen: game.shownFen, movable: game.movable, last: game.shownMove, arrows: walkArrows, check: game.inCheckSquare(), hint: game.hint,
      legal: (sq: string) => game.legalFrom(sq), move: (f: string, to: string, p?: string) => game.tryMove(f, to, p),
    };
  });

  // Any new match ends a trial or a walk that was on the board.
  let seenGame = '';
  $effect(() => {
    const id = game.active ? game.id : '';
    if (id && id !== seenGame && ready) untrack(() => { trials.leave(); showBoard(); });
    seenGame = id;
  });

  /** The board is only a picture until a match is set (or a LAN rival arrives). */
  let veilUp = $state(false);
  // The gate stays a moment after it is no longer wanted, while its doors slide apart.
  $effect(() => {
    if (veiled) {
      veilUp = true;
      return;
    }
    const t = setTimeout(() => (veilUp = false), 1000);
    return () => clearTimeout(t);
  });
  const veiled = $derived(!trials.active && (!game.active || (game.mode === 'lan' && game.linkState !== 'open' && !game.history.length && !game.over)));

  /** From the end of the walk to the Elder's advice in the panel. */
  async function counsel() {
    focus = false;
    full3d = false;
    review.open = true;
    tab = 'moves';
    await tick();
    panelEl?.querySelector('.counsel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function startReview() {
    if (game.history.length < 2) return;
    review.start(game.id + ':' + game.history.length, game.history, game.you, game.result);
    review.walk();
  }
  // The walk belongs to one game; leave it if that game changes underneath.
  $effect(() => {
    if (review.walking && review.key !== game.id + ':' + game.history.length) untrack(() => review.endWalk());
  });
  $effect(() => { if (review.walking) untrack(showBoard); });
  $effect(() => { if (trials.active?.demon.id) untrack(() => { review.endWalk(); showBoard(); }); });

  // A game against the sect moves your cultivation once, when it ends while being played here
  // (opening an old finished game from the archive doesn't count).
  let inPlay = '';
  $effect(() => { if (game.active && !game.over && !game.study) inPlay = game.id; });
  $effect(() => {
    if (!game.over || game.mode !== 'ai' || !game.you || game.study || inPlay !== game.id) return;
    const won = game.youWon();
    const id = game.id;
    const level = game.level;
    untrack(() => cultivation.record(id, level, won === true ? 1 : won === false ? 0 : 0.5));
  });
  const gain = $derived(cultivation.last?.gameId === game.id ? cultivation.last : null);

  /** On phones the realms list is far below, so tapping the realm steps through them instead. */
  function realmTap() {
    if (!matchMedia('(max-width: 960px)').matches) return (tab = 'realm');
    const i = REALMS.findIndex((r) => r.id === game.realm.id);
    const next = REALMS[(i + 1) % REALMS.length];
    settings.realm = next.id;
    game.setRealm(next.id);
    game.persist();
  }

  /** At a turning point: the move played, in its verdict's colour, and the Elder's choice in green. */
  const walkArrows = $derived.by(() => {
    if (!review.walking || !review.halted) return [];
    const p = review.plies[review.halt! - 1];
    const m = game.history[review.halt! - 1];
    if (!p || !m) return [];
    const out: { from: string; to: string; color: string }[] = [{ from: m.from, to: m.to, color: VERDICTS[p.verdict].color }];
    if (p.best) out.push({ from: p.best.from, to: p.best.to, color: '#3fae55' });
    return out;
  });

  let intro = $state<{ key: number; name: string; hanzi: string; meaning: string; season: string } | null>(null);

  let replyNote = $state('');

  /** Pick up an invite link (#join=…) or a reply link (#reply=…), including in an already-open tab. */
  function readInvite() {
    heresy = location.hash.startsWith('#/heresy');
    heresyJoin = location.hash.match(/^#\/heresy\?join=(.+)$/)?.[1] ?? '';
    const m = location.hash.match(/#join=(.+)$/);
    if (m) {
      joinCode = m[1];
      tab = 'play';
    }
    const r = location.hash.match(/#reply=(.+)$/);
    if (r) {
      history.replaceState(null, '', location.pathname);
      deliverReply(r[1]);
    }
    return !!(m || r);
  }

  /** A reply link belongs to the tab that made the invite; pass it there. */
  async function deliverReply(code: string) {
    tab = 'play';
    const here = game.awaitingReply;
    const ok = await game.passReply(code);
    if (here && ok) return;
    replyNote = ok
      ? 'Reply delivered. Your duel is connecting in the other tab, so you can close this one.'
      : 'No open invite took this reply. Open it in the browser where you created the invite, while that invite is still waiting.';
    if (ok) window.close(); // only works for tabs a script opened; otherwise the note stays
  }

  onMount(async () => {
    const m = readInvite();
    addEventListener('hashchange', readInvite);
    const saved = await lastUnfinished();
    if (saved && !m) game.resume(saved);
    else game.idle();
    ready = true;
  });

  // Announce the realm whenever a match moves somewhere new.
  let lastRealm = '';
  $effect(() => {
    const r = game.realm;
    if (!ready || r.id === lastRealm) return;
    lastRealm = r.id;
    intro = { key: Date.now(), name: r.name, hanzi: r.hanzi, meaning: r.meaning, season: r.season };
    const k = intro.key;
    setTimeout(() => { if (intro?.key === k) intro = null; }, 2200);
  });

  const VAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

  /** Pieces captured *by* each colour, plus the material balance from white's side. */
  const captures = $derived.by(() => {
    const by: Record<Color, string[]> = { w: [], b: [] };
    let diff = 0;
    for (const m of game.history.slice(0, game.viewPly ?? undefined)) {
      if (m.captured) {
        by[m.color].push(m.captured);
        diff += (m.color === 'w' ? 1 : -1) * VAL[m.captured];
      }
      if (m.promotion) diff += (m.color === 'w' ? 1 : -1) * (VAL[m.promotion] - 1);
    }
    const order = 'qrbnp';
    by.w.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    by.b.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    return { by, diff };
  });

  function nameFor(c: Color) {
    if (game.mode === 'local' || !game.active) return c === 'w' ? 'White' : 'Black';
    if (c === game.you) return settings.name || 'You';
    if (game.mode === 'ai') return LEVEL_NAMES[game.level - 1];
    return game.opponent || (game.linkState === 'open' ? 'Rival' : 'Awaiting rival…');
  }

  const top = $derived<Color>(game.orientation === 'w' ? 'b' : 'w');
  const bottom = $derived<Color>(game.orientation);

  const showOver = $derived(game.over && dismissed !== game.id + game.result);
  const verdict = $derived.by(() => {
    if (!game.over) return '';
    const won = game.youWon();
    if (game.result === '1/2-1/2') return game.reason === 'stalemate' ? 'Stalemate' : 'Honours even';
    if (won === true) return 'Victory';
    if (won === false) return 'Defeat';
    return game.result === '1-0' ? 'White prevails' : 'Black prevails';
  });

  function newMatch() {
    if (game.mode === 'lan') {
      game.offerRematch();
      return;
    }
    game.newGame({ mode: game.mode, color: game.mode === 'ai' ? (game.you === 'w' ? 'b' : 'w') : undefined, level: settings.level, rules: game.rules });
  }

  function clockText(ms: number) {
    const s = Math.ceil(ms / 1000);
    if (ms < 10_000) return (Math.ceil(ms / 100) / 10).toFixed(1);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function onkey(e: KeyboardEvent) {
    if ((e.target as HTMLElement).closest('input, textarea')) return;
    if (e.key === 'Escape' && focus) focus = false;
    else if (trials.active || review.retry) return;
    else if (review.walking) {
      if (e.key === 'ArrowLeft') review.prev();
      else if (e.key === 'ArrowRight') review.next();
      else if (e.key === ' ' && !(e.target as HTMLElement).closest('button')) review.toggle();
      else if (e.key === 'f') game.flip();
      else return;
    }
    else if (e.key === 'ArrowLeft') game.step(-1);
    else if (e.key === 'ArrowRight') game.step(1);
    else if (e.key === 'ArrowUp') game.step('start');
    else if (e.key === 'ArrowDown') game.step('end');
    else if (e.key === 'f') game.flip();
    else return;
    e.preventDefault();
  }
</script>

<svelte:window onkeydown={onkey} />

{#if heresy}
  {#if HeresyPage}<HeresyPage onexit={leaveHeresy} joinCode={heresyJoin} />{/if}
{:else}
<Scenery realm={game.realm} animate={settings.particles} />

<div class="app">
  <header>
    <div class="brand">
      <span class="seal" title="棋 — Chess">棋</span>
      <div>
        <h1>Chess</h1>
        <p>of the Nine Peaks</p>
      </div>
    </div>
    <button class="realm-tag" onclick={realmTap} title="{game.realm.hanzi} — {game.realm.meaning}. Change realm">
      <span class="hz">{game.realm.hanzi}</span>
      <span><b>{game.realm.name}</b><small>“{game.realm.meaning}” · {game.realm.season}{settings.realm === 'random' ? ' · wandering' : ''}</small></span>
    </button>
  </header>

  <main>
    <div class="stage" class:focus class:walking={review.walking} bind:this={stageEl}>
      {#snippet bar(c: Color)}
        {@const caps = captures.by[c]}
        {@const adv = c === 'w' ? captures.diff : -captures.diff}
        <div class="player" class:active={game.active && !game.over && game.turn === c && game.viewPly === null}>
          <span class="swatch" class:black={c === 'b'}></span>
          <span class="pname">{nameFor(c)}</span>
          {#if game.thinking && game.turn === c}<span class="think">meditating<i>.</i><i>.</i><i>.</i></span>{/if}
          <span class="caps">
            {#each caps as p}<img src={pieceImages(settings.pieceSet)[(c === 'w' ? 'b' : 'w') + p]} alt={p} class:rim={settings.outlines && c === 'w'} />{/each}
            {#if adv > 0}<em>+{adv}</em>{/if}
          </span>
          {#if game.active && game.rules.clock}
            {@const ms = game.remaining(c)}
            <span class="clock" class:run={game.clockRunning && game.turn === c} class:low={ms < 20_000} title="Time left">{clockText(ms)}</span>
          {/if}
        </div>
      {/snippet}

      {#snippet walk3d()}{#if trials.active}<TrialCard />{:else}<ReviewWalk oncounsel={counsel} />{/if}{/snippet}

      {#snippet hud3d(where: 'top' | 'bottom')}
        {@render bar(where === 'top' ? top : bottom)}
      {/snippet}

      {@render bar(top)}
      <div class="board-row" class:with-bar={settings.evalBar && !veiled}>
      {#if settings.evalBar && !veiled && !trials.active && !review.retry}<EvalBar fen={game.shownFen} orientation={game.orientation} result={game.viewPly === null ? game.result : '*'} />{/if}
      <div class="board-wrap">
        {#if settings.view3d && Board3D}
          <Board3D
            fen={view.fen}
            orientation={game.orientation}
            movable={view.movable}
            lastMove={view.last}
            check={view.check}
            hint={view.hint}
            arrows={view.arrows}
            coords={settings.coords}
            realm={game.realm}
            hud={hud3d}
            footer={trials.active || review.walking ? walk3d : undefined}
            controls={controlsRow}
            bind:full={full3d}
            status={review.walking ? 'The Elder’s walk' : game.study ? 'Studying' : game.over ? verdict : game.thinking ? 'Opponent meditating…' : game.active ? (game.turn === 'w' ? 'White' : 'Black') + ' to move' : ''}
            legalFrom={view.legal}
            onmove={view.move}
            onflip={() => game.flip()}
          />
        {:else if settings.view3d}
          <div class="loading3d">
            {#if load3d === 'failed'}
              <p>The 3D realm couldn't be loaded (offline before it was ever opened?).</p>
              <button onclick={() => { load3d = 'idle'; settings.view3d = false; }}>Use the 2D board</button>
            {:else}
              <p>Raising the realm…</p>
            {/if}
          </div>
        {:else}
        <Board
          fen={view.fen}
          orientation={game.orientation}
          movable={view.movable}
          lastMove={view.last}
          check={view.check}
          hint={view.hint}
          arrows={view.arrows}
          coords={settings.coords}
          outlines={settings.outlines}
          pieceSet={settings.pieceSet}
          legalFrom={view.legal}
          onmove={view.move}
        />
        {/if}
        {#if game.viewPly !== null && !review.walking}
          <button class="live-pill" onclick={() => game.step('end')}>Viewing move {game.viewPly} · back to {game.over || game.study ? 'the end' : 'live'} ↦</button>
        {/if}
        {#if veilUp}
          <Veil realm={game.realm} open={!veiled} waiting={game.active} onplay={() => showPanel('play')} onarchive={() => showPanel('archive')} />
        {/if}
      </div>
      </div>
      {@render bar(bottom)}

      {#if replyNote}
        <p class="reply-note" role="status">{replyNote} <button class="link" onclick={() => (replyNote = '')}>Dismiss</button></p>
      {/if}
      {#if trials.active}
        <TrialCard />
      {:else if review.walking}
        <ReviewWalk oncounsel={counsel} />
      {/if}
      {@render controlsRow()}
    </div>

    {#snippet controlsRow()}
      <div class="controls">
        {#if game.study}
          {#if !game.over && game.mode !== 'lan'}<button class="primary" onclick={() => { review.endWalk(); review.close(); game.play(); }}>▶ Resume this match</button>{/if}
        {:else if game.active && game.mode !== 'lan' && !review.walking}
          {#if game.rules.undo}<button onclick={() => game.undo()} disabled={!game.history.length}>↶ Undo</button>{/if}
          {#if game.rules.hints}<button onclick={() => game.askHint()} disabled={!game.movable}>✦ Hint</button>{/if}
        {/if}
        {#if game.canFlip}<button onclick={() => game.flip()} disabled={veiled}>⇅ Flip</button>{/if}
        {#if focus || full3d}
          <button onclick={() => { focus = false; full3d = false; }} title="Leave full view (Esc)">✕ Exit</button>
        {:else}
          <button onclick={() => (settings.view3d ? (full3d = true) : (focus = true))} disabled={veiled} title="Fill the screen; the page can't scroll while you play" aria-label="Full view">⛶</button>
        {/if}
        <button onclick={toggle3d} title={settings.view3d ? 'Back to the flat board' : 'Immersive 3D view of the realm'}>{settings.view3d ? '▦ 2D' : '◈ 3D'}</button>
        {#if !game.active || game.study || review.walking}
          <!-- Draw and resign only make sense mid-match. -->
        {:else if game.mode !== 'lan'}
          <button onclick={() => game.resign()} disabled={game.over || !game.history.length}>⚑ Resign</button>
        {:else if game.drawOffer === 'received'}
          <button class="primary" onclick={() => game.answerDraw(true)}>Accept draw</button>
          <button onclick={() => game.answerDraw(false)}>Decline</button>
        {:else}
          <button onclick={() => game.offerDraw()} disabled={game.over || game.drawOffer === 'sent' || game.linkState !== 'open'}>
            {game.drawOffer === 'sent' ? 'Draw offered' : '½ Draw'}
          </button>
          <button onclick={() => game.resign()} disabled={game.over || !game.history.length}>⚑ Resign</button>
        {/if}
      </div>
    {/snippet}

    <aside class="panel" bind:this={panelEl}>
      <nav>
        {#each TABS as t}
          <button class:on={tab === t.id} onclick={() => (tab = t.id)} title="{t.hz} — {t.label}">
            <span class="hz">{t.hz}</span>{t.label}
          </button>
        {/each}
      </nav>
      <div class="content">
        {#if tab === 'play'}<PlayPanel {joinCode} />
        {:else if tab === 'moves'}<MovesPanel />
        {:else if tab === 'archive'}<ArchivePanel onopen={() => (tab = 'moves')} onreview={() => { tab = 'moves'; startReview(); }} />
        {:else if tab === 'realm'}<RealmPanel />
        {:else}<SettingsPanel />{/if}
      </div>
    </aside>
  </main>

  <footer>
    <a href="https://github.com/Sarin-jacob/chess" target="_blank" rel="noopener">source</a> · works offline · your games stay in this browser
  </footer>
</div>

{#if showOver}
  {@const glyph = game.youWon() === true ? ['勝', 'Victory'] : game.youWon() === false ? ['敗', 'Defeat'] : game.result === '1/2-1/2' ? ['和', 'Draw'] : ['終', 'The end']}
  <div class="over" role="dialog" aria-label="Match result">
    <div class="card">
      <span class="hz" title="{glyph[0]} — {glyph[1]}">{glyph[0]}</span>
      <h2>{verdict}</h2>
      <p>{game.result} · {game.reason}</p>
      {#if gain}
        {#if gain.to.index > gain.from.index}
          <p class="breakthrough"><span class="hz">突破</span> Breakthrough! {gain.to.name}</p>
        {:else if gain.to.index < gain.from.index}
          <p class="fall">Your cultivation slips back to {gain.to.name}.</p>
        {/if}
        <p class="gain" title="Cultivation {gain.rating}"><span class="hz">修为</span> {gain.delta >= 0 ? '+' : ''}{gain.delta} · {gain.to.name}, {gain.to.layerName}</p>
      {/if}
      {#if game.mode === 'lan' && game.rematchOffer === 'received'}<p class="offer">{game.opponent || 'Your rival'} wants a rematch.</p>{/if}
      <div class="row">
        <button class="primary" onclick={newMatch} disabled={game.mode === 'lan' && (game.rematchOffer === 'sent' || game.linkState !== 'open')}>
          {game.mode === 'lan' ? (game.rematchOffer === 'received' ? 'Accept rematch' : game.rematchOffer === 'sent' ? 'Rematch offered' : 'Offer rematch') : 'Next match'}
        </button>
        {#if game.history.length >= 2}<button onclick={() => { dismissed = game.id + game.result; tab = 'moves'; startReview(); }}>鉴 Review</button>{/if}
      </div>
    </div>
  </div>
{/if}

{#if intro}
  {#key intro.key}
    <div class="intro" aria-live="polite">
      <span class="hz">{intro.hanzi}</span>
      <b>{intro.name}</b>
      <small>“{intro.meaning}” · {intro.season}</small>
    </div>
  {/key}
{/if}

{/if}
<style>
  .app {
    min-height: 100dvh;
    display: grid;
    grid-template-rows: auto 1fr auto;
    max-width: 1280px;
    margin: 0 auto;
    padding: 0 16px;
  }
  header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.8rem 0; }
  .brand { display: flex; align-items: center; gap: 0.7rem; }
  .seal {
    font-family: 'Ma Shan Zheng', serif;
    font-size: 1.8rem;
    width: 2.6rem;
    height: 2.6rem;
    display: grid;
    place-items: center;
    background: #b3261e;
    color: #fff4ea;
    border-radius: 6px;
    box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.3), 0 4px 14px rgba(0, 0, 0, 0.35);
    transform: rotate(-4deg);
  }
  h1 { margin: 0; font: 700 1.5rem/1 'Cinzel', serif; letter-spacing: 0.08em; }
  .brand p { margin: 0.15rem 0 0; font-size: 0.72rem; color: var(--muted); letter-spacing: 0.18em; text-transform: uppercase; }
  .realm-tag {
    all: unset;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.35rem 0.8rem 0.35rem 0.5rem;
    border-radius: 999px;
    background: var(--panel);
    border: 1px solid var(--panel-border);
    backdrop-filter: blur(8px);
  }
  .realm-tag .hz { font-family: 'Ma Shan Zheng', serif; font-size: 1.4rem; color: var(--accent); }
  .realm-tag b { display: block; font: 600 0.82rem 'Cinzel', serif; }
  .realm-tag small { font-size: 0.7rem; color: var(--muted); }

  main {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 360px;
    gap: 1.5rem;
    align-items: start;
    padding-bottom: 1rem;
  }
  .stage {
    display: grid;
    gap: 0.5rem;
    width: 100%;
    max-width: min(100%, calc(100dvh - 230px));
    min-width: 280px;
    justify-self: center;
  }
  .board-wrap { position: relative; }
  .board-row { display: grid; grid-template-columns: minmax(0, 1fr); }
  .board-row.with-bar { grid-template-columns: 14px minmax(0, 1fr); gap: 6px; }
  .stage.focus {
    position: fixed;
    inset: 0;
    z-index: 30;
    max-width: none;
    min-width: 0;
    align-content: center;
    justify-content: center;
    /* Board as large as fits under the bars and buttons. */
    grid-template-columns: min(100vw - 16px, 100dvh - 150px);
    padding: max(8px, env(safe-area-inset-top)) 8px max(8px, env(safe-area-inset-bottom));
    background: radial-gradient(ellipse at 50% 35%, var(--bg3), var(--bg2) 45%, var(--bg1));
    overscroll-behavior: none;
    touch-action: none;
  }
  /* Leave room for the walk's card under the board. */
  .stage.focus.walking { grid-template-columns: min(100vw - 16px, 100dvh - 300px); }
  .stage.focus .reply-note { display: none; }
  .loading3d {
    aspect-ratio: 1;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 0.6rem;
    text-align: center;
    padding: 1rem;
    border-radius: 6px;
    background: var(--panel);
    border: 1px solid var(--panel-border);
    color: var(--muted);
    font-family: 'Cinzel', serif;
  }
  .live-pill {
    position: absolute;
    left: 50%;
    bottom: -0.4rem;
    transform: translate(-50%, 50%);
    z-index: 5;
    background: var(--accent);
    color: var(--accent-ink);
    border: 0;
    font-size: 0.78rem;
    white-space: nowrap;
  }
  .player {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.6rem;
    border-radius: 8px;
    background: var(--panel);
    border: 1px solid var(--panel-border);
    backdrop-filter: blur(6px);
    min-height: 2.3rem;
    transition: box-shadow 0.3s, border-color 0.3s;
  }
  .player.active { border-color: var(--accent); box-shadow: 0 0 16px -6px var(--accent); }
  .swatch { width: 14px; height: 14px; border-radius: 50%; background: #f5f2ea; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4); flex: none; }
  .swatch.black { background: #1b1b1f; box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.35); }
  .pname { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .think { font-size: 0.78rem; color: var(--accent); font-style: italic; }
  .think i { animation: blink 1.2s infinite; font-style: normal; }
  .think i:nth-child(2) { animation-delay: 0.2s; }
  .think i:nth-child(3) { animation-delay: 0.4s; }
  .caps { margin-left: auto; display: flex; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
  .caps img { width: 18px; height: 18px; margin-left: -5px; }
  .caps img.rim { filter: drop-shadow(0 0 0.6px rgb(255 255 255 / 0.9)) drop-shadow(0 0 0.6px rgb(255 255 255 / 0.9)); }
  .caps em { font-style: normal; font-size: 0.8rem; color: var(--muted); margin-left: 0.3rem; }
  .clock {
    font: 600 1rem ui-monospace, 'Cascadia Mono', Menlo, monospace;
    font-variant-numeric: tabular-nums;
    padding: 0.1rem 0.5rem;
    border-radius: 6px;
    background: color-mix(in srgb, var(--bg1) 55%, transparent);
    color: var(--muted);
    min-width: 4.2ch;
    text-align: center;
    flex: none;
  }
  .clock.run { background: var(--accent); color: var(--accent-ink); }
  .clock.low.run { background: #c0392b; color: #fff; }
  .reply-note {
    margin: 0.2rem 0 0;
    padding: 0.5rem 0.8rem;
    border: 1px solid var(--accent);
    border-radius: 10px;
    text-align: center;
    font-size: 0.85rem;
  }
  .link { all: unset; cursor: pointer; color: var(--accent); text-decoration: underline; text-underline-offset: 3px; }
  .link:focus-visible { outline: 2px solid var(--accent); }
  .controls { display: flex; flex-wrap: wrap; gap: 0.4rem; justify-content: center; padding-top: 0.3rem; }
  .controls button { flex: 1 1 auto; }

  .panel {
    background: var(--panel);
    border: 1px solid var(--panel-border);
    border-radius: 14px;
    backdrop-filter: blur(12px);
    overflow: hidden;
    position: sticky;
    top: 1rem;
  }
  nav { display: grid; grid-template-columns: repeat(5, 1fr); border-bottom: 1px solid var(--panel-border); }
  nav button {
    all: unset;
    cursor: pointer;
    display: grid;
    justify-items: center;
    gap: 0.1rem;
    padding: 0.55rem 0;
    font-size: 0.72rem;
    color: var(--muted);
    border-bottom: 2px solid transparent;
  }
  nav button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  nav button.on { color: var(--ink); border-bottom-color: var(--accent); }
  nav .hz { font-family: 'Ma Shan Zheng', serif; font-size: 1.25rem; line-height: 1; }
  nav button.on .hz { color: var(--accent); }
  .content { padding: 1rem; }

  footer { text-align: center; font-size: 0.72rem; color: var(--muted); padding: 0.8rem 0 1.2rem; }
  footer a { color: inherit; }

  .over {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.45);
    z-index: 50;
    animation: fade 0.4s;
    padding: 16px;
  }
  .card {
    text-align: center;
    padding: 1.6rem 2rem;
    border-radius: 16px;
    background: var(--panel);
    border: 1px solid var(--panel-border);
    backdrop-filter: blur(16px);
    box-shadow: 0 20px 80px -10px var(--glow);
    min-width: min(320px, 100%);
    animation: rise 0.5s cubic-bezier(0.2, 0.7, 0.3, 1);
  }
  .card .hz { font-family: 'Ma Shan Zheng', serif; font-size: 4.5rem; line-height: 1; color: var(--accent); text-shadow: 0 0 30px var(--glow); }
  .card h2 { margin: 0.3rem 0 0.2rem; font: 700 1.6rem 'Cinzel', serif; }
  .card p { margin: 0 0 1rem; color: var(--muted); text-transform: capitalize; }
  .card .offer { color: var(--accent); text-transform: none; }
  .card .gain { text-transform: none; font-size: 0.88rem; margin-top: -0.6rem; }
  .card .gain .hz, .card .breakthrough .hz { font-family: 'Ma Shan Zheng', serif; font-size: 1.1rem; color: var(--accent); text-shadow: none; }
  .card .breakthrough { text-transform: none; color: var(--accent); font: 700 1.05rem 'Cinzel', serif; text-shadow: 0 0 18px var(--glow); animation: rise 0.8s 0.3s both; }
  .card .breakthrough .hz { font-size: 1.5rem; }
  .card .fall { text-transform: none; font-size: 0.82rem; }
  .card .row { display: flex; gap: 0.5rem; justify-content: center; }

  .intro {
    position: fixed;
    inset: 0;
    display: grid;
    place-content: center;
    justify-items: center;
    pointer-events: none;
    z-index: 40;
    animation: intro 2.2s ease forwards;
    text-shadow: 0 0 40px var(--glow), 0 2px 10px rgba(0, 0, 0, 0.5);
  }
  .intro .hz { font-family: 'Ma Shan Zheng', serif; font-size: min(28vw, 11rem); line-height: 1; color: var(--accent); }
  .intro b { font: 700 clamp(1.2rem, 4vw, 2rem) 'Cinzel', serif; letter-spacing: 0.1em; }
  .intro small { color: var(--muted); letter-spacing: 0.3em; text-transform: uppercase; }

  @keyframes blink { 50% { opacity: 0.2; } }
  @keyframes fade { from { opacity: 0; } }
  @keyframes rise { from { transform: translateY(20px) scale(0.96); opacity: 0; } }
  @keyframes intro {
    0% { opacity: 0; transform: scale(1.08); filter: blur(6px); }
    20% { opacity: 1; transform: scale(1); filter: blur(0); }
    75% { opacity: 1; }
    100% { opacity: 0; transform: scale(0.98); }
  }

  @media (max-width: 960px) {
    main { grid-template-columns: 1fr; }
    .stage { max-width: min(100%, 640px); min-width: 0; }
    .panel { position: static; width: 100%; max-width: 640px; justify-self: center; }
  }
  @media (max-width: 520px) {
    header { padding: 0.6rem 0; }
    .brand p { display: none; }
    .seal { width: 2.1rem; height: 2.1rem; font-size: 1.4rem; }
    h1 { font-size: 1.2rem; }
    .realm-tag small { display: none; }
    .controls button { font-size: 0.8rem; padding: 0.45rem 0.5rem; }
  }
</style>
