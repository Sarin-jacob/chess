<script lang="ts">
  import { PIECE_SETS, pieceImages } from '../pieceSets';
  import { GLOSSARY } from '../realms';
  import { randomName } from '../names';
  import { settings } from '../settings.svelte';

  const toggles: { key: 'sound' | 'haptics' | 'particles' | 'coords' | 'outlines' | 'useStun' | 'view3d' | 'keepAwake' | 'evalBar' | 'glossary'; label: string; hint: string }[] = [
    { key: 'sound', label: 'Sound', hint: 'Wood knocks and temple bells' },
    { key: 'haptics', label: 'Haptics', hint: 'Vibrate on moves (supported phones)' },
    { key: 'particles', label: 'Weather', hint: 'Snow, embers, petals and friends' },
    { key: 'view3d', label: 'Immersive 3D view', hint: 'Realm-carved 3D pieces with fixed camera angles (uses more battery)' },
    { key: 'coords', label: 'Coordinates', hint: 'Files and ranks on the board' },
    { key: 'outlines', label: 'Piece outlines', hint: 'A contrasting edge so pieces stand out on any square' },
    { key: 'evalBar', label: 'Advantage bar', hint: 'Who is ahead, as the engine sees it, in pawns' },
    { key: 'glossary', label: 'Glossary in reviews', hint: 'Explain chess terms, with links to read more' },
    { key: 'keepAwake', label: 'Keep screen awake', hint: 'Stops the phone dimming mid-match' },
    { key: 'useStun', label: 'Public STUN for LAN', hint: 'Helps devices find each other; needs internet' },
  ];
</script>

<section>
  <label class="name">
    <span>Your name</span>
    <span class="row">
      <input bind:value={settings.name} oninput={() => (settings.nameAuto = false)} maxlength="24" />
      <button type="button" onclick={() => { settings.name = randomName(settings.name); settings.nameAuto = true; }} title="Draw a new random name">🎲</button>
    </span>
    {#if settings.nameAuto}<small>Random name — it changes by itself if a LAN rival has the same one.</small>{/if}
  </label>
  <div class="sets">
    <span><b>Pieces</b><small>{PIECE_SETS.find((p) => p.id === settings.pieceSet)?.hint}</small></span>
    <div class="set-row" role="radiogroup" aria-label="Piece set">
      {#each PIECE_SETS as p}
        {@const img = pieceImages(p.id)}
        <button type="button" role="radio" aria-checked={settings.pieceSet === p.id} class:on={settings.pieceSet === p.id} onclick={() => (settings.pieceSet = p.id)}>
          <span class="preview"><img src={img.wk} alt="" /><img src={img.bn} alt="" /></span>
          {p.name}
        </button>
      {/each}
    </div>
  </div>
  {#each toggles as t}
    <label class="toggle">
      <span><b>{t.label}</b><small>{t.hint}</small></span>
      <input type="checkbox" bind:checked={settings[t.key]} />
    </label>
  {/each}
  <details class="glossary">
    <summary>Glyph glossary (Chinese → English)</summary>
    <dl>
      {#each GLOSSARY as [hz, en]}
        <dt>{hz}</dt><dd>{en}</dd>
      {/each}
    </dl>
  </details>
  <!-- Not every path is on the map. -->
  <a class="stray" href="#/heresy" title="A path not on any map">
    <span class="miasma" aria-hidden="true"><i></i><i></i><i></i></span>
    <span class="crack" aria-hidden="true"></span>
    <span class="hz">邪</span>
    <span class="whisper">Stray from the orthodox path…</span>
  </a>
</section>

<style>
  section { display: grid; gap: 0.5rem; }
  .name { display: grid; gap: 0.3rem; font-size: 0.85rem; color: var(--muted); }
  .name .row { display: flex; gap: 0.4rem; }
  .name .row input { flex: 1; min-width: 0; }
  .name small { font-size: 0.72rem; }
  .name input {
    font: inherit;
    color: var(--ink);
    background: color-mix(in srgb, var(--bg1) 60%, transparent);
    border: 1px solid var(--panel-border);
    border-radius: 8px;
    padding: 0.45rem 0.6rem;
  }
  .toggle { display: flex; align-items: center; justify-content: space-between; gap: 1rem; cursor: pointer; padding: 0.3rem 0; }
  .toggle span { display: grid; }
  .toggle small { color: var(--muted); font-size: 0.75rem; }
  .toggle input { width: 1.1rem; height: 1.1rem; accent-color: var(--accent); }
  .sets { display: grid; gap: 0.4rem; padding: 0.3rem 0; }
  .sets > span { display: grid; }
  .sets small { color: var(--muted); font-size: 0.75rem; }
  .set-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.4rem; }
  .set-row button {
    display: grid;
    justify-items: center;
    gap: 0.2rem;
    padding: 0.4rem 0.2rem;
    font: inherit;
    font-size: 0.78rem;
    color: var(--ink);
    background: color-mix(in srgb, var(--bg1) 45%, transparent);
    border: 1px solid var(--panel-border);
    border-radius: 8px;
    cursor: pointer;
  }
  .set-row button.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent) inset; }
  .preview { display: flex; padding: 0.25rem; border-radius: 6px; background: linear-gradient(90deg, var(--light) 50%, var(--dark) 50%); }
  .preview img { width: 30px; height: 30px; }
  .stray {
    position: relative;
    isolation: isolate;
    justify-self: center;
    display: grid;
    justify-items: center;
    gap: 0.15rem;
    margin-top: 0.6rem;
    padding: 0.3rem 1rem;
    color: inherit;
    text-decoration: none;
    opacity: 0.22;
    transition: opacity 0.6s;
  }
  .stray .hz { font-family: 'Ma Shan Zheng', serif; font-size: 1.3rem; line-height: 1; color: var(--muted); transition: color 0.6s, text-shadow 0.6s; }
  .stray .crack { width: 3rem; height: 1px; background: linear-gradient(90deg, transparent, var(--muted), transparent); }
  .stray .whisper { font: italic 0.7rem 'Cinzel', serif; letter-spacing: 0.15em; color: var(--muted); max-height: 0; overflow: hidden; transition: max-height 0.6s; }
  .stray:hover, .stray:focus-visible { opacity: 1; }
  .stray:hover .hz, .stray:focus-visible .hz { color: #e5484d; text-shadow: 0 0 14px rgba(229, 72, 77, 0.8); }
  .stray:hover .whisper, .stray:focus-visible .whisper { max-height: 1.2rem; }
  .miasma { position: absolute; inset: -0.8rem -1.5rem; z-index: -1; pointer-events: none; display: none; }
  .miasma i {
    position: absolute;
    width: 5.5rem;
    height: 3.6rem;
    border-radius: 50%;
    filter: blur(14px);
    opacity: 0.75;
    animation: seep 7s ease-in-out infinite alternate;
  }
  .miasma i:nth-child(1) { left: 10%; top: 20%; background: #7d3cc8; }
  .miasma i:nth-child(2) { right: 8%; top: 30%; background: #2f9e5e; animation-duration: 9s; animation-delay: -3s; }
  .miasma i:nth-child(3) { left: 35%; top: 5%; background: #b0283a; animation-duration: 11s; animation-delay: -6s; }
  @keyframes seep {
    0% { transform: translate(0, 0) scale(0.9); }
    50% { transform: translate(0.6rem, -0.3rem) scale(1.15); }
    100% { transform: translate(-0.5rem, 0.3rem) scale(1); }
  }
  /* Touch screens can't hover to find the path, so the miasma seeps out to beckon instead. */
  @media (hover: none) {
    .stray { opacity: 0.9; padding: 0.7rem 1.4rem; }
    .stray .miasma { display: block; }
    .stray .hz { color: #e8b4ff; text-shadow: 0 0 12px rgba(160, 80, 220, 0.9); font-size: 1.6rem; animation: pulse-glyph 4s ease-in-out infinite; }
    .stray .whisper { max-height: 1.2rem; color: color-mix(in srgb, var(--ink) 75%, transparent); }
  }
  @keyframes pulse-glyph { 50% { text-shadow: 0 0 22px rgba(200, 90, 255, 1), 0 0 4px rgba(255, 255, 255, 0.6); } }
  @media (prefers-reduced-motion: reduce) { .miasma i, .stray .hz { animation: none !important; } }
  .glossary { font-size: 0.85rem; margin-top: 0.4rem; }
  .glossary summary { cursor: pointer; color: var(--muted); }
  .glossary dl { display: grid; grid-template-columns: auto 1fr; gap: 0.3rem 0.8rem; margin: 0.6rem 0 0; align-items: center; }
  .glossary dt { font-family: 'Ma Shan Zheng', serif; font-size: 1.3rem; color: var(--accent); }
  .glossary dd { margin: 0; }
</style>
