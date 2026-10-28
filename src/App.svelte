<script lang="ts">
  import { onMount, type Component } from 'svelte';
  import Board from './lib/Board.svelte';
  import { lastUnfinished } from './lib/db';
  import { LEVEL_NAMES } from './lib/engine';
  import { game, type Color } from './lib/game.svelte';
  import ArchivePanel from './lib/panels/ArchivePanel.svelte';
  import MovesPanel from './lib/panels/MovesPanel.svelte';
  import PlayPanel from './lib/panels/PlayPanel.svelte';
  import RealmPanel from './lib/panels/RealmPanel.svelte';
  import SettingsPanel from './lib/panels/SettingsPanel.svelte';
  import { PIECES } from './lib/pieces';
  import Scenery from './lib/Scenery.svelte';
  import { settings } from './lib/settings.svelte';

  type Tab = 'play' | 'moves' | 'archive' | 'realm' | 'settings';
  const TABS: { id: Tab; label: string; hz: string }[] = [
    { id: 'play', label: 'Play', hz: '弈' },
    { id: 'moves', label: 'Moves', hz: '譜' },
    { id: 'archive', label: 'Archive', hz: '卷' },
    { id: 'realm', label: 'Realms', hz: '境' },
    { id: 'settings', label: 'Settings', hz: '設' },
  ];

  let tab = $state<Tab>('play');
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

  let intro = $state<{ key: number; name: string; hanzi: string; meaning: string; season: string } | null>(null);

  /** Pick up an invite link (#join=…), including one opened in an already-open tab. */
  function readInvite() {
    const m = location.hash.match(/#join=(.+)$/);
    if (m) {
      joinCode = m[1];
      tab = 'play';
    }
    return !!m;
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
    if (game.mode === 'local') return c === 'w' ? 'White' : 'Black';
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
    if (e.key === 'ArrowLeft') game.step(-1);
    else if (e.key === 'ArrowRight') game.step(1);
    else if (e.key === 'ArrowUp') game.step('start');
    else if (e.key === 'ArrowDown') game.step('end');
    else if (e.key === 'f') game.flip();
    else return;
    e.preventDefault();
  }
</script>

<svelte:window onkeydown={onkey} />

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
    <button class="realm-tag" onclick={() => (tab = 'realm')} title="{game.realm.hanzi} — {game.realm.meaning}. Change realm">
      <span class="hz">{game.realm.hanzi}</span>
      <span><b>{game.realm.name}</b><small>“{game.realm.meaning}” · {game.realm.season}{settings.realm === 'random' ? ' · wandering' : ''}</small></span>
    </button>
  </header>

  <main>
    <div class="stage">
      {#snippet bar(c: Color)}
        {@const caps = captures.by[c]}
        {@const adv = c === 'w' ? captures.diff : -captures.diff}
        <div class="player" class:active={game.active && !game.over && game.turn === c && game.viewPly === null}>
          <span class="swatch" class:black={c === 'b'}></span>
          <span class="pname">{nameFor(c)}</span>
          {#if game.thinking && game.turn === c}<span class="think">meditating<i>.</i><i>.</i><i>.</i></span>{/if}
          <span class="caps">
            {#each caps as p}<img src={PIECES[(c === 'w' ? 'b' : 'w') + p]} alt={p} />{/each}
            {#if adv > 0}<em>+{adv}</em>{/if}
          </span>
          {#if game.active && game.rules.clock}
            {@const ms = game.remaining(c)}
            <span class="clock" class:run={game.clockRunning && game.turn === c} class:low={ms < 20_000} title="Time left">{clockText(ms)}</span>
          {/if}
        </div>
      {/snippet}

      {#snippet hud3d()}
        {@render bar(top)}
        {@render bar(bottom)}
      {/snippet}

      {@render bar(top)}
      <div class="board-wrap">
        {#if settings.view3d && Board3D}
          <Board3D
            fen={game.shownFen}
            orientation={game.orientation}
            movable={game.movable}
            lastMove={game.shownMove}
            check={game.inCheckSquare()}
            hint={game.hint}
            coords={settings.coords}
            realm={game.realm}
            hud={hud3d}
            status={game.over ? verdict : game.thinking ? 'Opponent meditating…' : game.active ? (game.turn === 'w' ? 'White' : 'Black') + ' to move' : ''}
            legalFrom={(sq: string) => game.legalFrom(sq)}
            onmove={(f: string, t: string, p?: string) => game.tryMove(f, t, p)}
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
          fen={game.shownFen}
          orientation={game.orientation}
          movable={game.movable}
          lastMove={game.shownMove}
          check={game.inCheckSquare()}
          hint={game.hint}
          coords={settings.coords}
          legalFrom={(sq) => game.legalFrom(sq)}
          onmove={(f, t, p) => game.tryMove(f, t, p)}
        />
        {/if}
        {#if game.viewPly !== null}
          <button class="live-pill" onclick={() => game.step('end')}>Reviewing move {game.viewPly} · back to live ↦</button>
        {/if}
      </div>
      {@render bar(bottom)}

      {#if ready && !game.active}
        <p class="idle-tip">
          No duel underway — the board is yours to admire.
          <button class="link" onclick={() => (tab = 'play')}>Set up a match in Play</button>
        </p>
      {/if}
      <div class="controls">
        {#if game.active && game.mode !== 'lan'}
          {#if game.rules.undo}<button onclick={() => game.undo()} disabled={!game.history.length}>↶ Undo</button>{/if}
          {#if game.rules.hints}<button onclick={() => game.askHint()} disabled={!game.movable}>✦ Hint</button>{/if}
        {/if}
        {#if game.canFlip}<button onclick={() => game.flip()}>⇅ Flip</button>{/if}
        <button onclick={() => (settings.view3d = !settings.view3d)} title={settings.view3d ? 'Back to the flat board' : 'Immersive 3D view of the realm'}>{settings.view3d ? '▦ 2D' : '◈ 3D'}</button>
        {#if !game.active}
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
    </div>

    <aside class="panel">
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
        {:else if tab === 'archive'}<ArchivePanel onopen={() => (tab = 'moves')} />
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
      {#if game.mode === 'lan' && game.rematchOffer === 'received'}<p class="offer">{game.opponent || 'Your rival'} wants a rematch.</p>{/if}
      <div class="row">
        <button class="primary" onclick={newMatch} disabled={game.mode === 'lan' && (game.rematchOffer === 'sent' || game.linkState !== 'open')}>
          {game.mode === 'lan' ? (game.rematchOffer === 'received' ? 'Accept rematch' : game.rematchOffer === 'sent' ? 'Rematch offered' : 'Offer rematch') : 'Next match'}
        </button>
        <button onclick={() => { dismissed = game.id + game.result; tab = 'moves'; }}>Review</button>
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
  .idle-tip { margin: 0.2rem 0 0; text-align: center; font-size: 0.85rem; color: var(--muted); }
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
