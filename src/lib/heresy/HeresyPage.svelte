<script lang="ts">
  // 邪魔外道: the heterodox paths, reached from a hidden mark in Settings. Six anarchy
  // variants on their own rules engine; matches here are not saved to the archive.
  import type { Move } from 'chess.js';
  import { onDestroy } from 'svelte';
  import Board from '../Board.svelte';
  import { play, type Fx } from '../fx';
  import { keepAwake } from '../screen';
  import { settings } from '../settings.svelte';
  import type { HeresyRequest, HeresyResponse } from './heresy.worker';
  import { PATHS, type Faction, type Path } from './paths';
  import { inCheck, kingSq, legalMoves, makeMove, ORTHODOX_BACK, other, outcome, RULES, san, shuffledBack, sqName, startPos, toFen, type Color, type Kind, type Outcome, type Pos, type VMove } from './rules';

  let { onexit }: { onexit: () => void } = $props();

  const FACTIONS: Record<Faction, { title: string; hanzi: string; blurb: string }> = {
    unorthodox: { title: 'Unorthodox Sects', hanzi: '邪派', blurb: 'They bow to no alliance and keep scriptures the orthodox sects have burned.' },
    demonic: { title: 'Demonic Cult', hanzi: '魔教', blurb: 'Below even the unorthodox lie the cults of the Heavenly Demon. Their rules devour their own.' },
  };

  let path = $state<Path | null>(null);
  let stage = $state<'choose' | 'setup' | 'play'>('choose');
  let mode = $state<'ai' | 'local'>('ai');
  let colorPick = $state<Color | 'random'>('w');
  let level = $state(2);

  let pos = $state.raw<Pos>(startPos(RULES.holyhell));
  let hist = $state.raw<{ before: Pos; move: VMove; san: string }[]>([]);
  let you = $state<Color | null>('w');
  let orientation = $state<Color>('w');
  let result = $state<Outcome | null>(null);
  let thinking = $state(false);
  let cry = $state<{ text: string; key: number } | null>(null);
  let shownResult = $state(false);
  /** Back rank for the next match; only the Thousand Faces Cult changes it. */
  let formation = $state.raw<Kind[]>(ORTHODOX_BACK);
  const NAME: Record<Kind, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

  const rules = $derived(path ? RULES[path.id] : RULES.holyhell);
  const moves = $derived(legalMoves(pos, rules));
  const fen = $derived(toFen(pos));
  const last = $derived(hist.at(-1));
  const palette = $derived(path?.faction ?? 'unorthodox');

  $effect(() => keepAwake(settings.keepAwake && stage === 'play' && !result));

  let worker: Worker | null = null;
  let seq = 0;
  function ai() {
    worker ??= new Worker(new URL('./heresy.worker.ts', import.meta.url), { type: 'module' });
    return worker;
  }
  onDestroy(() => { worker?.terminate(); keepAwake(false); });

  function choose(p: Path) {
    path = p;
    formation = RULES[p.id].shuffle ? shuffledBack() : ORTHODOX_BACK;
    stage = 'setup';
  }

  function begin() {
    if (!path) return;
    worker?.terminate();
    worker = null;
    seq++;
    // "Again" on the Thousand Faces deals a fresh formation; the setup one is used first.
    if (rules.shuffle && stage === 'play') formation = shuffledBack();
    pos = startPos(rules, formation);
    hist = [];
    result = null;
    shownResult = false;
    thinking = false;
    const c = colorPick === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : colorPick;
    you = mode === 'ai' ? c : null;
    orientation = you ?? 'w';
    stage = 'play';
    fx('start');
    if (rules.shuffle) shout(path.cry);
    maybeAi();
  }

  function fx(k: Fx) {
    play(k, { sound: settings.sound, haptics: settings.haptics });
  }

  function shout(text: string) {
    cry = { text, key: Date.now() };
    const k = cry.key;
    setTimeout(() => { if (cry?.key === k) cry = null; }, 1600);
  }

  function apply(m: VMove) {
    const before = pos;
    const s = san(before, m, rules, moves);
    pos = makeMove(before, m, rules);
    hist = [...hist, { before, move: m, san: s }];

    // Each path has its signature moment.
    const p = path!;
    if (p.id === 'holyhell' && m.ep) shout(p.cry);
    else if (p.id === 'vatican' && m.vatican) shout(p.cry);
    else if (p.id === 'bongcloud' && m.piece === 'k' && Math.max(Math.abs((m.to >> 3) - (m.from >> 3)), Math.abs((m.to & 7) - (m.from & 7))) === 2) shout(p.cry);
    else if (p.id === 'threecheck' && pos.checks[m.color] > before.checks[m.color]) shout(`${p.cry} ${pos.checks[m.color]} of 3`);
    else if (p.id === 'atomic' && m.captured) shout(p.cry);
    else if (p.id === 'antichess' && m.captured && Math.random() < 0.35) shout(p.cry);
    else if (p.id === 'devour' && m.captured && m.piece !== 'k' && m.captured !== m.piece) shout(`${p.cry} The ${NAME[m.piece]} becomes a ${NAME[m.captured]}.`);

    result = outcome(pos, rules);
    if (result) {
      shownResult = true;
      const won = result.winner && you ? result.winner === you : null;
      fx(result.winner === null ? 'draw' : won === false ? 'lose' : 'win');
    } else if (m.captured) fx('capture');
    else if (m.castle) fx('castle');
    else if (inCheck(pos, pos.turn, rules)) fx('check');
    else fx('move');
    maybeAi();
  }

  function maybeAi() {
    if (result || mode !== 'ai' || pos.turn === you || !path) return;
    thinking = true;
    const id = ++seq;
    const req: HeresyRequest = { id, pos: $state.snapshot(pos) as Pos, variant: path.id, level };
    const w = ai();
    const started = performance.now();
    w.onmessage = (e: MessageEvent<HeresyResponse>) => {
      if (e.data.id !== seq) return;
      // A short pause so instant replies don't feel mechanical.
      const wait = Math.max(0, 350 - (performance.now() - started));
      setTimeout(() => {
        if (id !== seq) return;
        thinking = false;
        const r = e.data.move;
        const m = r && moves.find((x) => x.from === r.from && x.to === r.to && x.promotion === r.promotion && !!x.vatican === !!r.vatican);
        if (m) apply(m);
      }, wait);
    };
    w.postMessage(req);
  }

  const movable = $derived(stage === 'play' && !result && !thinking && (mode === 'local' || pos.turn === you) ? pos.turn : null);

  function legalFrom(sq: string): Move[] {
    return moves
      .filter((m) => sqName(m.from) === sq)
      .map((m) => ({ from: sqName(m.from), to: sqName(m.to), promotion: m.promotion, color: m.color, isEnPassant: () => !!m.ep }) as unknown as Move);
  }

  function onmove(from: string, to: string, promotion?: string) {
    const m = moves.find((x) => sqName(x.from) === from && sqName(x.to) === to && (x.promotion ?? '') === (promotion ?? (x.promotion ? 'q' : '')));
    if (!m) return false;
    apply(m);
    return true;
  }

  function undo() {
    if (!hist.length || thinking) return;
    seq++;
    // Against the sect, take back your move and its answer.
    const back = mode === 'ai' && hist.length >= 2 && hist.at(-1)!.move.color !== you ? 2 : 1;
    const keep = hist.slice(0, hist.length - back);
    pos = hist[hist.length - back].before;
    hist = keep;
    result = null;
    shownResult = false;
    maybeAi();
  }

  function resign() {
    if (result || !hist.length) return;
    const loser = mode === 'ai' ? you! : pos.turn;
    result = { winner: other(loser), reason: 'resignation' };
    shownResult = true;
    fx('lose');
  }

  const checkSq = $derived(inCheck(pos, pos.turn, rules) ? sqName(kingSq(pos, pos.turn)) : null);

  const pairs = $derived.by(() => {
    const out: { n: number; w?: string; b?: string }[] = [];
    hist.forEach((h, i) => {
      if (i % 2 === 0) out.push({ n: i / 2 + 1, w: h.san });
      else out[out.length - 1].b = h.san;
    });
    return out;
  });

  function nameFor(c: Color) {
    if (mode === 'local') return c === 'w' ? 'White' : 'Black';
    return c === you ? settings.name || 'You' : path!.foes[level - 1];
  }

  const verdict = $derived.by(() => {
    if (!result) return null;
    if (result.winner === null) return { hz: '和', title: 'Honours even' };
    if (you) return result.winner === you ? { hz: '勝', title: 'Victory' } : { hz: '敗', title: 'Defeat' };
    return { hz: '終', title: result.winner === 'w' ? 'White prevails' : 'Black prevails' };
  });
</script>

<div class="heresy {palette}">
  <div class="mist" aria-hidden="true"></div>

  <header>
    <button class="back" onclick={() => (stage === 'choose' ? onexit() : (stage = 'choose'))}>
      {stage === 'choose' ? '↩ Return to the orthodox path' : '↩ All paths'}
    </button>
    <div class="title">
      <span class="hz" title="邪魔外道: heretical paths and demonic ways">邪魔外道</span>
      <h1>The Heterodox Paths</h1>
    </div>
  </header>

  {#if stage === 'choose'}
    <p class="lede">Beyond the Nine Peaks the rules bend. Four unorthodox sects and four demonic cults keep scriptures of their own. Choose which to learn.</p>
    {#each ['unorthodox', 'demonic'] as const as f}
      <section class="faction {f}">
        <h2><span class="hz">{FACTIONS[f].hanzi}</span> {FACTIONS[f].title}</h2>
        <p class="blurb">{FACTIONS[f].blurb}</p>
        <div class="cards">
          {#each PATHS.filter((p) => p.faction === f) as p}
            <button class="card" onclick={() => choose(p)}>
              <span class="hz" title="{p.hanzi}: {p.meaning}">{p.hanzi}</span>
              <b>{p.name}</b>
              <small>{p.motto}</small>
            </button>
          {/each}
        </div>
      </section>
    {/each}
  {:else if path}
    <div class="arena">
      <div class="stage">
        {#if stage === 'play'}
          {@const top = orientation === 'w' ? 'b' : 'w'}
          {#snippet bar(c: Color)}
            <div class="player" class:active={!result && pos.turn === c}>
              <span class="swatch" class:black={c === 'b'}></span>
              <span class="pname">{nameFor(c)}</span>
              {#if thinking && pos.turn === c}<span class="think">plotting…</span>{/if}
              {#if path!.id === 'threecheck'}
                <span class="palms" title="Checks landed">{#each [0, 1, 2] as i}<i class:hit={pos.checks[c] > i}>掌</i>{/each}</span>
              {/if}
            </div>
          {/snippet}
          {@render bar(top)}
          <div class="board-wrap">
            <Board
              {fen}
              {orientation}
              {movable}
              lastMove={last ? { from: sqName(last.move.from), to: sqName(last.move.to) } : null}
              check={checkSq}
              coords={settings.coords}
              outlines={settings.outlines}
              pieceSet={settings.pieceSet}
              {legalFrom}
              {onmove}
            />
            {#if cry}{#key cry.key}<div class="cry">{cry.text}</div>{/key}{/if}
          </div>
          {@render bar(orientation)}
          <div class="controls">
            <button onclick={undo} disabled={!hist.length || thinking}>↶ Undo</button>
            <button onclick={() => (orientation = other(orientation))}>⇅ Flip</button>
            <button onclick={resign} disabled={!!result || !hist.length}>⚑ Resign</button>
            <button onclick={begin}>↻ Again</button>
          </div>
        {:else if rules.shuffle}
          <!-- The formation to be played, so it can be rerolled before starting. -->
          <Board fen={toFen(startPos(rules, formation))} orientation={colorPick === 'b' ? 'b' : 'w'} movable={null} lastMove={null} check={null} coords={settings.coords} outlines={settings.outlines} pieceSet={settings.pieceSet} legalFrom={() => []} onmove={() => false} />
          <button onclick={() => (formation = shuffledBack())}>🎲 Reroll the formation</button>
        {:else}
          <div class="preview">
            <span class="hz big">{path.hanzi}</span>
            <small>{path.meaning}</small>
          </div>
        {/if}
      </div>

      <aside class="side">
        <h2><span class="hz">{path.hanzi}</span> {path.name}</h2>
        <p class="motto">{path.motto}</p>
        <ol class="rules">
          {#each path.rules as r}<li>{r}</li>{/each}
        </ol>

        {#if stage === 'setup'}
          <div class="setup">
            <div class="seg">
              <button class:on={mode === 'ai'} onclick={() => (mode = 'ai')}>Vs the sect</button>
              <button class:on={mode === 'local'} onclick={() => (mode = 'local')}>Same device</button>
            </div>
            {#if mode === 'ai'}
              <div class="seg">
                {#each [['w', 'White'], ['random', 'Random'], ['b', 'Black']] as const as [v, l]}
                  <button class:on={colorPick === v} onclick={() => (colorPick = v)}>{l}</button>
                {/each}
              </div>
              <label class="level">
                <span>Opponent <b>{path.foes[level - 1]}</b> · {level}/4</span>
                <input type="range" min="1" max="4" bind:value={level} />
              </label>
            {/if}
            <button class="primary" onclick={begin}>Enter the {path.faction === 'demonic' ? 'cult' : 'sect'}</button>
          </div>
        {:else}
          <ol class="moves">
            {#each pairs as p}
              <li><span class="n">{p.n}.</span><span>{p.w}</span><span>{p.b ?? ''}</span></li>
            {:else}
              <li class="empty">The first move is yours to defile.</li>
            {/each}
          </ol>
          {#if result}<p class="res">{result.winner === null ? '½-½' : result.winner === 'w' ? '1-0' : '0-1'} · {result.reason}</p>{/if}
          <small class="muted">Matches on the heterodox paths are not written into the archive.</small>
        {/if}
      </aside>
    </div>
  {/if}

  {#if result && shownResult && verdict}
    <div class="over" role="dialog" aria-label="Match result">
      <div class="result-card">
        <span class="hz">{verdict.hz}</span>
        <h2>{verdict.title}</h2>
        <p>{result.reason}</p>
        <div class="row">
          <button class="primary" onclick={begin}>Again</button>
          <button onclick={() => (shownResult = false)}>Look at the board</button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .heresy {
    --bg1: #070a08; --bg2: #132019; --bg3: #2c4634;
    --ink: #e4eee2; --muted: #93a896; --accent: #8fdc6a; --accent-ink: #0b1a07;
    --panel: rgba(12, 20, 15, 0.7); --panel-border: rgba(143, 220, 106, 0.22);
    --light: #b8c3a6; --dark: #4b5c46; --coord-light: #4b5c46; --coord-dark: #b8c3a6;
    --hl: rgba(143, 220, 106, 0.5); --last: rgba(205, 232, 90, 0.4); --check: rgba(255, 60, 60, 0.8);
    --glow: rgba(143, 220, 106, 0.35);
    position: fixed;
    inset: 0;
    z-index: 20;
    overflow-y: auto;
    color: var(--ink);
    background: radial-gradient(ellipse at 50% 0%, var(--bg3), var(--bg2) 40%, var(--bg1) 85%);
    padding: 0 16px 2rem;
  }
  .heresy.demonic {
    --bg1: #080102; --bg2: #250407; --bg3: #66090f;
    --ink: #ffe7e2; --muted: #c99a92; --accent: #ff4a3d; --accent-ink: #1a0202;
    --panel: rgba(24, 4, 6, 0.72); --panel-border: rgba(255, 70, 60, 0.26);
    --light: #caa69b; --dark: #5c1b1e; --coord-light: #5c1b1e; --coord-dark: #caa69b;
    --hl: rgba(255, 70, 50, 0.55); --last: rgba(255, 150, 60, 0.42); --check: rgba(255, 30, 30, 0.9);
    --glow: rgba(255, 40, 40, 0.45);
  }
  .mist {
    position: fixed;
    inset: -20%;
    pointer-events: none;
    background:
      radial-gradient(circle at 20% 30%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 40%),
      radial-gradient(circle at 80% 70%, color-mix(in srgb, var(--accent) 8%, transparent), transparent 45%);
    animation: drift 18s ease-in-out infinite alternate;
  }
  .hz { font-family: 'Ma Shan Zheng', serif; color: var(--accent); }
  header { position: relative; display: grid; justify-items: center; gap: 0.4rem; padding: 1rem 0 0.5rem; max-width: 1180px; margin: 0 auto; }
  .back { justify-self: start; background: var(--panel); border: 1px solid var(--panel-border); color: var(--ink); }
  .title { display: grid; justify-items: center; }
  .title .hz { font-size: clamp(2.6rem, 9vw, 4.4rem); line-height: 1; text-shadow: 0 0 30px var(--glow); letter-spacing: 0.1em; }
  h1 { margin: 0.2rem 0 0; font: 700 clamp(1.1rem, 3.5vw, 1.6rem) 'Cinzel', serif; letter-spacing: 0.12em; }
  .lede { position: relative; max-width: 640px; margin: 0.4rem auto 1.4rem; text-align: center; color: var(--muted); }
  .faction { position: relative; max-width: 1000px; margin: 0 auto 1.6rem; }
  .faction h2 { font: 700 1.15rem 'Cinzel', serif; margin: 0; display: flex; align-items: center; gap: 0.5rem; }
  .faction h2 .hz { font-size: 1.8rem; }
  .faction.demonic { --accent: #ff4a3d; --panel-border: rgba(255, 70, 60, 0.3); --glow: rgba(255, 40, 40, 0.4); }
  .blurb { margin: 0.2rem 0 0.8rem; color: var(--muted); font-size: 0.9rem; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 0.7rem; }
  .card {
    all: unset;
    cursor: pointer;
    display: grid;
    gap: 0.3rem;
    padding: 1rem;
    border-radius: 14px;
    background: var(--panel);
    border: 1px solid var(--panel-border);
    backdrop-filter: blur(8px);
    transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
  }
  .card:hover, .card:focus-visible { transform: translateY(-3px); border-color: var(--accent); box-shadow: 0 10px 40px -12px var(--glow); }
  .card .hz { font-size: 2.6rem; line-height: 1; }
  .card b { font: 700 1rem 'Cinzel', serif; }
  .card small { color: var(--muted); }

  .arena { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 1.5rem; max-width: 1180px; margin: 0.5rem auto 0; align-items: start; }
  .stage { display: grid; gap: 0.5rem; width: 100%; max-width: min(100%, calc(100dvh - 200px)); min-width: 260px; justify-self: center; }
  .board-wrap { position: relative; }
  .preview { aspect-ratio: 1; display: grid; place-content: center; justify-items: center; border-radius: 10px; background: var(--panel); border: 1px solid var(--panel-border); }
  .preview .big { font-size: min(30vw, 10rem); line-height: 1; text-shadow: 0 0 40px var(--glow); }
  .preview small { color: var(--muted); letter-spacing: 0.3em; text-transform: uppercase; }
  .player { display: flex; align-items: center; gap: 0.5rem; padding: 0.35rem 0.6rem; border-radius: 8px; background: var(--panel); border: 1px solid var(--panel-border); min-height: 2.3rem; }
  .player.active { border-color: var(--accent); box-shadow: 0 0 16px -6px var(--accent); }
  .swatch { width: 14px; height: 14px; border-radius: 50%; background: #f5f2ea; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4); flex: none; }
  .swatch.black { background: #1b1b1f; box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.35); }
  .pname { font-weight: 600; }
  .think { font-size: 0.78rem; color: var(--accent); font-style: italic; }
  .palms { margin-left: auto; display: flex; gap: 0.15rem; }
  .palms i { font-family: 'Ma Shan Zheng', serif; font-style: normal; font-size: 1.1rem; color: color-mix(in srgb, var(--muted) 45%, transparent); }
  .palms i.hit { color: var(--accent); text-shadow: 0 0 10px var(--glow); }
  .controls { display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .controls button { flex: 1 1 auto; }
  .cry {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    pointer-events: none;
    z-index: 20;
    font: 700 clamp(1.6rem, 7vw, 3.2rem) 'Cinzel', serif;
    color: var(--accent);
    text-shadow: 0 0 24px var(--glow), 0 3px 12px rgba(0, 0, 0, 0.8);
    animation: cry 1.6s ease forwards;
    text-align: center;
  }

  .side { position: relative; display: grid; gap: 0.7rem; padding: 1rem; border-radius: 14px; background: var(--panel); border: 1px solid var(--panel-border); backdrop-filter: blur(12px); }
  .side h2 { margin: 0; font: 700 1.1rem 'Cinzel', serif; display: flex; align-items: center; gap: 0.5rem; }
  .side h2 .hz { font-size: 1.8rem; }
  .motto { margin: 0; color: var(--muted); font-style: italic; }
  .rules { margin: 0; padding-left: 1.2rem; display: grid; gap: 0.35rem; font-size: 0.9rem; }
  .setup { display: grid; gap: 0.6rem; }
  .seg { display: flex; gap: 0.3rem; }
  .seg button { flex: 1; background: transparent; border: 1px solid var(--panel-border); color: var(--ink); }
  .seg button.on { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
  .level { display: grid; gap: 0.3rem; font-size: 0.85rem; color: var(--muted); }
  .level b { color: var(--ink); }
  .level input { accent-color: var(--accent); }
  .moves { list-style: none; margin: 0; padding: 0; max-height: 34vh; overflow-y: auto; font-variant-numeric: tabular-nums; }
  .moves li { display: grid; grid-template-columns: 2.4rem 1fr 1fr; padding: 0.2rem 0; font-weight: 600; }
  .moves li:nth-child(odd) { background: color-mix(in srgb, var(--ink) 5%, transparent); }
  .moves .n { color: var(--muted); font-size: 0.8rem; padding-left: 0.4rem; font-weight: 400; }
  .moves .empty { display: block; color: var(--muted); text-align: center; padding: 0.5rem; font-weight: 400; }
  .res { margin: 0; font-weight: 700; text-transform: capitalize; }
  .muted { color: var(--muted); font-size: 0.75rem; }

  .over { position: fixed; inset: 0; display: grid; place-items: center; background: rgba(0, 0, 0, 0.5); z-index: 50; padding: 16px; animation: fade 0.4s; }
  .result-card { text-align: center; padding: 1.6rem 2rem; border-radius: 16px; background: var(--panel); border: 1px solid var(--panel-border); backdrop-filter: blur(16px); box-shadow: 0 20px 80px -10px var(--glow); }
  .result-card .hz { font-size: 4.5rem; line-height: 1; text-shadow: 0 0 30px var(--glow); }
  .result-card h2 { margin: 0.3rem 0 0.2rem; font: 700 1.6rem 'Cinzel', serif; }
  .result-card p { margin: 0 0 1rem; color: var(--muted); text-transform: capitalize; }
  .result-card .row { display: flex; gap: 0.5rem; justify-content: center; }

  @keyframes drift { to { transform: translate(4%, 3%) scale(1.05); } }
  @keyframes fade { from { opacity: 0; } }
  @keyframes cry {
    0% { opacity: 0; transform: scale(1.3); filter: blur(4px); }
    20% { opacity: 1; transform: scale(1); filter: blur(0); }
    75% { opacity: 1; }
    100% { opacity: 0; transform: scale(0.95); }
  }
  @media (max-width: 960px) {
    .arena { grid-template-columns: 1fr; }
    .stage { max-width: min(100%, 640px); min-width: 0; }
    .side { max-width: 640px; width: 100%; justify-self: center; box-sizing: border-box; }
  }
</style>
