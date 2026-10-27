<script lang="ts">
  import type { Move } from 'chess.js';
  import { PIECES } from './pieces';

  type Color = 'w' | 'b';
  interface Props {
    fen: string;
    orientation: Color;
    movable: Color | null;
    lastMove: { from: string; to: string } | null;
    check: string | null;
    hint?: { from: string; to: string } | null;
    coords?: boolean;
    legalFrom: (square: string) => Move[];
    onmove: (from: string, to: string, promotion?: string) => boolean;
  }

  let { fen, orientation, movable, lastMove, check, hint = null, coords = true, legalFrom, onmove }: Props = $props();

  const FILES = 'abcdefgh';

  /** square -> piece code like 'wq' */
  const pieces = $derived.by(() => {
    const map = new Map<string, string>();
    const rows = fen.split(' ')[0].split('/');
    rows.forEach((row, r) => {
      let f = 0;
      for (const ch of row) {
        if (/\d/.test(ch)) f += +ch;
        else {
          map.set(FILES[f] + (8 - r), (ch === ch.toUpperCase() ? 'w' : 'b') + ch.toLowerCase());
          f++;
        }
      }
    });
    return map;
  });

  const squares = $derived.by(() => {
    const out: string[] = [];
    for (let r = 0; r < 8; r++)
      for (let f = 0; f < 8; f++) {
        const rank = orientation === 'w' ? 8 - r : r + 1;
        const file = orientation === 'w' ? FILES[f] : FILES[7 - f];
        out.push(file + rank);
      }
    return out;
  });

  let selected = $state<string | null>(null);
  let dests = $state<Move[]>([]);
  let promo = $state<{ from: string; to: string; color: Color } | null>(null);
  let drag = $state<{ square: string; piece: string; x: number; y: number; moved: boolean; toggle: boolean } | null>(null);
  // Dropped pieces are already in place, so skip the slide animation for them.
  let dropped = false;
  let hover = $state<string | null>(null);
  let boardEl: HTMLDivElement;

  const isLight = (sq: string) => (FILES.indexOf(sq[0]) + +sq[1]) % 2 === 1;

  // Clear selection whenever the position changes underneath us.
  $effect(() => {
    fen;
    selected = null;
    dests = [];
    promo = null;
  });

  function select(sq: string) {
    selected = sq;
    dests = legalFrom(sq);
  }

  function attempt(from: string, to: string): boolean {
    const candidates = dests.filter((m) => m.to === to);
    if (!candidates.length) return false;
    if (candidates.some((m) => m.promotion)) {
      promo = { from, to, color: candidates[0].color };
      return true;
    }
    const ok = onmove(from, to);
    if (ok) {
      selected = null;
      dests = [];
    }
    return ok;
  }

  function squareAt(x: number, y: number): string | null {
    const rect = boardEl.getBoundingClientRect();
    const f = Math.floor(((x - rect.left) / rect.width) * 8);
    const r = Math.floor(((y - rect.top) / rect.height) * 8);
    if (f < 0 || f > 7 || r < 0 || r > 7) return null;
    return squares[r * 8 + f];
  }

  function ownPiece(sq: string) {
    const p = pieces.get(sq);
    return !!p && !!movable && p[0] === movable;
  }

  function pointerdown(e: PointerEvent) {
    if (promo || e.button > 0) return;
    const sq = squareAt(e.clientX, e.clientY);
    if (!sq) return;
    if (selected && sq !== selected && dests.some((m) => m.to === sq)) {
      attempt(selected, sq);
      return;
    }
    if (ownPiece(sq)) {
      // A second click on the same piece deselects it (unless it turns into a drag).
      const toggle = selected === sq;
      select(sq);
      drag = { square: sq, piece: pieces.get(sq)!, x: e.clientX, y: e.clientY, moved: false, toggle };
      (e.target as Element).setPointerCapture?.(e.pointerId);
      e.preventDefault();
    } else {
      selected = null;
      dests = [];
    }
  }

  function pointermove(e: PointerEvent) {
    if (!drag) return;
    const moved = drag.moved || Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4;
    drag = { ...drag, x: e.clientX, y: e.clientY, moved };
    hover = moved ? squareAt(e.clientX, e.clientY) : null;
  }

  function pointerup(e: PointerEvent) {
    if (!drag) return;
    const d = drag;
    drag = null;
    hover = null;
    if (!d.moved) {
      if (d.toggle) {
        selected = null;
        dests = [];
      }
      return;
    }
    const sq = squareAt(e.clientX, e.clientY);
    if (sq && sq !== d.square) {
      dropped = true;
      if (!attempt(d.square, sq)) dropped = false;
    }
  }

  function choosePromotion(p: string | null) {
    const pr = promo;
    promo = null;
    if (pr && p) onmove(pr.from, pr.to, p);
  }

  // Slide the moved piece in from its origin square.
  $effect(() => {
    const lm = lastMove;
    orientation;
    if (!lm || !boardEl) return;
    const el = boardEl.querySelector<HTMLElement>(`[data-piece-sq="${lm.to}"]`);
    const fromEl = boardEl.querySelector<HTMLElement>(`[data-sq="${lm.from}"]`);
    const toEl = boardEl.querySelector<HTMLElement>(`[data-sq="${lm.to}"]`);
    if (dropped) {
      dropped = false;
      return;
    }
    if (!el || !fromEl || !toEl) return;
    const a = fromEl.getBoundingClientRect();
    const b = toEl.getBoundingClientRect();
    el.animate([{ transform: `translate(${a.left - b.left}px, ${a.top - b.top}px)` }, { transform: 'translate(0, 0)' }], {
      duration: 180,
      easing: 'cubic-bezier(.2,.7,.3,1)',
    });
  });

  const promoPieces = ['q', 'n', 'r', 'b'];
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="board"
  bind:this={boardEl}
  onpointerdown={pointerdown}
  onpointermove={pointermove}
  onpointerup={pointerup}
  onpointercancel={() => { drag = null; hover = null; }}
  oncontextmenu={(e) => e.preventDefault()}
>
  {#each squares as sq, i (sq)}
    {@const piece = pieces.get(sq)}
    {@const dest = dests.find((m) => m.to === sq)}
    <div
      class="sq"
      class:light={isLight(sq)}
      class:last={lastMove && (lastMove.from === sq || lastMove.to === sq)}
      class:sel={selected === sq}
      class:hover={hover === sq && dest}
      class:check={check === sq}
      class:hint={hint && (hint.from === sq || hint.to === sq)}
      data-sq={sq}
    >
      {#if coords && i % 8 === 0}<span class="rank">{sq[1]}</span>{/if}
      {#if coords && i >= 56}<span class="file">{sq[0]}</span>{/if}
      {#if piece}
        <div
          class="piece"
          class:ghost={drag?.moved && drag.square === sq}
          class:grab={movable && piece[0] === movable}
          data-piece-sq={sq}
          style:background-image="url({PIECES[piece]})"
        ></div>
      {/if}
      {#if dest}<div class="dot" class:cap={!!piece || dest.isEnPassant()}></div>{/if}
    </div>
  {/each}

  {#if promo}
    {@const col = orientation === 'w' ? FILES.indexOf(promo.to[0]) : 7 - FILES.indexOf(promo.to[0])}
    {@const top = (orientation === 'w') === (promo.color === 'w')}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="promo-veil" onclick={() => choosePromotion(null)}>
      <div class="promo" style:left="{col * 12.5}%" style:top={top ? '0' : 'auto'} style:bottom={top ? 'auto' : '0'}>
        {#each promoPieces as p}
          <button onclick={(e) => { e.stopPropagation(); choosePromotion(p); }} style:background-image="url({PIECES[promo.color + p]})" aria-label="Promote to {p}"></button>
        {/each}
      </div>
    </div>
  {/if}
</div>

{#if drag?.moved}
  <div class="drag" style:left="{drag.x}px" style:top="{drag.y}px" style:background-image="url({PIECES[drag.piece]})"></div>
{/if}

<style>
  .board {
    position: relative;
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    grid-template-rows: repeat(8, 1fr);
    width: 100%;
    aspect-ratio: 1;
    border-radius: 6px;
    overflow: hidden;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    box-shadow:
      0 0 0 1px var(--panel-border),
      0 0 0 6px color-mix(in srgb, var(--dark) 55%, transparent),
      0 18px 60px -10px rgba(0, 0, 0, 0.6),
      0 0 80px -20px var(--glow);
  }
  .sq {
    position: relative;
    background: var(--dark);
    transition: background-color 0.4s;
  }
  .sq.light { background: var(--light); }
  .sq.last::before,
  .sq.sel::before,
  .sq.hint::before,
  .sq.hover::before {
    content: '';
    position: absolute;
    inset: 0;
  }
  .sq.last::before { background: var(--last); }
  .sq.sel::before { background: var(--hl); }
  .sq.hover::before { box-shadow: inset 0 0 0 4px var(--hl); }
  .sq.hint::before { box-shadow: inset 0 0 0 4px var(--accent); animation: pulse 1.2s ease-in-out infinite; }
  .sq.check { background-image: radial-gradient(circle, var(--check) 0%, transparent 72%); }
  .rank, .file {
    position: absolute;
    font: 600 clamp(8px, 1.6vmin, 12px) / 1 system-ui, sans-serif;
    color: var(--coord-light);
    pointer-events: none;
    z-index: 1;
  }
  .sq:not(.light) .rank, .sq:not(.light) .file { color: var(--coord-dark); }
  .rank { top: 3px; left: 3px; }
  .file { bottom: 2px; right: 4px; }
  .piece {
    position: absolute;
    inset: 0;
    background-size: 100%;
    background-repeat: no-repeat;
    z-index: 2;
    filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.35));
    will-change: transform;
  }
  .piece.grab { cursor: grab; }
  .piece.ghost { opacity: 0.3; }
  .dot {
    position: absolute;
    inset: 36%;
    border-radius: 50%;
    background: color-mix(in srgb, var(--accent-ink) 30%, transparent);
    z-index: 3;
    pointer-events: none;
  }
  .dot.cap {
    inset: 0;
    background: radial-gradient(circle, transparent 62%, color-mix(in srgb, var(--accent-ink) 32%, transparent) 64%);
  }
  .drag {
    position: fixed;
    width: min(13vmin, 92px);
    aspect-ratio: 1;
    transform: translate(-50%, -55%) scale(1.15);
    background-size: 100%;
    pointer-events: none;
    z-index: 100;
    filter: drop-shadow(0 8px 8px rgba(0, 0, 0, 0.4));
  }
  .promo-veil {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    z-index: 10;
  }
  .promo {
    position: absolute;
    width: 12.5%;
    display: flex;
    flex-direction: column;
    background: var(--light);
    border-radius: 4px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5);
  }
  .promo button {
    aspect-ratio: 1;
    border: 0;
    background: transparent center / 90% no-repeat;
    cursor: pointer;
  }
  .promo button:hover { background-color: var(--hl); }
  @keyframes pulse { 50% { opacity: 0.4; } }
</style>
