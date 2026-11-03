<script lang="ts">
  // Ink mural painted on the gate that veils an idle board, one scene per realm, drawn in the
  // realm's accent so it follows the theme.
  let { realm }: { realm: string } = $props();
</script>

<svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <g class="ink">
    {#if realm === 'frost'}
      <circle cx="150" cy="44" r="18" class="wash" />
      <path class="hill" d="M0 168 38 108l14 16 34-62 30 54 14-18 30 40 18-22 22 34V200H0Z" />
      <path d="M78 76l8-14 8 15M44 116l8-8 6 9M138 112l12-14 8 12" />
      <path class="hill far" d="M0 186 30 160l26 14 40-26 34 22 30-18 40 28V200H0Z" />
      <path d="M22 186v-12m-6 6 6-12 6 12m-10-4 4-8 4 8M178 190v-10m-5 5 5-10 5 10" />
    {:else if realm === 'autumn'}
      <circle cx="56" cy="62" r="20" class="wash" />
      <path class="hill far" d="M0 170c30-16 54-18 80-8s52 4 72-10 34-8 48 0V200H0Z" />
      <path d="M150 196c0-30-4-52 8-78m-4 30c-14-6-22-14-26-24m26 4c10-8 22-10 32-8" />
      <g class="wash">
        <circle cx="128" cy="90" r="14" /><circle cx="150" cy="78" r="18" /><circle cx="174" cy="94" r="15" /><circle cx="160" cy="104" r="12" />
      </g>
      <path d="M60 120l3 4-3 4-3-4zM90 140l3 4-3 4-3-4zM40 150l3 4-3 4-3-4zM110 110l3 4-3 4-3-4z" />
    {:else if realm === 'volcano'}
      <path class="hill" d="M10 200 74 92h40l66 108Z" />
      <ellipse cx="94" cy="92" rx="20" ry="4" class="wash" />
      <path d="M86 84c-8-14 6-20 0-34s8-18 4-30M104 82c8-10-2-18 8-28s0-18 8-24" />
      <path d="M90 96c-4 20 4 34-6 56M100 96c6 22-2 40 10 62" />
      <path class="hill far" d="M0 182c40-8 60 4 100-4s70 8 100 0V200H0Z" />
    {:else if realm === 'spring'}
      <circle cx="148" cy="52" r="22" class="wash" />
      <path d="M0 70c40 6 70 24 92 52m-48-30c10-14 24-20 40-20M70 104c-2 18 6 30 20 40" />
      <g class="wash">
        <circle cx="44" cy="90" r="5" /><circle cx="84" cy="72" r="5" /><circle cx="92" cy="122" r="6" /><circle cx="70" cy="104" r="4" /><circle cx="88" cy="142" r="5" /><circle cx="22" cy="74" r="4" />
      </g>
      <path class="hill far" d="M0 180c24-10 50-12 74-4s46 8 70-2 40-6 56 0V200H0Z" />
      <path d="M120 186h40m-34-8h28m-22-8h16" />
    {:else if realm === 'rain'}
      <path d="M100 48l-6 10h12zM60 92q40-16 80 0M72 92v26m56-26v26M52 118q48-18 96 0M66 118v28m68-28v28" />
      <path class="hill" d="M58 146h84v10H58z" />
      <path d="M0 160q25-8 50 0t50 0 50 0 50 0M0 176q25-8 50 0t50 0 50 0 50 0M0 192q25-8 50 0t50 0 50 0 50 0" />
      <path class="rain" d="M20 10l-8 30M48 30l-8 30M150 14l-8 30M180 40l-8 30M120 4l-6 22M30 60l-6 22" />
    {:else if realm === 'night'}
      <path class="wash" d="M152 30a22 22 0 1 0 14 38 18 18 0 1 1-14-38Z" />
      <path d="M58 200V96m84 104V96M44 96h112M50 82h100q8 0 12-8M50 82q-8 0-12-8M52 112h96" />
      <path class="hill" d="M86 96h28v16H86z" />
      <path d="M40 160c-6-10 4-16 0-24M170 150c-6-10 4-16 0-24M100 176c-6-10 4-16 0-24" />
      <path class="hill far" d="M0 188q50-10 100 0t100 0V200H0Z" />
    {:else}
      <circle cx="100" cy="70" r="22" class="wash" />
      <path d="M100 30v-12M100 122v-12M60 70H48M152 70h-12M72 42l-8-8M128 98l8 8M128 42l8-8M72 98l-8 8" />
      <path class="hill far" d="M0 140h38l10-12h34l8 12h110V200H0Z" />
      <path d="M0 158l30 6 24-10 30 14 26-8 34 12 26-6 30 8M10 180l28-8 24 14 34-10 30 12 40-8 34 10" />
    {/if}
  </g>
</svg>

<style>
  svg { position: absolute; inset: 0; width: 100%; height: 100%; }
  .ink {
    fill: none;
    stroke: var(--accent);
    stroke-width: 1.2;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.55;
  }
  .wash, .wash circle { fill: var(--accent); fill-opacity: 0.16; stroke-opacity: 0.5; }
  .hill { fill: var(--accent); fill-opacity: 0.1; }
  .hill.far { fill-opacity: 0.06; stroke-opacity: 0.5; }
  .rain { stroke-opacity: 0.5; }
</style>
