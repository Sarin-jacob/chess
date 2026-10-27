<script lang="ts">
  import type { Move } from 'chess.js';
  import { onMount } from 'svelte';
  import { PIECES } from './pieces';
  import type { Realm } from './realms';
  import { settings } from './settings.svelte';
  import { ChessScene } from './three/scene3d';

  type Color = 'w' | 'b';
  interface Props {
    fen: string;
    orientation: Color;
    movable: Color | null;
    lastMove: { from: string; to: string } | null;
    check: string | null;
    hint?: { from: string; to: string } | null;
    coords?: boolean;
    realm: Realm;
    weather?: boolean;
    status?: string;
    legalFrom: (square: string) => Move[];
    onmove: (from: string, to: string, promotion?: string) => boolean;
    onflip?: () => void;
  }

  let { fen, orientation, movable, lastMove, check, hint = null, coords = true, realm, weather = true, status = '', legalFrom, onmove, onflip }: Props = $props();

  let host: HTMLDivElement;
  let scene = $state<ChessScene | null>(null);
  let failed = $state(false);
  let full = $state(false);
  let selected = $state<string | null>(null);
  let dests = $state<Move[]>([]);
  let promo = $state<{ from: string; to: string; color: Color } | null>(null);

  const pieceAt = (sq: string): string | null => {
    const FILES = 'abcdefgh';
    const rows = fen.split(' ')[0].split('/');
    const row = rows[8 - +sq[1]];
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) f += +ch;
      else {
        if (FILES[f] === sq[0]) return (ch === ch.toUpperCase() ? 'w' : 'b') + ch.toLowerCase();
        f++;
      }
    }
    return null;
  };
  const own = (sq: string) => {
    const p = pieceAt(sq);
    return !!p && !!movable && p[0] === movable;
  };

  function pick(sq: string | null) {
    if (promo) return;
    if (sq && selected && sq !== selected) {
      const candidates = dests.filter((m) => m.to === sq);
      if (candidates.length) {
        if (candidates.some((m) => m.promotion)) promo = { from: selected, to: sq, color: candidates[0].color };
        else if (onmove(selected, sq)) clear();
        return;
      }
    }
    if (sq && own(sq) && selected !== sq) {
      selected = sq;
      dests = legalFrom(sq);
    } else clear();
  }

  function clear() {
    selected = null;
    dests = [];
  }

  function choosePromotion(p: string | null) {
    const pr = promo;
    promo = null;
    if (pr && p) onmove(pr.from, pr.to, p);
    clear();
  }

  onMount(() => {
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    try {
      const s = new ChessScene(host, { reduceMotion, onPick: (sq) => pick(sq), pickable: (sq) => own(sq) || dests.some((m) => m.to === sq) });
      s.setOrientation(orientation, true);
      scene = s;
    } catch (e) {
      console.warn('3D view unavailable', e);
      failed = true;
    }
    return () => scene?.dispose();
  });

  $effect(() => {
    fen;
    selected = null;
    dests = [];
    promo = null;
  });

  $effect(() => scene?.setRealm(realm));
  $effect(() => scene?.setPosition(fen, lastMove));
  $effect(() => scene?.setOrientation(orientation));
  $effect(() => scene?.setCoords(coords));
  $effect(() => scene?.setWeather(weather));
  $effect(() => {
    scene?.setMarks({
      selected,
      dests: dests.map((m) => ({ to: m.to, capture: !!m.captured })),
      lastMove: lastMove ? { from: lastMove.from, to: lastMove.to } : null,
      check,
      hint: hint ? { from: hint.from, to: hint.to } : null,
    });
  });

  function onkey(e: KeyboardEvent) {
    if (e.key === 'Escape' && (promo || full)) {
      if (promo) choosePromotion(null);
      else full = false;
      e.preventDefault();
    }
  }

  const promoNames: Record<string, string> = { q: 'Queen', n: 'Knight', r: 'Rook', b: 'Bishop' };
</script>

<svelte:window onkeydown={onkey} />

<div class="b3d" class:full>
  <div class="host" bind:this={host}></div>

  {#if failed}
    <div class="fail">
      <p>This device couldn't open a 3D view (WebGL is unavailable).</p>
      <button onclick={() => (settings.view3d = false)}>Back to the 2D board</button>
    </div>
  {:else}
    <div class="tools">
      {#if full}
        {#if status}<span class="status">{status}</span>{/if}
        {#if onflip}<button onclick={onflip} title="Turn the board around (F)">⇅ Flip</button>{/if}
        <button onclick={() => (full = false)} title="Leave full view (Esc)">✕ Exit</button>
      {:else}
        <button onclick={() => (full = true)} title="Fill the screen with the realm" aria-label="Immersive full view">⛶</button>
      {/if}
    </div>
    <p class="help">Drag to orbit · pinch or scroll to zoom · tap a piece, then a square</p>
  {/if}

  {#if promo}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="promo-veil" onclick={() => choosePromotion(null)}>
      <div class="promo" role="dialog" aria-label="Choose a promotion">
        <span>Promote to</span>
        <div>
          {#each ['q', 'n', 'r', 'b'] as p}
            <button onclick={(e) => { e.stopPropagation(); choosePromotion(p); }} style:background-image="url({PIECES[promo.color + p]})" aria-label="Promote to {promoNames[p]}" title={promoNames[p]}></button>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .b3d {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    border-radius: 6px;
    overflow: hidden;
    background: var(--bg1);
    box-shadow: 0 0 0 1px var(--panel-border), 0 18px 60px -10px rgba(0, 0, 0, 0.6), 0 0 80px -20px var(--glow);
    user-select: none;
    -webkit-user-select: none;
  }
  .b3d.full {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100dvh;
    aspect-ratio: auto;
    border-radius: 0;
    z-index: 30;
  }
  .host { position: absolute; inset: 0; touch-action: none; }
  .tools {
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    gap: 0.35rem;
    align-items: center;
    z-index: 2;
  }
  .tools button, .status {
    background: var(--panel);
    border: 1px solid var(--panel-border);
    backdrop-filter: blur(8px);
    color: var(--ink);
    font-size: 0.8rem;
    padding: 0.35rem 0.6rem;
    border-radius: 8px;
  }
  .status { font-weight: 600; }
  .help {
    position: absolute;
    left: 50%;
    bottom: 6px;
    transform: translateX(-50%);
    margin: 0;
    font-size: 0.68rem;
    color: var(--ink);
    opacity: 0.7;
    white-space: nowrap;
    pointer-events: none;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
  }
  .full .help { bottom: max(10px, env(safe-area-inset-bottom)); }
  .fail { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 0.6rem; padding: 1rem; text-align: center; }
  .promo-veil { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(0, 0, 0, 0.45); z-index: 5; }
  .promo {
    display: grid;
    gap: 0.4rem;
    justify-items: center;
    padding: 0.8rem;
    border-radius: 12px;
    background: var(--panel);
    border: 1px solid var(--panel-border);
    backdrop-filter: blur(12px);
  }
  .promo span { font: 600 0.9rem 'Cinzel', serif; }
  .promo div { display: flex; gap: 0.3rem; }
  .promo button {
    width: min(16vw, 68px);
    aspect-ratio: 1;
    border: 0;
    border-radius: 8px;
    background: var(--light) center / 88% no-repeat;
    cursor: pointer;
  }
  .promo button:hover, .promo button:focus-visible { background-color: var(--hl); }
  @media (max-width: 520px) {
    .help { display: none; }
    .full .help { display: block; font-size: 0.62rem; }
  }
</style>
