<script lang="ts">
  import qrcode from 'qrcode-generator';
  import type { Mode } from '../db';
  import { LEVEL_NAMES } from '../engine';
  import { game } from '../game.svelte';
  import { settings } from '../settings.svelte';

  let { joinCode = '' }: { joinCode?: string } = $props();

  let mode = $state<Mode>(game.mode);
  let color = $state<'w' | 'b' | 'random'>('random');
  let lanRole = $state<'host' | 'join'>('host');
  let invite = $state('');
  let reply = $state('');
  let input = $state('');
  let busy = $state(false);
  let error = $state('');
  let copied = $state('');

  $effect(() => {
    if (joinCode) {
      mode = 'lan';
      lanRole = 'join';
      input = joinCode;
    }
  });

  const inviteLink = $derived(invite ? `${location.origin}${location.pathname}#join=${invite}` : '');
  const qrSvg = $derived.by(() => {
    if (!inviteLink) return '';
    try {
      const qr = qrcode(0, 'L');
      qr.addData(inviteLink);
      qr.make();
      return qr.createSvgTag({ cellSize: 3, margin: 3, scalable: true });
    } catch {
      return ''; // too long for a QR code
    }
  });

  function start() {
    game.leaveLan();
    game.newGame({ mode, color, level: settings.level });
  }

  async function run(fn: () => Promise<void>) {
    busy = true;
    error = '';
    try {
      await fn();
    } catch (e) {
      console.error(e);
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  const host = () => run(async () => { reply = ''; invite = await game.hostLan(color); });
  const connect = () => run(async () => { await game.acceptReply(input); input = ''; });
  const join = () => run(async () => { reply = await game.joinLan(input); history.replaceState(null, '', location.pathname); });

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      copied = what;
      setTimeout(() => (copied = ''), 1500);
    } catch {
      error = 'Clipboard blocked — select the text and copy it manually.';
    }
  }

  async function share() {
    try { await navigator.share({ title: 'Chess duel invite', url: inviteLink }); } catch { /* cancelled */ }
  }

  const stateText: Record<string, string> = {
    idle: 'Not connected',
    gathering: 'Preparing…',
    waiting: 'Waiting for reply code',
    connecting: 'Connecting…',
    open: 'Connected',
    closed: 'Disconnected',
    failed: 'Connection failed',
  };
</script>

<section>
  <h3>New match</h3>
  <div class="seg" role="radiogroup" aria-label="Mode">
    <button class:on={mode === 'ai'} onclick={() => (mode = 'ai')}>Vs Sect</button>
    <button class:on={mode === 'local'} onclick={() => (mode = 'local')}>Same device</button>
    <button class:on={mode === 'lan'} onclick={() => (mode = 'lan')}>LAN duel</button>
  </div>

  {#if mode !== 'local' && !(mode === 'lan' && lanRole === 'join')}
    <div class="seg small" role="radiogroup" aria-label="Your colour">
      <button class:on={color === 'w'} onclick={() => (color = 'w')}>White</button>
      <button class:on={color === 'random'} onclick={() => (color = 'random')}>Random</button>
      <button class:on={color === 'b'} onclick={() => (color = 'b')}>Black</button>
    </div>
  {/if}

  {#if mode === 'ai'}
    <label class="level">
      <span>Opponent <b>{LEVEL_NAMES[settings.level - 1]}</b> <em>· {settings.level}/8</em></span>
      <input type="range" min="1" max="8" bind:value={settings.level} />
    </label>
  {/if}

  {#if mode !== 'lan'}
    <button class="primary" onclick={start}>Begin match</button>
  {:else}
    <div class="seg small">
      <button class:on={lanRole === 'host'} onclick={() => (lanRole = 'host')}>Host</button>
      <button class:on={lanRole === 'join'} onclick={() => (lanRole = 'join')}>Join</button>
    </div>

    <p class="status" data-state={game.linkState}>
      <span class="dot"></span>{stateText[game.linkState]}{game.opponent ? ` · ${game.opponent}` : ''}
    </p>

    {#if lanRole === 'host'}
      {#if !invite || game.linkState === 'closed' || game.linkState === 'failed'}
        <button class="primary" disabled={busy} onclick={host}>Create invite</button>
      {:else if game.linkState !== 'open'}
        <ol>
          <li>Send this invite to the other device — scan the QR, open the link, or paste the code.</li>
        </ol>
        {#if qrSvg}<div class="qr">{@html qrSvg}</div>{/if}
        <div class="row">
          <button onclick={() => copy(inviteLink, 'link')}>{copied === 'link' ? 'Copied!' : 'Copy link'}</button>
          <button onclick={() => copy(invite, 'code')}>{copied === 'code' ? 'Copied!' : 'Copy code'}</button>
          {#if 'share' in navigator}<button onclick={share}>Share</button>{/if}
        </div>
        <ol start="2"><li>Paste their reply code here:</li></ol>
        <textarea bind:value={input} rows="3" placeholder="Reply code"></textarea>
        <button class="primary" disabled={busy || !input.trim()} onclick={connect}>Connect</button>
      {:else}
        <button onclick={() => { game.leaveLan(); invite = ''; }}>Leave duel</button>
      {/if}
    {:else}
      {#if !reply}
        <textarea bind:value={input} rows="3" placeholder="Paste invite code or link"></textarea>
        <button class="primary" disabled={busy || !input.trim()} onclick={join}>Join</button>
      {:else if game.linkState !== 'open'}
        <p>Send this reply code back to the host:</p>
        <textarea readonly rows="3" value={reply} onfocus={(e) => e.currentTarget.select()}></textarea>
        <div class="row">
          <button onclick={() => copy(reply, 'reply')}>{copied === 'reply' ? 'Copied!' : 'Copy reply'}</button>
          <button onclick={() => { game.leaveLan(); reply = ''; }}>Cancel</button>
        </div>
      {:else}
        <button onclick={() => { game.leaveLan(); reply = ''; }}>Leave duel</button>
      {/if}
    {/if}

    {#if error}<p class="error">{error}</p>{/if}
    <details>
      <summary>How LAN duels work</summary>
      <p>
        The two browsers talk directly over WebRTC — no server, no account. Both devices should be on the same network.
        Codes are single-use; create a new invite if a connection drops. If devices can't find each other, try
        enabling the public STUN helper in Settings.
      </p>
    </details>
  {/if}
</section>

<style>
  section { display: grid; gap: 0.7rem; }
  h3 { margin: 0; }
  .level { display: grid; gap: 0.3rem; font-size: 0.9rem; }
  .level em { color: var(--muted); font-style: normal; }
  .level input { width: 100%; accent-color: var(--accent); }
  textarea {
    width: 100%;
    font: 0.75rem/1.3 ui-monospace, monospace;
    background: color-mix(in srgb, var(--bg1) 60%, transparent);
    color: var(--ink);
    border: 1px solid var(--panel-border);
    border-radius: 8px;
    padding: 0.5rem;
    resize: vertical;
    word-break: break-all;
  }
  .row { display: flex; gap: 0.4rem; flex-wrap: wrap; }
  .row button { flex: 1; }
  ol { margin: 0; padding-left: 1.2rem; font-size: 0.88rem; }
  .qr { background: #fff; border-radius: 8px; padding: 4px; width: min(220px, 70%); justify-self: center; }
  .qr :global(svg) { display: block; width: 100%; height: auto; }
  .status { margin: 0; font-size: 0.85rem; color: var(--muted); display: flex; align-items: center; gap: 0.4rem; }
  .status .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
  .status[data-state='open'] .dot { background: #4ade80; box-shadow: 0 0 8px #4ade80; }
  .status[data-state='waiting'] .dot, .status[data-state='connecting'] .dot, .status[data-state='gathering'] .dot { background: #fbbf24; }
  .status[data-state='failed'] .dot, .status[data-state='closed'] .dot { background: #f87171; }
  .error { color: #f87171; margin: 0; font-size: 0.85rem; }
  details { font-size: 0.82rem; color: var(--muted); }
  details p { margin: 0.4rem 0 0; }
  summary { cursor: pointer; }
</style>
