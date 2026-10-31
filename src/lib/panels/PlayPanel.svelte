<script lang="ts">
  import qrcode from 'qrcode-generator';
  import type { Mode } from '../db';
  import { LEVEL_NAMES } from '../engine';
  import { game } from '../game.svelte';
  import { decodeSignal, isReply, type Rival } from '../lan';
  import QrScanner from '../QrScanner.svelte';
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
  /** Guest has opened an invite (the reply may be empty for a one-step invite). */
  let joined = $state(false);
  let scanning = $state<'' | 'reply' | 'invite'>('');
  /** Name of the remembered rival the open invite was made for. */
  let quickFor = $state('');

  $effect(() => {
    if (joinCode) {
      mode = 'lan';
      lanRole = 'join';
      input = joinCode;
      joined = false;
      reply = '';
    }
  });

  const CLOCKS: { id: string; label: string; clock: { base: number; inc: number } | null }[] = [
    { id: 'none', label: 'Untimed', clock: null },
    { id: '1+0', label: '1 min', clock: { base: 1, inc: 0 } },
    { id: '3+2', label: '3 + 2', clock: { base: 3, inc: 2 } },
    { id: '5+0', label: '5 min', clock: { base: 5, inc: 0 } },
    { id: '10+5', label: '10 + 5', clock: { base: 10, inc: 5 } },
    { id: '15+10', label: '15 + 10', clock: { base: 15, inc: 10 } },
    { id: '30+0', label: '30 min', clock: { base: 30, inc: 0 } },
  ];
  const clockId = $derived(settings.rules.clock ? `${settings.rules.clock.base}+${settings.rules.clock.inc}` : 'none');
  function setClock(id: string) {
    settings.rules.clock = CLOCKS.find((c) => c.id === id)?.clock ?? null;
  }

  const here = `${location.origin}${location.pathname}`;
  const inviteLink = $derived(invite ? `${here}#join=${invite}` : '');
  const replyLink = $derived(reply ? `${here}#reply=${reply}` : '');

  function qrOf(text: string) {
    if (!text) return '';
    try {
      const qr = qrcode(0, 'M'); // codes are short now, so spend the room on error correction
      qr.addData(text);
      qr.make();
      return qr.createSvgTag({ cellSize: 3, margin: 3, scalable: true });
    } catch {
      return ''; // too long for a QR code
    }
  }
  const qrSvg = $derived(qrOf(inviteLink));
  const replyQr = $derived(qrOf(replyLink));

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

  const host = (rival?: Rival) => run(async () => {
    reply = '';
    scanning = '';
    quickFor = rival?.name ?? '';
    invite = await game.hostLan(color, rival);
  });
  const connect = (code = input) => run(async () => { await game.acceptReply(code); input = ''; scanning = ''; });
  const join = (code = input) => run(async () => {
    reply = (await game.joinLan(code)) ?? '';
    joined = true;
    scanning = '';
    history.replaceState(null, '', location.pathname);
  });
  function leave() {
    game.leaveLan();
    invite = '';
    reply = '';
    joined = false;
  }

  async function pasteReply() {
    error = '';
    try {
      const text = await navigator.clipboard.readText();
      if (await isReply(text)) connect(text);
      else error = "The clipboard doesn't hold a reply code yet.";
    } catch {
      error = 'Clipboard blocked. Paste into the box below instead.';
    }
  }

  // Once clipboard access is granted (Chrome remembers it), coming back to this tab with a
  // copied reply connects straight away.
  $effect(() => {
    if (!game.awaitingReply) return;
    let tried = '';
    const check = async () => {
      try {
        const perm = await navigator.permissions.query({ name: 'clipboard-read' as PermissionName });
        if (perm.state !== 'granted') return;
        const text = await navigator.clipboard.readText();
        if (text === tried || !(await isReply(text))) return;
        tried = text;
        await game.acceptReply(text);
      } catch { /* not supported, not focused, or a stale reply */ }
    };
    check();
    addEventListener('focus', check);
    return () => removeEventListener('focus', check);
  });

  /** What a scanned QR holds: 'offer', 'answer', or null for something else. */
  async function kindOf(text: string) {
    try { return (await decodeSignal(text)).desc.type ?? null; } catch { return null; }
  }

  async function scannedReply(text: string) {
    const kind = await kindOf(text);
    if (kind === 'offer') return "That's your own invite. Scan the reply on the guest's screen.";
    if (kind !== 'answer') return "That QR isn't a duel code.";
    await connect(text);
    return true;
  }

  async function scannedInvite(text: string) {
    const kind = await kindOf(text);
    if (kind === 'answer') return "That's a reply code. The host scans it, not the guest.";
    if (kind !== 'offer') return "That QR isn't a duel code.";
    await join(text);
    return true;
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      copied = what;
      setTimeout(() => (copied = ''), 1500);
    } catch {
      error = 'Clipboard blocked — select the text and copy it manually.';
    }
  }

  async function share(title: string, url: string) {
    try { await navigator.share({ title, url }); } catch { /* cancelled */ }
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

  {#if !(mode === 'lan' && lanRole === 'join')}
    <fieldset class="rules">
      <legend>Rules</legend>
      <label class="clock">
        <span>Clock</span>
        <select value={clockId} onchange={(e) => setClock(e.currentTarget.value)}>
          {#each CLOCKS as c}<option value={c.id}>{c.label}</option>{/each}
        </select>
      </label>
      {#if mode !== 'lan'}
        <label class="check"><input type="checkbox" bind:checked={settings.rules.hints} /> Allow hints</label>
        <label class="check"><input type="checkbox" bind:checked={settings.rules.undo} /> Allow takebacks</label>
      {/if}
      {#if mode === 'local'}
        <label class="check"><input type="checkbox" bind:checked={settings.rules.flip} /> Turn the board to whoever moves</label>
      {/if}
      {#if mode === 'lan'}<small>Clock is shared with your rival. Hints and takebacks are off in LAN duels.</small>{/if}
    </fieldset>
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
        <button class="primary" disabled={busy} onclick={() => host()}>Create invite</button>
        {#if game.rivals.length}
          <div class="rivals">
            <small>Rivals you've duelled join with just the link, with no reply:</small>
            {#each game.rivals as r (r.fp)}
              <div class="rival">
                <button disabled={busy} onclick={() => host(r)}>Invite {r.name}</button>
                <button class="x" title="Forget {r.name}" aria-label="Forget {r.name}" onclick={() => game.forgetRival(r.fp)}>✕</button>
              </div>
            {/each}
          </div>
        {/if}
      {:else if game.linkState !== 'open'}
        <ol>
          <li>
            {#if game.quickInvite}
              Send this to <b>{quickFor}</b>. Once they open it, you're connected, with no reply needed.
            {:else}
              Send this invite to the other device: scan the QR, open the link, or paste the code.
            {/if}
          </li>
        </ol>
        {#if qrSvg}<div class="qr">{@html qrSvg}</div>{/if}
        <div class="row">
          <button onclick={() => copy(inviteLink, 'link')}>{copied === 'link' ? 'Copied!' : 'Copy link'}</button>
          <button onclick={() => copy(invite, 'code')}>{copied === 'code' ? 'Copied!' : 'Copy code'}</button>
          {#if 'share' in navigator}<button onclick={() => share('Chess duel invite', inviteLink)}>Share</button>{/if}
        </div>
        {#if game.quickInvite}
          <button disabled={busy} onclick={() => host()}>Use a regular invite instead</button>
        {:else}
          <ol start="2"><li>Get their reply: scan it, open their reply link in this browser, or paste it.</li></ol>
          {#if scanning === 'reply'}
            <QrScanner onresult={scannedReply} oncancel={() => (scanning = '')} />
          {:else}
            <div class="row">
              <button onclick={() => (scanning = 'reply')}>📷 Scan reply</button>
              <button onclick={pasteReply}>📋 Paste reply</button>
            </div>
          {/if}
          <textarea bind:value={input} rows="2" placeholder="…or paste the reply code here"></textarea>
          <button class="primary" disabled={busy || !input.trim()} onclick={() => connect()}>Connect</button>
        {/if}
      {:else}
        <button onclick={leave}>Leave duel</button>
      {/if}
    {:else}
      {#if !joined || game.linkState === 'closed' || game.linkState === 'failed'}
        {#if scanning === 'invite'}
          <QrScanner onresult={scannedInvite} oncancel={() => (scanning = '')} />
        {:else}
          <textarea bind:value={input} rows="3" placeholder="Paste invite code or link"></textarea>
          <div class="row">
            <button class="primary" disabled={busy || !input.trim()} onclick={() => join()}>Join</button>
            <button onclick={() => (scanning = 'invite')}>📷 Scan invite</button>
          </div>
        {/if}
      {:else if game.linkState !== 'open'}
        {#if reply}
          <p>Send this reply back to the host:</p>
          {#if replyQr}<div class="qr big">{@html replyQr}</div>{/if}
          <small class="hint">Host on a phone? They tap <b>Scan reply</b> and point it here. On a computer, send the link; they just click it.</small>
          <div class="row">
            <button onclick={() => copy(replyLink, 'reply-link')}>{copied === 'reply-link' ? 'Copied!' : 'Copy link'}</button>
            <button onclick={() => copy(reply, 'reply')}>{copied === 'reply' ? 'Copied!' : 'Copy code'}</button>
            {#if 'share' in navigator}<button onclick={() => share('Chess duel reply', replyLink)}>Share</button>{/if}
          </div>
        {:else}
          <p>This invite was made for this device, so no reply is needed.</p>
        {/if}
        <button onclick={leave}>Cancel</button>
      {:else}
        <button onclick={leave}>Leave duel</button>
      {/if}
    {/if}

    {#if error}<p class="error">{error}</p>{/if}
    <details>
      <summary>How LAN duels work</summary>
      <p>
        The two browsers talk directly over WebRTC — no server, no account. Both devices should be on the same network.
        Codes are single-use; create a new invite if a connection drops. If devices can't find each other, try
        enabling the public STUN helper in Settings. After your first duel, each device remembers the other, so
        next time the host can invite you by name and the link alone connects you.
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
  .rules {
    display: grid;
    gap: 0.45rem;
    margin: 0;
    padding: 0.6rem 0.75rem 0.7rem;
    border: 1px solid var(--panel-border);
    border-radius: 10px;
    font-size: 0.88rem;
  }
  .rules legend { padding: 0 0.3rem; font: 600 0.78rem 'Cinzel', serif; color: var(--muted); letter-spacing: 0.08em; }
  .rules .clock { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; }
  .rules select {
    background: color-mix(in srgb, var(--bg1) 60%, transparent);
    color: var(--ink);
    border: 1px solid var(--panel-border);
    border-radius: 8px;
    padding: 0.3rem 0.5rem;
    font: inherit;
  }
  .rules select option { background: var(--bg1); color: var(--ink); }
  .rules .check { display: flex; align-items: center; gap: 0.5rem; cursor: pointer; }
  .rules input[type='checkbox'] { accent-color: var(--accent); width: 1rem; height: 1rem; }
  .rules small { color: var(--muted); font-size: 0.76rem; }
  .row { display: flex; gap: 0.4rem; flex-wrap: wrap; }
  .row button { flex: 1; }
  ol { margin: 0; padding-left: 1.2rem; font-size: 0.88rem; }
  .qr { background: #fff; border-radius: 8px; padding: 4px; width: min(220px, 70%); justify-self: center; }
  .qr.big { width: min(300px, 92%); }
  .hint { color: var(--muted); font-size: 0.78rem; }
  .rivals { display: grid; gap: 0.35rem; }
  .rivals small { color: var(--muted); font-size: 0.78rem; }
  .rival { display: flex; gap: 0.35rem; }
  .rival button:first-child { flex: 1; }
  .rival .x { padding-inline: 0.6rem; }
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
