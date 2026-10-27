<script lang="ts">
  import { game } from '../game.svelte';
  import { REALMS } from '../realms';
  import { settings } from '../settings.svelte';

  function choose(id: string) {
    settings.realm = id;
    if (id !== 'random') game.setRealm(id);
    game.persist();
  }
</script>

<section>
  <button class="realm random" class:on={settings.realm === 'random'} onclick={() => choose('random')}>
    <span class="hz" title="Fate">命<em>Fate</em></span>
    <span class="txt"><b>Wandering Fate</b><small>A random realm every match</small></span>
  </button>
  {#each REALMS as r}
    <button
      class="realm"
      class:on={settings.realm === r.id}
      class:here={game.realm.id === r.id}
      onclick={() => choose(r.id)}
      style:--a={r.vars['--accent']}
      style:--b1={r.vars['--bg1']}
      style:--b2={r.vars['--bg3']}
      style:--l={r.vars['--light']}
      style:--d={r.vars['--dark']}
      style:--t={r.vars['--ink']}
    >
      <span class="hz" class:long={r.hanzi.length > 2} title={r.meaning}>{r.hanzi}<em>{r.meaning}</em></span>
      <span class="txt"><b>{r.name}</b><small>{r.season} · {r.tagline}</small></span>
      <span class="mini" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
    </button>
  {/each}
  {#if settings.realm === 'random'}
    <p class="note">Now wandering through <b>{game.realm.name}</b>. Pick a realm to stay there.</p>
  {/if}
</section>

<style>
  section { display: grid; gap: 0.45rem; }
  .realm {
    all: unset;
    cursor: pointer;
    display: grid;
    grid-template-columns: 3.2rem 1fr auto;
    align-items: center;
    gap: 0.6rem;
    padding: 0.5rem 0.7rem;
    border-radius: 10px;
    background: linear-gradient(110deg, var(--b1, var(--bg1)) 0%, var(--b2, var(--bg2)) 140%);
    border: 1px solid transparent;
    color: var(--t, var(--ink));
    position: relative;
    transition: transform 0.15s, border-color 0.2s;
  }
  .realm:hover { transform: translateX(3px); }
  .realm:focus-visible { outline: 2px solid var(--accent); }
  .realm.on { border-color: var(--a, var(--accent)); box-shadow: 0 0 18px -6px var(--a, var(--accent)); }
  .realm.random { background: color-mix(in srgb, var(--ink) 8%, transparent); color: var(--ink); }
  .hz { font-family: 'Ma Shan Zheng', serif; font-size: 1.7rem; color: var(--a, var(--accent)); text-align: center; white-space: nowrap; line-height: 1; }
  .hz.long { font-size: 1.15rem; }
  .hz em { display: block; font: 600 0.5rem/1.1 system-ui, sans-serif; font-style: normal; color: var(--t, var(--muted)); opacity: 0.75; margin-top: 0.15rem; white-space: normal; }
  .txt { display: grid; min-width: 0; }
  .txt b { font-family: 'Cinzel', serif; font-size: 0.92rem; }
  .txt small { font-size: 0.72rem; opacity: 0.8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mini { display: grid; grid-template-columns: repeat(2, 10px); border-radius: 3px; overflow: hidden; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.3); }
  .mini i { width: 10px; height: 10px; background: var(--l); }
  .mini i:nth-child(2), .mini i:nth-child(3) { background: var(--d); }
  .note { margin: 0.2rem 0 0; font-size: 0.8rem; color: var(--muted); text-align: center; }
</style>
