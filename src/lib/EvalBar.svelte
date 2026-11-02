<script lang="ts">
  // Advantage bar: the engine's score for the shown position, white's share filling from
  // white's side. Positions are scored one at a time; a newer one skips any still queued.
  import { analyse, isMate, scoreText } from './engine';

  let { fen, orientation, result = '*' }: { fen: string; orientation: 'w' | 'b'; result?: string } = $props();

  /** Centipawns from white's side. */
  let white = $state(0);
  let busy = false;
  let next: string | null = null;
  let timer = 0;

  async function run() {
    if (busy || !next) return;
    const f = next;
    next = null;
    busy = true;
    const r = await analyse(f, { depth: 4, ms: 700 });
    busy = false;
    white = f.split(' ')[1] === 'w' ? r.score : -r.score;
    run();
  }

  $effect(() => {
    next = fen;
    clearTimeout(timer);
    timer = window.setTimeout(run, 150);
    return () => clearTimeout(timer);
  });

  // Same curve chess sites use to turn centipawns into a winning chance.
  const share = $derived(
    result === '1-0' ? 100 : result === '0-1' ? 0 : result === '1/2-1/2' ? 50
      : isMate(white) ? (white > 0 ? 100 : 0)
      : 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * white)) - 1),
  );
  const label = $derived(
    result === '1-0' ? '1-0' : result === '0-1' ? '0-1' : result === '1/2-1/2' ? '½' : scoreText(Math.abs(white)).replace('+', ''),
  );
  const whiteAhead = $derived(result === '1-0' || (result !== '0-1' && white >= 0));
</script>

<div class="bar" class:flip={orientation === 'b'} role="meter" aria-label="Advantage" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share)} title="Advantage: {scoreText(white)} (white's view)">
  <div class="white" style:height="{share}%"></div>
  <span class="score" class:on-white={whiteAhead}>{label}</span>
</div>

<style>
  .bar {
    position: relative;
    width: 100%;
    height: 100%;
    border-radius: 4px;
    overflow: hidden;
    background: #26221f;
    box-shadow: 0 0 0 1px var(--panel-border);
    display: flex;
    flex-direction: column-reverse;
  }
  .bar.flip { flex-direction: column; }
  .white { background: #f3efe6; transition: height 0.5s cubic-bezier(0.2, 0.7, 0.3, 1); }
  .score {
    position: absolute;
    left: 0;
    right: 0;
    text-align: center;
    font: 700 0.6rem/1 system-ui, sans-serif;
    color: #f3efe6;
    top: 4px;
    writing-mode: horizontal-tb;
  }
  /* The number sits at the end of the bar belonging to whoever is ahead. */
  .score.on-white { color: #26221f; top: auto; bottom: 4px; }
  .bar.flip .score { top: auto; bottom: 4px; }
  .bar.flip .score.on-white { top: 4px; bottom: auto; }
</style>
