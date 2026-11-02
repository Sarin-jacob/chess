<script lang="ts">
  // Invite, join and reply for a heterodox LAN duel: the same codes, QRs and links as the
  // orthodox duels, but the invite link opens the Heterodox Paths.
  import qrcode from 'qrcode-generator';
  import { untrack } from 'svelte';
  import { decodeSignal, isReply, rivals, type LinkState, type Rival } from '../lan';
  import QrScanner from '../QrScanner.svelte';

  let {
    invite, reply, joined, quickFor, linkState, error, busy, awaiting, joinCode = '', fixedRole,
    onhost, onjoin, onaccept, onleave,
  }: {
    invite: string;
    reply: string;
    joined: boolean;
    quickFor: string;
    linkState: LinkState;
    error: string;
    busy: boolean;
    /** The host is waiting on a reply code. */
    awaiting: boolean;
    joinCode?: string;
    /** Only offer this side (joining from an invite link). */
    fixedRole?: 'host' | 'join';
    onhost: (rival?: Rival) => void;
    onjoin: (code: string) => void;
    onaccept: (code: string) => void;
    onleave: () => void;
  } = $props();

  // The starting side only; the switch below changes it after that.
  let role = $state<'host' | 'join'>(untrack(() => fixedRole ?? (joinCode ? 'join' : 'host')));
  let input = $state('');
  let scanning = $state<'' | 'reply' | 'invite'>('');
  let copied = $state('');
  let note = $state('');
  const known = rivals();

  // An invite link opened straight onto this page joins at once.
  let usedCode = '';
  $effect(() => {
    if (joinCode && joinCode !== usedCode) {
      usedCode = joinCode;
      role = 'join';
      onjoin(joinCode);
    }
  });

  const here = `${location.origin}${location.pathname}`;
  const inviteLink = $derived(invite ? `${here}#/heresy?join=${invite}` : '');
  const replyLink = $derived(reply ? `${here}#reply=${reply}` : '');

  function qrOf(text: string) {
    if (!text) return '';
    try {
      const qr = qrcode(0, 'M');
      qr.addData(text);
      qr.make();
      return qr.createSvgTag({ cellSize: 3, margin: 3, scalable: true });
    } catch {
      return '';
    }
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      copied = what;
      setTimeout(() => (copied = ''), 1500);
    } catch { /* blocked */ }
  }

  async function share(url: string) {
    if (navigator.share) navigator.share({ title: 'A heterodox duel awaits', url }).catch(() => {});
    else copy(url, 'link');
  }

  async function paste() {
    note = '';
    try {
      const text = await navigator.clipboard.readText();
      if (await isReply(text)) onaccept(text);
      else note = "The clipboard doesn't hold a reply code yet.";
    } catch {
      note = 'Clipboard blocked. Paste into the box below instead.';
    }
  }

  const kindOf = async (text: string) => { try { return (await decodeSignal(text)).desc.type ?? null; } catch { return null; } };
  async function scannedReply(text: string) {
    const k = await kindOf(text);
    if (k === 'offer') return "That's your own invite. Scan the reply on your rival's screen.";
    if (k !== 'answer') return "That QR isn't a duel code.";
    scanning = '';
    onaccept(text);
    return true;
  }
  async function scannedInvite(text: string) {
    const k = await kindOf(text);
    if (k === 'answer') return "That's a reply code. The host scans it, not the guest.";
    if (k !== 'offer') return "That QR isn't a duel code.";
    scanning = '';
    onjoin(text);
    return true;
  }

  const status: Record<LinkState, string> = {
    idle: '', gathering: 'Gathering paths…', waiting: 'Waiting for your rival…', connecting: 'Connecting…',
    open: 'Connected', closed: 'The link was closed.', failed: 'Could not connect. Are you on the same network?',
  };
</script>

<div class="lan">
  {#if !fixedRole}
  <div class="seg">
    <button class:on={role === 'host'} onclick={() => { role = 'host'; onleave(); }}>Host</button>
    <button class:on={role === 'join'} onclick={() => { role = 'join'; onleave(); }}>Join</button>
  </div>
  {/if}

  {#if role === 'host'}
    {#if !invite}
      <button class="primary" onclick={() => onhost()} disabled={busy}>Create invite</button>
      {#if known.length}
        <div class="rivals">
          <small>Rivals met before join with the link alone:</small>
          {#each known as r}<button onclick={() => onhost(r)} disabled={busy}>Invite {r.name}</button>{/each}
        </div>
      {/if}
    {:else}
      {@const svg = qrOf(inviteLink)}
      {#if svg}<div class="qr">{@html svg}</div>{/if}
      <div class="row">
        <button onclick={() => copy(inviteLink, 'link')}>{copied === 'link' ? 'Copied!' : 'Copy link'}</button>
        <button onclick={() => share(inviteLink)}>Share</button>
      </div>
      {#if quickFor}
        <p class="hint">Send this to {quickFor}. They only have to open it.</p>
      {:else if awaiting}
        <p class="hint">Then get your rival's reply back:</p>
        {#if scanning === 'reply'}
          <QrScanner onresult={scannedReply} oncancel={() => (scanning = '')} />
        {:else}
          <div class="row">
            <button onclick={() => (scanning = 'reply')}>📷 Scan reply</button>
            <button onclick={paste}>📋 Paste reply</button>
          </div>
          <textarea bind:value={input} rows="2" placeholder="…or paste the reply code here"></textarea>
          <button onclick={() => onaccept(input)} disabled={!input.trim() || busy}>Connect</button>
        {/if}
      {/if}
    {/if}
  {:else if !joined || linkState === 'closed' || linkState === 'failed'}
    {#if scanning === 'invite'}
      <QrScanner onresult={scannedInvite} oncancel={() => (scanning = '')} />
    {:else}
      <textarea bind:value={input} rows="2" placeholder="Paste the invite code or link"></textarea>
      <div class="row">
        <button class="primary" onclick={() => onjoin(input)} disabled={!input.trim() || busy}>Join</button>
        <button onclick={() => (scanning = 'invite')}>📷 Scan invite</button>
      </div>
    {/if}
  {:else if reply}
    {@const svg = qrOf(replyLink)}
    <p class="hint">Show this to the host, or send them the link:</p>
    {#if svg}<div class="qr big">{@html svg}</div>{/if}
    <div class="row">
      <button onclick={() => copy(replyLink, 'reply')}>{copied === 'reply' ? 'Copied!' : 'Copy link'}</button>
      <button onclick={() => copy(reply, 'code')}>{copied === 'code' ? 'Copied!' : 'Copy code'}</button>
      <button onclick={() => share(replyLink)}>Share</button>
    </div>
  {:else}
    <p class="hint">This invite was made for this device. No reply needed.</p>
  {/if}

  {#if status[linkState]}<p class="status">{status[linkState]}</p>{/if}
  {#if error || note}<p class="error">{error || note}</p>{/if}
</div>

<style>
  .lan { display: grid; gap: 0.5rem; }
  .seg, .row { display: flex; gap: 0.3rem; flex-wrap: wrap; }
  .seg button, .row button { flex: 1; }
  .seg button { background: transparent; border: 1px solid var(--panel-border); color: var(--ink); }
  .seg button.on { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
  .qr { background: #fff; border-radius: 8px; padding: 4px; width: min(60%, 200px); justify-self: center; }
  .qr.big { width: min(80%, 260px); }
  .qr :global(svg) { display: block; width: 100%; height: auto; }
  textarea {
    font: 0.8rem ui-monospace, monospace;
    color: var(--ink);
    background: color-mix(in srgb, var(--bg1) 60%, transparent);
    border: 1px solid var(--panel-border);
    border-radius: 8px;
    padding: 0.4rem;
    resize: vertical;
  }
  .rivals { display: grid; gap: 0.3rem; }
  .rivals small, .hint, .status { color: var(--muted); font-size: 0.82rem; margin: 0; }
  .status { text-align: center; }
  .error { color: #f87171; font-size: 0.82rem; margin: 0; }
</style>
