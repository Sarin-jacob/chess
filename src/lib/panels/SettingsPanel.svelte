<script lang="ts">
  import { GLOSSARY } from '../realms';
  import { settings } from '../settings.svelte';

  const toggles: { key: 'sound' | 'haptics' | 'particles' | 'coords' | 'autoFlip' | 'useStun' | 'view3d'; label: string; hint: string }[] = [
    { key: 'sound', label: 'Sound', hint: 'Wood knocks and temple bells' },
    { key: 'haptics', label: 'Haptics', hint: 'Vibrate on moves (supported phones)' },
    { key: 'particles', label: 'Weather', hint: 'Snow, embers, petals and friends' },
    { key: 'view3d', label: 'Immersive 3D view', hint: 'Walk the realm in 3D; drag to orbit (uses more battery)' },
    { key: 'coords', label: 'Coordinates', hint: 'Files and ranks on the board' },
    { key: 'autoFlip', label: 'Auto-flip', hint: 'Turn the board each move on the same device' },
    { key: 'useStun', label: 'Public STUN for LAN', hint: 'Helps devices find each other; needs internet' },
  ];
</script>

<section>
  <label class="name">
    <span>Your name</span>
    <input bind:value={settings.name} maxlength="24" />
  </label>
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
</section>

<style>
  section { display: grid; gap: 0.5rem; }
  .name { display: grid; gap: 0.3rem; font-size: 0.85rem; color: var(--muted); }
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
  .glossary { font-size: 0.85rem; margin-top: 0.4rem; }
  .glossary summary { cursor: pointer; color: var(--muted); }
  .glossary dl { display: grid; grid-template-columns: auto 1fr; gap: 0.3rem 0.8rem; margin: 0.6rem 0 0; align-items: center; }
  .glossary dt { font-family: 'Ma Shan Zheng', serif; font-size: 1.3rem; color: var(--accent); }
  .glossary dd { margin: 0; }
</style>
