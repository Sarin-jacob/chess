<script lang="ts">
  import { Chess } from 'chess.js';
  import { cultivation } from '../cultivation.svelte';
  import { clearGames, deleteGame, listGames, saveGame, type GameRecord } from '../db';
  import { LEVEL_NAMES } from '../engine';
  import { openingOf } from '../openings';
  import { trials } from '../trials.svelte';
  import { game } from '../game.svelte';
  import { review } from '../review.svelte';
  import { downloadPgn } from '../pgn';
  import { REALMS, realmById } from '../realms';

  let { onopen, onreview }: { onopen: () => void; onreview: () => void } = $props();

  let games = $state<GameRecord[]>([]);
  let importError = $state('');

  async function refresh() {
    games = await listGames();
  }

  // Re-read whenever the live game changes (it is saved on every move).
  $effect(() => {
    game.history;
    game.result;
    refresh();
  });

  const outcome = (g: GameRecord): 'win' | 'loss' | 'draw' | 'live' | 'done' => {
    if (g.result === '*') return 'live';
    if (g.result === '1/2-1/2') return 'draw';
    if (!g.you) return 'done';
    return (g.result === '1-0') === (g.you === 'w') ? 'win' : 'loss';
  };

  const stats = $derived.by(() => {
    const s = { win: 0, loss: 0, draw: 0, played: 0 };
    const realmWins: Record<string, number> = {};
    for (const g of games) {
      const o = outcome(g);
      if (o === 'win' || o === 'loss' || o === 'draw') s[o]++;
      if (o !== 'live') s.played++;
      if (o === 'win') realmWins[g.realm] = (realmWins[g.realm] ?? 0) + 1;
    }
    return { ...s, realmWins };
  });

  function load(g: GameRecord, study: boolean) {
    review.endWalk();
    game.leaveLan();
    // LAN games can only be looked at here, not continued.
    game.resume(g.mode === 'lan' && g.result === '*' ? { ...g, mode: 'local' } : g, study || g.mode === 'lan');
  }

  /** Finished games open to read; unfinished ones pick up where they stopped. */
  function open(g: GameRecord) {
    load(g, false);
    onopen();
  }

  /** Any game, finished or not, opened for the Elder's walk-through. */
  function reviewGame(g: GameRecord) {
    load(g, true);
    onreview();
  }

  async function remove(g: GameRecord) {
    if (!confirm(`Delete this game (${g.white} vs ${g.black})?`)) return;
    await deleteGame(g.id);
    refresh();
  }

  async function wipe() {
    if (!confirm('Delete the entire archive on this device? This cannot be undone.')) return;
    await clearGames();
    refresh();
  }

  function exportAll() {
    downloadPgn(games.map((g) => g.pgn).join('\n\n'), 'chess-archive');
  }

  async function importPgn(e: Event) {
    importError = '';
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    const text = await file.text();
    const chunks = text.split(/\n\s*\n(?=\[Event )/).filter((c) => c.trim());
    let ok = 0;
    for (const chunk of chunks) {
      const c = new Chess();
      try {
        c.loadPgn(chunk);
      } catch {
        continue;
      }
      const h = c.getHeaders();
      const now = Date.now();
      await saveGame({
        id: crypto.randomUUID?.() ?? String(now + ok),
        mode: 'local',
        realm: REALMS[Math.floor(Math.random() * REALMS.length)].id,
        white: h.White ?? 'White',
        black: h.Black ?? 'Black',
        you: null,
        pgn: c.pgn(),
        fen: c.fen(),
        moves: c.history().length,
        result: (['1-0', '0-1', '1/2-1/2'].includes(h.Result) ? h.Result : '*') as GameRecord['result'],
        reason: 'imported',
        startedAt: now,
        updatedAt: now - ok,
      });
      ok++;
    }
    if (!ok) importError = 'No readable games found in that file.';
    (e.currentTarget as HTMLInputElement).value = '';
    refresh();
  }

  const stage = $derived(cultivation.stage);
  const slain = $derived(trials.demons.length - trials.waiting.length);
  const matchOn = $derived(game.active && !game.over && !game.study);

  function faceToday() {
    const d = trials.today();
    if (d) trials.face(d);
  }

  // Openings you've played, grouped by family, with how they went. Worked out only when opened.
  let showOpenings = $state(false);
  const openings = $derived.by(() => {
    if (!showOpenings) return [];
    const by = new Map<string, { name: string; played: number; win: number; draw: number; loss: number; w: number; b: number }>();
    for (const g of games) {
      const o = outcome(g);
      if (!g.you || o === 'live' || o === 'done') continue;
      const c = new Chess();
      try { c.loadPgn(g.pgn); } catch { continue; }
      const name = openingOf(c.history({ verbose: true })).name;
      if (!name) continue;
      const family = name.split(':')[0];
      const row = by.get(family) ?? { name: family, played: 0, win: 0, draw: 0, loss: 0, w: 0, b: 0 };
      row.played++;
      row[o]++;
      row[g.you]++;
      by.set(family, row);
    }
    return [...by.values()].sort((a, b) => b.played - a.played).slice(0, 10);
  });

  const fmt = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const modeLabel = { ai: 'vs Sect', local: 'Same device', lan: 'LAN' };
</script>

<section>
  <div class="cult" title="Cultivation {cultivation.rating} (peak {cultivation.peak})">
    <span class="hz">{stage.hz}</span>
    <div>
      <b>{stage.name}</b> <small>{stage.layerName}</small>
      <div class="bar"><span style:width="{stage.progress * 100}%"></span></div>
      <small>{cultivation.games ? `Cultivation ${cultivation.rating} · ${cultivation.games} rated ${cultivation.games === 1 ? 'duel' : 'duels'} against the sect` : 'Duel the sect to begin cultivating.'} · fairest foe: {LEVEL_NAMES[cultivation.fairLevel - 1]}</small>
      <em>{stage.note}</em>
    </div>
  </div>

  <div class="demons">
    <span class="hz">心魔</span>
    <div>
      <b>Heart Demons</b>
      <small>{trials.demons.length ? `${trials.waiting.length} await · ${slain} slain` : 'Born from your mistakes when you review a game.'}</small>
    </div>
    <button class="primary" onclick={faceToday} disabled={!trials.waiting.length || matchOn} title={matchOn ? 'Finish your match first' : 'A position from your own games where a better move was missed'}>
      Face today's
    </button>
  </div>

  <div class="stats">
    <div><b>{stats.played}</b><span>Duels</span></div>
    <div class="win"><b>{stats.win}</b><span>Victories</span></div>
    <div class="loss"><b>{stats.loss}</b><span>Defeats</span></div>
    <div><b>{stats.draw}</b><span>Draws</span></div>
  </div>

  <div class="realms" title="Victories per realm">
    {#each REALMS as r}
      <div class="badge" class:conquered={stats.realmWins[r.id]} style:--c={r.vars['--accent']} title="{r.name} ({r.hanzi} — {r.meaning}): {stats.realmWins[r.id] ?? 0} victories">
        <span class="hz">{r.hanzi}</span>
        <small>{stats.realmWins[r.id] ?? 0}</small>
      </div>
    {/each}
  </div>

  <details class="openings" bind:open={showOpenings}>
    <summary>Openings you have walked</summary>
    {#if openings.length}
      <table>
        <thead><tr><th></th><th title="Games">#</th><th title="Wins">W</th><th title="Draws">D</th><th title="Losses">L</th></tr></thead>
        <tbody>
          {#each openings as o}
            <tr><td>{o.name}<small> · {o.w ? `${o.w} as White` : ''}{o.w && o.b ? ', ' : ''}{o.b ? `${o.b} as Black` : ''}</small></td><td>{o.played}</td><td class="win">{o.win}</td><td>{o.draw}</td><td class="loss">{o.loss}</td></tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <p class="note">Finish a few games and their openings gather here.</p>
    {/if}
  </details>

  <ul class="list">
    {#each games as g (g.id)}
      {@const o = outcome(g)}
      <li data-o={o}>
        <button class="main" onclick={() => open(g)}>
          <span class="chip" style:--c={realmById(g.realm).vars['--accent']} title={realmById(g.realm).name}>{realmById(g.realm).hanzi}</span>
          <span class="who">{g.white} <i>vs</i> {g.black}</span>
          <span class="meta">{modeLabel[g.mode]} · {Math.ceil(g.moves / 2)} moves · {fmt(g.updatedAt)}</span>
          <span class="res">{o === 'live' ? (g.mode === 'lan' ? 'unfinished' : 'resume') : g.result}</span>
        </button>
        <div class="acts">
          {#if g.moves >= 2}<button class="hz-btn" onclick={() => reviewGame(g)} aria-label="Review with the Elder" title="Review with the Elder">鉴</button>{/if}
          <button onclick={() => downloadPgn(g.pgn, g.id)} aria-label="Download PGN" title="Download PGN">⤓</button>
          <button onclick={() => remove(g)} aria-label="Delete" title="Delete">✕</button>
        </div>
      </li>
    {:else}
      <li class="empty">Your scroll of battles is empty.</li>
    {/each}
  </ul>

  <div class="row">
    <label class="btn">Import PGN<input type="file" accept=".pgn,text/plain" onchange={importPgn} hidden /></label>
    <button onclick={exportAll} disabled={!games.length}>Export all</button>
    <button onclick={wipe} disabled={!games.length}>Clear</button>
  </div>
  {#if importError}<p class="error">{importError}</p>{/if}
  <p class="note">Games are stored only in this browser (IndexedDB).</p>
</section>

<style>
  section { display: grid; gap: 0.7rem; }
  .cult, .demons { display: flex; align-items: center; gap: 0.7rem; padding: 0.55rem 0.7rem; border-radius: 10px; border: 1px solid var(--panel-border); background: color-mix(in srgb, var(--accent) 7%, transparent); }
  .cult > div, .demons > div { display: grid; gap: 0.15rem; flex: 1; min-width: 0; }
  .cult .hz, .demons .hz { font-family: 'Ma Shan Zheng', serif; font-size: 2rem; line-height: 1; color: var(--accent); text-shadow: 0 0 14px var(--glow); }
  .demons .hz { font-size: 1.5rem; color: #c86be0; text-shadow: 0 0 10px rgba(200, 107, 224, 0.5); }
  .cult b, .demons b { font: 700 0.95rem 'Cinzel', serif; }
  .cult small, .demons small { color: var(--muted); font-size: 0.74rem; }
  .cult em { font-size: 0.74rem; color: var(--muted); }
  .bar { height: 5px; border-radius: 3px; background: color-mix(in srgb, var(--ink) 12%, transparent); overflow: hidden; }
  .bar span { display: block; height: 100%; background: var(--accent); }
  .openings summary { cursor: pointer; color: var(--muted); font-size: 0.85rem; }
  .openings table { width: 100%; border-collapse: collapse; font-size: 0.8rem; margin-top: 0.4rem; }
  .openings th { color: var(--muted); font-weight: 600; text-align: right; }
  .openings td { padding: 0.15rem 0; }
  .openings td + td { text-align: right; width: 1.8rem; font-variant-numeric: tabular-nums; }
  .openings small { color: var(--muted); }
  .openings .win { color: #4ade80; }
  .openings .loss { color: #f87171; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.4rem; text-align: center; }
  .stats div { background: color-mix(in srgb, var(--ink) 6%, transparent); border-radius: 8px; padding: 0.4rem 0; }
  .stats b { display: block; font-size: 1.3rem; font-family: 'Cinzel', serif; }
  .stats span { font-size: 0.7rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; }
  .stats .win b { color: #4ade80; }
  .stats .loss b { color: #f87171; }
  .realms { display: grid; grid-template-columns: repeat(7, 1fr); gap: 0.3rem; }
  .badge {
    display: grid;
    place-items: center;
    padding: 0.3rem 0;
    border-radius: 8px;
    border: 1px solid var(--panel-border);
    opacity: 0.45;
    filter: grayscale(1);
  }
  .badge.conquered { opacity: 1; filter: none; border-color: var(--c); box-shadow: 0 0 12px -4px var(--c); }
  .badge .hz { font-family: 'Ma Shan Zheng', serif; font-size: 1.05rem; color: var(--c); line-height: 1.1; white-space: nowrap; }
  .badge small { font-size: 0.7rem; color: var(--muted); }
  .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.35rem; max-height: 42vh; overflow-y: auto; }
  .list li { display: flex; align-items: stretch; border-radius: 8px; background: color-mix(in srgb, var(--ink) 5%, transparent); border-left: 3px solid var(--muted); }
  .list li[data-o='win'] { border-left-color: #4ade80; }
  .list li[data-o='loss'] { border-left-color: #f87171; }
  .list li[data-o='live'] { border-left-color: var(--accent); }
  .list .main {
    all: unset;
    flex: 1;
    cursor: pointer;
    display: grid;
    grid-template-columns: auto 1fr auto;
    grid-template-areas: 'chip who res' 'chip meta res';
    column-gap: 0.5rem;
    padding: 0.45rem 0.5rem;
    min-width: 0;
  }
  .list .main:hover { background: color-mix(in srgb, var(--accent) 12%, transparent); }
  .chip { grid-area: chip; align-self: center; font-family: 'Ma Shan Zheng', serif; color: var(--c); font-size: 1.1rem; }
  .who { grid-area: who; font-weight: 600; font-size: 0.88rem; overflow-wrap: anywhere; }
  .who i { color: var(--muted); font-weight: 400; }
  .meta { grid-area: meta; font-size: 0.72rem; color: var(--muted); }
  .res { grid-area: res; align-self: center; font-weight: 700; font-size: 0.8rem; }
  .acts { display: flex; }
  .acts button { all: unset; cursor: pointer; padding: 0 0.45rem; color: var(--muted); }
  .acts button:hover { color: var(--ink); }
  .acts .hz-btn { font-family: 'Ma Shan Zheng', serif; font-size: 1.15rem; color: var(--accent); }
  .empty { padding: 1rem; color: var(--muted); text-align: center; border: 0 !important; background: none !important; }
  .row { display: flex; gap: 0.4rem; }
  .row > * { flex: 1; }
  .note { margin: 0; font-size: 0.75rem; color: var(--muted); text-align: center; }
  .error { color: #f87171; margin: 0; font-size: 0.85rem; }
</style>
