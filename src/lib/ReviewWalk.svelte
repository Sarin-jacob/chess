<script lang="ts">
  // The walk through a reviewed game, under the board: it replays the moves, halts before each
  // turning point with the move played and the Elder's choice drawn on the board, and plays on
  // when asked.
  import { game } from './game.svelte';
  import { review, VERDICTS } from './review.svelte';
  import Rich from './Rich.svelte';

  let { oncounsel }: { oncounsel: () => void } = $props();

  const n = $derived(game.history.length);
  const cur = $derived(game.viewPly ?? n);
  const at = $derived(review.halted ? review.plies[review.halt! - 1] : null);
  const played = $derived(cur > 0 ? review.plies[cur - 1] : undefined);
  const ended = $derived(review.status === 'done' && cur >= n && !review.playing);
  const label = (ply: number) => `${Math.ceil(ply / 2)}${ply % 2 ? '.' : '…'}`;
  const who = (c: 'w' | 'b') => (review.you ? (c === review.you ? 'You' : 'Your rival') : c === 'w' ? 'White' : 'Black');

  function seek(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    review.stepTo(Math.round(((e.clientX - r.left) / r.width) * n));
  }
</script>

<section class="walk" aria-label="Review walk-through">
  {#if review.status === 'running'}
    <div class="studying">
      <span class="hz">鉴</span>
      <span class="grow">The Elder studies the game… {Math.round(review.progress * 100)}%{review.plies.length ? ' · walk on meanwhile' : ''}</span>
      <button class="link" onclick={() => review.cancel()}>Stop</button>
    </div>
    <div class="track"><span class="fill" style:width="{review.progress * 100}%"></span></div>
  {/if}

  {#if review.retry}
    {@const r = review.retry}
    {@const p = review.plies[r.ply - 1]}
    <div class="note" style:--tone={r.result ? (r.result.kind === 'right' ? '#3fae55' : r.result.kind === 'close' ? '#e6c14f' : r.result.kind === 'wrong' ? '#e5484d' : 'var(--accent)') : 'var(--accent)'}>
      {#if !r.result}
        <b>⚔ Your move, {p.color === 'w' ? 'White' : 'Black'}.</b>
        <p>{p.san} was played here: {VERDICTS[p.verdict].label} ({VERDICTS[p.verdict].plain}). Find something stronger on the board, or show the answer.</p>
      {:else}
        <b>{r.result.kind === 'right' ? '✓ Found it' : r.result.kind === 'close' ? '≈ Close' : r.result.kind === 'wrong' ? '✗ Not quite' : '…'}</b>
        <p>{r.result.text}</p>
      {/if}
    </div>
    <div class="ctl">
      {#if r.result && r.result.kind !== 'right' && r.result.kind !== 'checking'}<button onclick={() => review.retryAgain()}>↺ Try again</button>{/if}
      {#if !r.result || r.result.kind !== 'checking'}<button onclick={() => review.endRetry()}>{r.result?.kind === 'right' ? 'See the notes' : 'Show the answer'}</button>{/if}
      <button class="primary play" onclick={() => review.toggle()}>▶ Play on</button>
      <button onclick={() => review.endRetry()} aria-label="Stop trying" title="Back to the walk">✕</button>
    </div>
  {:else}
    {#if at}
      {@const v = VERDICTS[at.verdict]}
      {@const m = game.history[at.ply - 1]}
      <div class="note" style:--tone={v.color}>
        <b>{label(at.ply)} {who(at.color)} played {at.san} <span>{v.symbol} {v.label}</span> <small>({v.plain})</small></b>
        <p><Rich text={at.comment} /></p>
        <p class="legend">
          <i style:background={v.color}></i>played {m?.san}
          {#if at.best}<i style:background="#3fae55"></i>stronger {at.best.san}{/if}
        </p>
      </div>
    {:else if ended}
      <div class="note done">
        <b>The walk is done.</b>
        <p>Accuracy: White {Math.round(review.accuracy.w)}% · Black {Math.round(review.accuracy.b)}%. {review.stops.size ? `${review.stops.size} turning point${review.stops.size === 1 ? '' : 's'} along the way.` : 'Not a single turning point to dwell on.'}</p>
        <button class="link" onclick={oncounsel}>Hear the Elder's counsel ↦</button>
      </div>
    {:else if played}
      {@const v = VERDICTS[played.verdict]}
      <p class="line">{label(played.ply)} {played.san} <span style:color={v.color}>{v.symbol} {v.label}</span></p>
      {#if played.verdict === 'brilliant' || played.motifs.length || (played.verdict === 'book' && played.ply === review.opening.plies)}
        <p class="said"><Rich text={played.comment} /></p>
      {/if}
    {:else if cur > 0}
      <p class="line muted">The Elder hasn't reached this move yet…</p>
    {:else}
      <p class="line">The opening position. {review.status === 'done' && review.stops.size ? `The Elder will halt at ${review.stops.size} turning point${review.stops.size === 1 ? '' : 's'}.` : ''}</p>
    {/if}

    {#if review.plies.length}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="track seek" onclick={seek} title="Jump to a move">
        <span class="fill" style:width="{(cur / Math.max(1, n)) * 100}%"></span>
        {#each [...review.stops] as s}
          <i style:left="{((s - 0.5) / Math.max(1, n)) * 100}%" style:background={VERDICTS[review.plies[s - 1].verdict].color}></i>
        {/each}
      </div>
    {/if}

    <div class="ctl">
      <button onclick={() => review.stepTo(0)} disabled={cur === 0} aria-label="First move" title="First move">⏮</button>
      <button onclick={() => review.prev()} disabled={cur === 0} aria-label="Previous move" title="Previous move (←)">◀</button>
      <button class="primary play" onclick={() => review.toggle()} title="Play or pause (space)">
        {review.playing ? '⏸ Pause' : review.halted ? '▶ Play on' : ended ? '↺ Again' : '▶ Play'}
      </button>
      <button onclick={() => review.next()} disabled={cur >= n} aria-label="Next move" title="Next move (→)">▶</button>
      <button onclick={() => review.skipToNextStop()} disabled={review.nextStop === null} aria-label="Next turning point" title="Next turning point">⏭</button>
      <button onclick={() => review.endWalk()} aria-label="End the walk" title="End the walk">✕</button>
    </div>
  {/if}
</section>

<style>
  .walk {
    display: grid;
    gap: 0.45rem;
    padding: 0.55rem 0.6rem;
    border-radius: 10px;
    background: var(--panel);
    border: 1px solid var(--panel-border);
    backdrop-filter: blur(8px);
  }
  .line { margin: 0; font-size: 0.88rem; display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
  .line span { font-weight: 600; }
  .muted { color: var(--muted); }
  .studying { display: flex; align-items: center; gap: 0.4rem; font-size: 0.82rem; color: var(--muted); }
  .studying .grow { flex: 1; }

  .said { margin: 0; font-size: 0.84rem; color: var(--muted); }
  .hz { font-family: 'Ma Shan Zheng', serif; font-size: 1.2rem; line-height: 1; color: var(--accent); }
  .note { border-left: 3px solid var(--tone, var(--accent)); padding: 0.25rem 0.55rem; border-radius: 4px; background: color-mix(in srgb, var(--tone, var(--accent)) 10%, transparent); display: grid; gap: 0.25rem; justify-items: start; }
  .note b { font-size: 0.9rem; }
  .note b span { color: var(--tone); }
  .note b small { color: var(--muted); font-weight: 400; }
  .note p { margin: 0; font-size: 0.85rem; }
  .legend { display: flex; align-items: center; gap: 0.35rem; color: var(--muted); font-size: 0.78rem !important; }
  .legend i { display: inline-block; width: 0.9rem; height: 0.3rem; border-radius: 2px; margin-left: 0.3rem; }
  .legend i:first-child { margin-left: 0; }
  .track { position: relative; height: 6px; border-radius: 3px; background: color-mix(in srgb, var(--ink) 12%, transparent); }
  .track.seek { cursor: pointer; height: 8px; }
  .fill { position: absolute; inset: 0 auto 0 0; border-radius: 3px; background: var(--accent); opacity: 0.7; transition: width 0.3s; }
  .track i { position: absolute; top: 50%; width: 9px; height: 9px; border-radius: 50%; transform: translate(-50%, -50%); box-shadow: 0 0 0 1.5px var(--bg1); }
  .ctl { display: flex; gap: 0.3rem; }
  .ctl button { flex: 1; padding-inline: 0.3rem; }
  .ctl .play { flex: 2.4; white-space: nowrap; }
  .link { all: unset; cursor: pointer; color: var(--accent); text-decoration: underline; text-underline-offset: 3px; font-size: 0.85rem; }
  .link:focus-visible { outline: 2px solid var(--accent); }
</style>
