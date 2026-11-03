<script lang="ts">
  // A heart demon trial under the board: where the position came from, the verdict on each try,
  // and the way on to the next demon.
  import { trials } from './trials.svelte';

  const TONE: Record<string, string> = { right: '#3fae55', close: '#e6c14f', wrong: '#e5484d', shown: '#94a0b4' };
  const date = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const slain = $derived(trials.demons.length - trials.waiting.length);

  function next() {
    const d = trials.another();
    if (d) trials.face(d);
  }
</script>

{#if trials.active}
  {@const t = trials.active}
  {@const d = t.demon}
  <section class="trial" style:--tone={TONE[t.status] ?? 'var(--accent)'} aria-label="Heart demon trial">
    <header>
      <span class="hz" title="心魔: heart demon">心魔</span>
      <div>
        <b>Heart Demon</b>
        <small>From {d.game.title} · {date(d.game.date)} · {d.played} was played there</small>
      </div>
      <button class="x" onclick={() => trials.leave()} aria-label="Leave the trial" title="Leave the trial">✕</button>
    </header>
    <p class="text" class:busy={t.status === 'checking'}>{t.text}</p>
    <div class="ctl">
      {#if t.status === 'wrong' || t.status === 'close' || t.status === 'shown'}<button onclick={() => trials.again()}>↺ Try again</button>{/if}
      {#if t.status === 'move' || t.status === 'wrong' || t.status === 'close'}<button onclick={() => trials.reveal()}>Reveal</button>{/if}
      <button class="primary" onclick={next} disabled={!trials.waiting.some((x) => x.id !== d.id)}>Next demon ↦</button>
    </div>
    <small class="tally">{trials.waiting.length} {trials.waiting.length === 1 ? 'demon awaits' : 'demons await'} · {slain} slain</small>
  </section>
{/if}

<style>
  .trial {
    display: grid;
    gap: 0.45rem;
    padding: 0.55rem 0.6rem;
    border-radius: 10px;
    background: var(--panel);
    border: 1px solid var(--panel-border);
    border-left: 3px solid var(--tone);
    backdrop-filter: blur(8px);
  }
  header { display: flex; align-items: center; gap: 0.5rem; }
  header div { display: grid; flex: 1; min-width: 0; }
  header b { font: 700 0.95rem 'Cinzel', serif; }
  header small, .tally { color: var(--muted); font-size: 0.74rem; }
  .hz { font-family: 'Ma Shan Zheng', serif; font-size: 1.5rem; line-height: 1; color: #c86be0; text-shadow: 0 0 10px rgba(200, 107, 224, 0.5); }
  .x { padding: 0.2rem 0.5rem; }
  .text { margin: 0; font-size: 0.9rem; }
  .text.busy { color: var(--muted); font-style: italic; }
  .ctl { display: flex; gap: 0.3rem; flex-wrap: wrap; }
  .ctl button { flex: 1; white-space: nowrap; }
  .tally { text-align: center; }
</style>
