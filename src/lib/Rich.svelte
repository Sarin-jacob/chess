<script lang="ts">
  // Review text with its glossary terms linked (when the glossary is on).
  import { glossaryParts, TERMS } from './glossary';
  import { settings } from './settings.svelte';

  let { text }: { text: string } = $props();
</script>

{#each glossaryParts(text) as part}
  {#if 'term' in part}
    {#if settings.glossary && TERMS[part.term]}<a class="term" href={TERMS[part.term].url} target="_blank" rel="noopener" title={TERMS[part.term].def}>{part.shown}</a>{:else}{part.shown}{/if}
  {:else}{part.text}{/if}
{/each}

<style>
  .term { color: var(--accent); text-decoration: underline dotted; text-underline-offset: 3px; }
</style>
