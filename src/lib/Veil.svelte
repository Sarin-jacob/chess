<script lang="ts">
  // The gate over an idle board: two painted doors and a saying, so the board doesn't look
  // playable before a match is set. When a match begins (`open`) the doors slide apart; the
  // page removes the gate a moment later. Plain CSS transitions, so a match that starts while
  // the page is in the background (a LAN rival joining) still opens the gate.
  import Mural from './Mural.svelte';
  import type { Realm } from './realms';

  let { realm, open = false, waiting = false, onplay, onarchive }: { realm: Realm; open?: boolean; waiting?: boolean; onplay: () => void; onarchive: () => void } = $props();

  // Sun Tzu in Lionel Giles's 1910 translation and the Tao Te Ching in James Legge's 1891,
  // both public domain; the rest are the sects' own.
  const SAYINGS: [string, string][] = [
    ['Look at every check, every capture, every threat. Then look once more.', 'Elder of the Frozen Peak'],
    ['When a fine move appears, the master waits one breath for a finer.', 'Sayings of the Nine Peaks'],
    ['The hasty blade cuts its own sleeve.', 'Maple Grove proverb'],
    ['A pawn that remembers its purpose outlives a queen that forgets hers.', 'Sayings of the Nine Peaks'],
    ['Castle early. Even emperors sleep behind walls.', 'Spring Blossom Court'],
    ['An advantage left unpressed is a debt the enemy will collect.', 'Molten Flame Valley'],
    ['One defeat studied teaches more than ten victories forgotten.', 'The Elder’s Mirror'],
    ['Bring every piece out once, as the river carries each stone to the sea.', 'Sunken Jade Temple'],
    ['Hold the centre, and the mountain bends toward you.', 'White Salt Plateau'],
    ['Ghosts lose no pieces they have not first left alone.', 'Obsidian Underworld'],
    ['The good fighter is able to secure himself against defeat, but cannot make certain of defeating the enemy.', 'Sun Tzu, The Art of War'],
    ['Supreme excellence consists in breaking the enemy’s resistance without fighting.', 'Sun Tzu, The Art of War'],
    ['The journey of a thousand li commences with a single step.', 'Tao Te Ching'],
    ['He who knows other men is discerning; he who knows himself is intelligent.', 'Tao Te Ching'],
  ];

  let i = $state(Math.floor(Math.random() * SAYINGS.length));
  $effect(() => {
    const t = setInterval(() => (i = (i + 1) % SAYINGS.length), 9000);
    return () => clearInterval(t);
  });
</script>

<div class="veil" class:open role="region" aria-label="No match underway" aria-hidden={open}>
  <div class="door left">
    <div class="paint"><Mural realm={realm.id} /></div>
  </div>
  <div class="door right">
    <div class="paint"><Mural realm={realm.id} /></div>
  </div>

  <div class="scroll">
    <span class="hz" title="{realm.hanzi}: {realm.meaning}">{realm.hanzi}</span>
    {#key i}
      <blockquote>
        <p>“{SAYINGS[i][0]}”</p>
        <cite>— {SAYINGS[i][1]}</cite>
      </blockquote>
    {/key}
    {#if waiting}
      <p class="wait">The gate opens when your rival arrives…</p>
    {:else}
      <div class="row">
        <button class="primary" onclick={onplay}><span class="bhz">弈</span> Begin a duel</button>
        <button onclick={onarchive}><span class="bhz">卷</span> Past duels</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .veil {
    position: absolute;
    inset: 0;
    z-index: 8;
    overflow: hidden;
    border-radius: 6px;
    display: grid;
    place-items: center;
    container-type: inline-size;
  }
  .door {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 50%;
    overflow: hidden;
    /* A faint blue lacquer over the board, so it reads as closed but still shows through. */
    background:
      radial-gradient(ellipse at 50% 30%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 70%),
      linear-gradient(180deg, rgb(22 48 92 / 0.78), rgb(10 24 52 / 0.88));
    backdrop-filter: blur(3px) saturate(0.8);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 25%, transparent), inset 0 0 0 7px rgb(0 0 0 / 0.12), inset 0 0 0 8px color-mix(in srgb, var(--accent) 18%, transparent);
    transition: transform 0.95s cubic-bezier(0.65, 0, 0.35, 1);
  }
  .veil.open { pointer-events: none; }
  .veil.open .left { transform: translateX(-102%); }
  .veil.open .right { transform: translateX(102%); }
  .veil.open .scroll { opacity: 0; }
  .door.left { left: 0; border-right: 1px solid color-mix(in srgb, var(--accent) 45%, transparent); }
  .door.right { right: 0; }
  /* The mural spans both doors, so each shows its own half. */
  .paint { position: absolute; top: 0; bottom: 0; width: 200%; }
  .left .paint { left: 0; }
  .right .paint { right: 0; }

  .scroll {
    position: relative;
    z-index: 1;
    width: min(84%, 26rem);
    display: grid;
    justify-items: center;
    gap: 0.5rem;
    padding: 0.9rem 1rem 1rem;
    text-align: center;
    border-radius: 12px;
    background: rgb(8 18 38 / 0.55);
    border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
    box-shadow: 0 10px 40px -10px rgb(0 0 0 / 0.6);
    backdrop-filter: blur(6px);
    color: #eef4ff;
    transition: opacity 0.25s;
  }
  blockquote { animation: rise-in 0.7s ease-out; }
  @keyframes rise-in { from { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) {
    .door, .scroll { transition: none; }
    blockquote { animation: none; }
  }
  .hz { font-family: 'Ma Shan Zheng', serif; font-size: clamp(1.6rem, 6cqi, 2.4rem); line-height: 1; color: var(--accent); text-shadow: 0 0 18px var(--glow); }
  blockquote { margin: 0; display: grid; gap: 0.3rem; align-content: center; }
  blockquote p { min-height: 5.8em; display: grid; align-content: center; }
  blockquote p { margin: 0; font: italic 500 clamp(0.82rem, 3.4cqi, 1.02rem)/1.45 'Cinzel', serif; }
  cite { font-size: 0.72rem; color: rgb(220 232 255 / 0.7); font-style: normal; letter-spacing: 0.06em; }
  .row { display: flex; gap: 0.4rem; flex-wrap: wrap; justify-content: center; }
  .row button { display: inline-flex; align-items: center; gap: 0.35rem; }
  .bhz { font-family: 'Ma Shan Zheng', serif; font-size: 1.1rem; line-height: 1; }
  .wait { margin: 0; font-size: 0.85rem; color: var(--accent); }
  @container (max-width: 330px) {
    .scroll { padding: 0.6rem; gap: 0.35rem; }
    blockquote p { min-height: 0; }
  }
</style>
