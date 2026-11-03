<script lang="ts">
  // The Elder's walk through a heterodox game, under the board.
  import { hreview, VERDICT_COLOR, VERDICT_LABEL, VERDICT_SYMBOL } from './hreview.svelte';

  const n = $derived(hreview.moves.length);
  const at = $derived(hreview.halted ? hreview.plies[hreview.halt! - 1] : null);
  const played = $derived(hreview.view > 0 ? hreview.plies[hreview.view - 1] : undefined);
  const ended = $derived(hreview.status === 'done' && hreview.view >= n && !hreview.playing);
  const label = (ply: number) => `${Math.ceil(ply / 2)}${ply % 2 ? '.' : '…'}`;
  const who = (c: 'w' | 'b') => (hreview.you ? (c === hreview.you ? 'You' : 'Your rival') : c === 'w' ? 'White' : 'Black');

  function seek(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    hreview.stepTo(Math.round(((e.clientX - r.left) / r.width) * n));
  }
</script>

<section class="walk" aria-label="Review walk-through">
  {#if hreview.status === 'running'}
    <p class="line muted"><span class="hz">鉴</span> The Elder studies the game… {Math.round(hreview.progress * 100)}%</p>
  {/if}
  {#if at}
    <div class="note" style:--tone={VERDICT_COLOR[at.verdict]}>
      <b>{label(at.ply)} {who(at.color)} played {at.san} <span>{VERDICT_SYMBOL[at.verdict]} {VERDICT_LABEL[at.verdict]}</span></b>
      <p>{at.comment}</p>
      <p class="legend"><i style:background={VERDICT_COLOR[at.verdict]}></i>played {at.san}{#if at.best}<i style:background="#3fae55"></i>stronger {at.best.san}{/if}</p>
    </div>
  {:else if ended}
    <div class="note">
      <b>The walk is done.</b>
      <p>Accuracy: White {Math.round(hreview.accuracy.w)}% · Black {Math.round(hreview.accuracy.b)}%. {hreview.stops.size ? `${hreview.stops.size} turning point${hreview.stops.size === 1 ? '' : 's'} along the way.` : 'Not a single turning point to dwell on.'}</p>
    </div>
  {:else if played}
    <p class="line">{label(played.ply)} {played.san} <span style:color={VERDICT_COLOR[played.verdict]}>{VERDICT_SYMBOL[played.verdict]} {VERDICT_LABEL[played.verdict]}</span></p>
  {:else if hreview.view > 0}
    <p class="line muted">The Elder hasn't reached this move yet…</p>
  {:else}
    <p class="line">The opening position.</p>
  {/if}

  {#if hreview.plies.length}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="track" onclick={seek} title="Jump to a move">
      <span class="fill" style:width="{(hreview.view / Math.max(1, n)) * 100}%"></span>
      {#each [...hreview.stops] as s}<i style:left="{((s - 0.5) / Math.max(1, n)) * 100}%" style:background={VERDICT_COLOR[hreview.plies[s - 1].verdict]}></i>{/each}
    </div>
  {/if}
  <div class="ctl">
    <button onclick={() => hreview.stepTo(0)} disabled={hreview.view === 0} aria-label="First move">⏮</button>
    <button onclick={() => hreview.prev()} disabled={hreview.view === 0} aria-label="Previous move">◀</button>
    <button class="primary play" onclick={() => hreview.toggle()}>{hreview.playing ? '⏸ Pause' : hreview.halted ? '▶ Play on' : ended ? '↺ Again' : '▶ Play'}</button>
    <button onclick={() => hreview.next()} disabled={hreview.view >= n} aria-label="Next move">▶</button>
    <button onclick={() => hreview.skipToNextStop()} disabled={hreview.nextStop === null} aria-label="Next turning point">⏭</button>
    <button onclick={() => hreview.endWalk()} aria-label="End the walk">✕</button>
  </div>
</section>

<style>
  .walk { display: grid; gap: 0.45rem; padding: 0.55rem 0.6rem; border-radius: 10px; background: var(--panel); border: 1px solid var(--panel-border); backdrop-filter: blur(8px); }
  .line { margin: 0; font-size: 0.88rem; display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
  .line span { font-weight: 600; }
  .muted { color: var(--muted); }
  .hz { font-family: 'Ma Shan Zheng', serif; font-size: 1.1rem; line-height: 1; color: var(--accent); }
  .note { border-left: 3px solid var(--tone, var(--accent)); padding: 0.25rem 0.55rem; border-radius: 4px; background: color-mix(in srgb, var(--tone, var(--accent)) 10%, transparent); display: grid; gap: 0.25rem; }
  .note b { font-size: 0.9rem; }
  .note b span { color: var(--tone); }
  .note p { margin: 0; font-size: 0.85rem; }
  .legend { display: flex; align-items: center; gap: 0.35rem; color: var(--muted); font-size: 0.78rem !important; }
  .legend i { display: inline-block; width: 0.9rem; height: 0.3rem; border-radius: 2px; margin-left: 0.3rem; }
  .legend i:first-child { margin-left: 0; }
  .track { position: relative; height: 8px; border-radius: 3px; background: color-mix(in srgb, var(--ink) 12%, transparent); cursor: pointer; }
  .fill { position: absolute; inset: 0 auto 0 0; border-radius: 3px; background: var(--accent); opacity: 0.7; }
  .track i { position: absolute; top: 50%; width: 9px; height: 9px; border-radius: 50%; transform: translate(-50%, -50%); box-shadow: 0 0 0 1.5px var(--bg1); }
  .ctl { display: flex; gap: 0.3rem; }
  .ctl button { flex: 1; padding-inline: 0.3rem; }
  .ctl .play { flex: 2.4; white-space: nowrap; }
</style>
