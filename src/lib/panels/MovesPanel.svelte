<script lang="ts">
  import { game } from '../game.svelte';
  import { downloadPgn } from '../pgn';
  import { review } from '../review.svelte';
  import ReviewPanel from './ReviewPanel.svelte';

  let list = $state<HTMLOListElement>();
  let copied = $state(false);

  const pairs = $derived.by(() => {
    const out: { n: number; w?: string; b?: string }[] = [];
    game.history.forEach((m, i) => {
      if (i % 2 === 0) out.push({ n: i / 2 + 1, w: m.san });
      else out[out.length - 1].b = m.san;
    });
    return out;
  });

  const current = $derived(game.viewPly ?? game.history.length);

  $effect(() => {
    current;
    list?.querySelector('.cur')?.scrollIntoView({ block: 'nearest' });
  });

  const key = $derived(game.id + ':' + game.history.length);
  // Mid-match the review would whisper moves to you, so it waits until the game is over.
  const canReview = $derived(game.history.length >= 2 && !(game.active && !game.over));

  async function copy() {
    try {
      await navigator.clipboard.writeText(game.pgn());
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch { /* ignore */ }
  }
</script>

{#if review.open && review.key === key}
  <ReviewPanel />
{:else}
<section>
  {#if canReview}
    <button class="primary review" onclick={() => review.start(key, game.history, game.you, game.result)}>
      <span class="hz">鑑</span> {review.key === key && review.status === 'done' ? 'Open the review' : 'Review with the Elder'}
    </button>
  {/if}
  <ol class="moves" bind:this={list}>
    {#each pairs as p}
      <li>
        <span class="n">{p.n}.</span>
        <button class:cur={current === p.n * 2 - 1} onclick={() => (game.viewPly = p.n * 2 - 1 === game.history.length ? null : p.n * 2 - 1)}>{p.w}</button>
        {#if p.b}<button class:cur={current === p.n * 2} onclick={() => (game.viewPly = p.n * 2 === game.history.length ? null : p.n * 2)}>{p.b}</button>{/if}
      </li>
    {:else}
      <li class="empty">No moves yet. The board awaits.</li>
    {/each}
    {#if game.over}<li class="result">{game.result} <small>{game.reason}</small></li>{/if}
  </ol>

  <div class="nav">
    <button onclick={() => game.step('start')} aria-label="First move">⏮</button>
    <button onclick={() => game.step(-1)} aria-label="Previous move">◀</button>
    <button onclick={() => game.step(1)} aria-label="Next move">▶</button>
    <button onclick={() => game.step('end')} aria-label="Latest move">⏭</button>
  </div>
  <div class="row">
    <button onclick={copy}>{copied ? 'Copied!' : 'Copy PGN'}</button>
    <button onclick={() => downloadPgn(game.pgn(), game.id)}>Download PGN</button>
  </div>
</section>
{/if}

<style>
  section { display: grid; gap: 0.6rem; }
  .moves {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 40vh;
    overflow-y: auto;
    display: grid;
    grid-template-columns: 1fr;
    font-variant-numeric: tabular-nums;
  }
  .moves li { display: grid; grid-template-columns: 2.4rem 1fr 1fr; align-items: center; }
  .moves li:nth-child(odd) { background: color-mix(in srgb, var(--ink) 5%, transparent); }
  .moves .n { color: var(--muted); font-size: 0.8rem; padding-left: 0.4rem; }
  .moves button { all: unset; cursor: pointer; padding: 0.25rem 0.4rem; border-radius: 4px; font-weight: 600; }
  .moves button:hover { background: color-mix(in srgb, var(--accent) 20%, transparent); }
  .moves button.cur { background: var(--accent); color: var(--accent-ink); }
  .moves .empty, .moves .result { display: block; padding: 0.6rem; color: var(--muted); text-align: center; }
  .moves .result { font-weight: 700; color: var(--ink); }
  .nav, .row { display: flex; gap: 0.4rem; }
  .review { display: flex; align-items: center; justify-content: center; gap: 0.4rem; }
  .review .hz { font-family: 'Ma Shan Zheng', serif; font-size: 1.2rem; line-height: 1; }
  .nav button, .row button { flex: 1; }
</style>
