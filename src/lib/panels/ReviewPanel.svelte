<script lang="ts">
  // The Elder's Mirror: graded moves, an advantage graph and advice from a finished game.
  import { scoreText } from '../engine';
  import { game } from '../game.svelte';
  import { FULL_GLOSSARY, TERMS } from '../glossary';
  import Rich from '../Rich.svelte';
  import { review, VERDICTS, type PlyReview, type Verdict } from '../review.svelte';
  import { settings } from '../settings.svelte';

  const used = $derived.by(() => {
    const ids = new Set<string>(['accuracy', 'evaluation']);
    for (const t of [...review.tips.map((t) => t.text), ...review.plies.map((p) => p.comment)])
      for (const m of t.matchAll(/\[\[(\w+)/g)) if (TERMS[m[1]]) ids.add(m[1]);
    return [...ids].map((id) => ({ id, ...TERMS[id] }));
  });

  const current = $derived(game.viewPly ?? game.history.length);
  // Halted before a turning point, the note is about the move that is coming.
  const shown = $derived<PlyReview | undefined>(review.halted ? review.plies[review.halt! - 1] : review.plies[current - 1]);

  const counts = $derived.by(() => {
    const order: Verdict[] = ['brilliant', 'book', 'best', 'excellent', 'good', 'forced', 'inaccuracy', 'mistake', 'miss', 'blunder'];
    return order
      .map((v) => ({ v, w: review.plies.filter((p) => p.verdict === v && p.color === 'w').length, b: review.plies.filter((p) => p.verdict === v && p.color === 'b').length }))
      .filter((r) => r.w || r.b);
  });

  // Advantage graph: x = ply, y = white's winning chance.
  const W = 300;
  const H = 70;
  const chance = (cp: number) => (Math.abs(cp) > 99000 ? (cp > 0 ? 100 : 0) : 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * Math.max(-2000, Math.min(2000, cp)))) - 1));
  const pts = $derived(review.evals.map((e, i) => [(i / Math.max(1, review.evals.length - 1)) * W, H - (chance(e) / 100) * H] as const));
  const area = $derived(pts.length ? `M0 ${H} ` + pts.map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join(' ') + ` L${W} ${H} Z` : '');

  function go(ply: number) {
    if (review.walking) return review.stepTo(ply);
    game.hint = null;
    game.viewPly = ply === game.history.length ? null : ply;
  }

  function graphClick(e: MouseEvent) {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    go(Math.round(((e.clientX - r.left) / r.width) * (review.evals.length - 1)));
  }

  /** Show the engine's choice for the move just reviewed, on the position before it. */
  function showBest(p: PlyReview) {
    review.haltAt(p.ply);
  }

  const pairs = $derived.by(() => {
    const out: { n: number; w?: PlyReview; b?: PlyReview }[] = [];
    review.plies.forEach((p, i) => {
      if (i % 2 === 0) out.push({ n: i / 2 + 1, w: p });
      else out[out.length - 1].b = p;
    });
    return out;
  });
</script>

{#snippet rich(text: string)}<Rich {text} />{/snippet}

{#snippet mark(p: PlyReview | undefined)}
  {#if p}
    {@const v = VERDICTS[p.verdict]}
    <button class="mv" class:cur={current === p.ply} onclick={() => go(p.ply)} title="{v.label} ({v.plain})">
      {p.san}{#if !['best', 'excellent', 'good'].includes(p.verdict)}<i style:color={v.color}>{v.symbol}</i>{/if}
    </button>
  {/if}
{/snippet}

<section class="review">
  <header>
    <span class="hz" title="鉴 — Mirror (review)">鉴</span>
    <div><b>The Elder's Mirror</b><small>Every move weighed against the Elder's own.</small></div>
    <button class="x" onclick={() => review.close()} title="Back to the move list">✕</button>
  </header>
  {#if review.status === 'done' && !review.walking}
    <button class="primary" onclick={() => review.walk()}>▶ Walk through it on the board</button>
  {/if}

  {#if review.status === 'running'}
    <p class="muted">The Elder studies the game… {Math.round(review.progress * 100)}%</p>
    <div class="progress"><span style:width="{review.progress * 100}%"></span></div>
    <button onclick={() => review.cancel()}>Stop</button>
  {:else if review.status === 'done'}
    {#if review.opening.name}
      <p class="opening"><span class="hz">卷</span> {review.opening.name} <small>· {@render rich(`${review.opening.plies} ${review.opening.plies === 1 ? 'move' : 'moves'} of [[book|book]] theory`)}</small></p>
    {/if}
    <div class="acc">
      {#each ['w', 'b'] as const as c}
        <div class:me={game.you === c}>
          <span class="swatch" class:black={c === 'b'}></span>
          <b>{Math.round(review.accuracy[c])}%</b>
          <small>{c === 'w' ? 'White' : 'Black'} · {@render rich('[[accuracy]]')}</small>
        </div>
      {/each}
    </div>

    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <svg class="graph" viewBox="0 0 {W} {H}" preserveAspectRatio="none" onclick={graphClick} aria-label="Advantage over the game">
      <rect width={W} height={H} class="dark" />
      <path d={area} class="light" />
      <line x1="0" x2={W} y1={H / 2} y2={H / 2} class="mid" />
      {#each review.plies as p}
        {#if p.verdict === 'blunder' || p.verdict === 'mistake' || p.verdict === 'miss'}
          <circle cx={pts[p.ply][0]} cy={pts[p.ply][1]} r="2.6" fill={VERDICTS[p.verdict].color} />
        {/if}
      {/each}
      {#if pts[current]}<line x1={pts[current][0]} x2={pts[current][0]} y1="0" y2={H} class="cur" />{/if}
    </svg>

    {#if shown}
      {@const v = VERDICTS[shown.verdict]}
      <div class="note" style:--tone={v.color}>
        <b>{Math.ceil(shown.ply / 2)}{shown.ply % 2 ? '.' : '…'} {shown.san} <span>{v.symbol} {v.label}</span> <small>({v.plain})</small></b>
        <p>{@render rich(shown.comment)}</p>
        <small class="muted">{@render rich('[[evaluation|Evaluation]]')} after the move: {scoreText(shown.color === 'w' ? shown.after : -shown.after)}</small>
        {#if shown.best}<button onclick={() => showBest(shown!)}>Show {shown.best.san} on the board</button>{/if}
      </div>
    {:else}
      <p class="muted">Pick a move to hear the Elder's verdict.</p>
    {/if}

    <ol class="moves">
      {#each pairs as p}
        <li><span class="n">{p.n}.</span>{@render mark(p.w)}{@render mark(p.b)}</li>
      {/each}
    </ol>

    <table class="counts">
      <thead><tr><th></th><th>White</th><th>Black</th></tr></thead>
      <tbody>
        {#each counts as r}
          {@const v = VERDICTS[r.v]}
          <tr><td><i style:color={v.color}>{v.symbol}</i> {v.label} <small>{v.plain}</small></td><td>{r.w || '·'}</td><td>{r.b || '·'}</td></tr>
        {/each}
      </tbody>
    </table>

    <h4 class="counsel">The Elder's counsel</h4>
    {#each review.tips as t}
      <div class="tip {t.tone}">
        <b>{t.title}{#if !game.you}<small> · {t.color === 'w' ? 'White' : 'Black'}</small>{/if}</b>
        <p>{@render rich(t.text)}</p>
      </div>
    {:else}
      <p class="muted">Nothing to scold. Play on, and the Elder will find something next time.</p>
    {/each}

    {#if settings.glossary}
      <details class="glossary">
        <summary>Glossary of terms used here</summary>
        <dl>
          {#each used as t}
            <dt>{t.word}</dt>
            <dd>{t.def} <a href={t.url} target="_blank" rel="noopener">Read more ↗</a></dd>
          {/each}
        </dl>
        <a href={FULL_GLOSSARY} target="_blank" rel="noopener">The full glossary of chess ↗</a>
      </details>
    {/if}
    <small class="muted">The Elder is this app's own engine, looking a few moves ahead. Treat its verdicts as a sparring partner's, not gospel.</small>
  {/if}
</section>

<style>
  .review { display: grid; gap: 0.6rem; }
  header { display: flex; align-items: center; gap: 0.6rem; }
  header div { display: grid; flex: 1; }
  header small, .muted { color: var(--muted); font-size: 0.78rem; }
  header .hz { font-family: 'Ma Shan Zheng', serif; font-size: 2rem; line-height: 1; color: var(--accent); }
  .x { padding: 0.2rem 0.5rem; }
  .muted { margin: 0; }
  .progress { height: 6px; border-radius: 3px; background: color-mix(in srgb, var(--ink) 12%, transparent); overflow: hidden; }
  .progress span { display: block; height: 100%; background: var(--accent); transition: width 0.3s; }
  .opening { margin: 0; font: 600 0.9rem 'Cinzel', serif; display: flex; align-items: baseline; gap: 0.35rem; flex-wrap: wrap; }
  .opening .hz { font-family: 'Ma Shan Zheng', serif; font-size: 1.1rem; color: #b59a6a; }
  .opening small { font: 400 0.75rem system-ui, sans-serif; color: var(--muted); }
  .acc { display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; }
  .acc div { display: grid; grid-template-columns: auto 1fr; align-items: center; column-gap: 0.4rem; padding: 0.4rem 0.6rem; border-radius: 8px; border: 1px solid var(--panel-border); }
  .acc div.me { border-color: var(--accent); }
  .acc b { font: 700 1.3rem 'Cinzel', serif; }
  .acc small { grid-column: 1 / -1; color: var(--muted); font-size: 0.72rem; }
  .swatch { width: 12px; height: 12px; border-radius: 50%; background: #f5f2ea; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4); }
  .swatch.black { background: #1b1b1f; box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.35); }
  .graph { width: 100%; height: 70px; border-radius: 6px; cursor: pointer; display: block; }
  .graph .dark { fill: #2a2622; }
  .graph .light { fill: #ece7dc; }
  .graph .mid { stroke: rgba(128, 128, 128, 0.6); stroke-width: 0.6; }
  .graph .cur { stroke: var(--accent); stroke-width: 1.5; }
  .note { border-left: 3px solid var(--tone); padding: 0.4rem 0.6rem; border-radius: 4px; background: color-mix(in srgb, var(--tone) 10%, transparent); display: grid; gap: 0.3rem; justify-items: start; }
  .note b span { color: var(--tone); }
  .note b small { color: var(--muted); font-weight: 400; }
  .note p { margin: 0; font-size: 0.88rem; }
  .note button { font-size: 0.78rem; padding: 0.25rem 0.6rem; }
  .moves { list-style: none; margin: 0; padding: 0; max-height: 26vh; overflow-y: auto; font-variant-numeric: tabular-nums; }
  .moves li { display: grid; grid-template-columns: 2.4rem 1fr 1fr; align-items: center; }
  .moves li:nth-child(odd) { background: color-mix(in srgb, var(--ink) 5%, transparent); }
  .n { color: var(--muted); font-size: 0.8rem; padding-left: 0.4rem; }
  .mv { all: unset; cursor: pointer; padding: 0.22rem 0.4rem; border-radius: 4px; font-weight: 600; }
  .mv:hover { background: color-mix(in srgb, var(--accent) 20%, transparent); }
  .mv.cur { background: var(--accent); color: var(--accent-ink); }
  .mv i { font-style: normal; margin-left: 0.15rem; font-size: 0.8rem; }
  .counts { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
  .counts th { text-align: right; color: var(--muted); font-weight: 600; font-size: 0.75rem; }
  .counts td { padding: 0.15rem 0; }
  .counts td + td { text-align: right; font-variant-numeric: tabular-nums; width: 3.5rem; }
  .counts i { font-style: normal; display: inline-block; width: 1.4rem; font-weight: 700; }
  .counts small { color: var(--muted); }
  h4 { margin: 0.4rem 0 0; font: 700 0.95rem 'Cinzel', serif; }
  .tip { padding: 0.45rem 0.6rem; border-radius: 8px; border: 1px solid var(--panel-border); }
  .tip.warn { border-color: color-mix(in srgb, #f08a3c 60%, transparent); }
  .tip.good { border-color: color-mix(in srgb, #4cc38a 60%, transparent); }
  .tip b small { color: var(--muted); font-weight: 400; }
  .tip p { margin: 0.2rem 0 0; font-size: 0.86rem; }
  .glossary { font-size: 0.85rem; }
  .glossary summary { cursor: pointer; color: var(--muted); }
  .glossary dl { margin: 0.5rem 0; display: grid; gap: 0.2rem; }
  .glossary dt { font-weight: 700; margin-top: 0.3rem; }
  .glossary dd { margin: 0; color: var(--muted); }
  .glossary a { color: var(--accent); }
</style>
