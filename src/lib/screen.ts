// Screen helpers for phones: keep the display awake during a match, and fill the screen
// (browser full screen where allowed, so pulls and swipes can't scroll the page away).

let lock: WakeLockSentinel | null = null;
let wanted = false;

async function acquire() {
  if (!wanted || lock || document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return;
  try {
    lock = await navigator.wakeLock.request('screen');
    lock.addEventListener('release', () => (lock = null));
  } catch { /* low battery, or the browser said no */ }
}

// The browser drops the lock whenever the tab is hidden; take it again on return.
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', acquire);

export const canKeepAwake = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

export function keepAwake(on: boolean) {
  wanted = on;
  if (on) acquire();
  else {
    lock?.release().catch(() => {});
    lock = null;
  }
}

// Switching between the 2D and 3D boards hands full view from one to the other. Leaving and
// re-entering browser full screen in between would fail (the second request has no tap behind
// it) and its exit event would close the new board's full view, so a switch holds it.
let holdUntil = 0;
let exitWanted = false;

/** Keep browser full screen through the next `ms` while one board's full view hands over to another. */
export function holdFullscreen(ms = 1500) {
  holdUntil = performance.now() + ms;
}

/** Ask for browser full screen. Fine to fail: iPhones only allow it for video. */
export function enterFullscreen() {
  exitWanted = false;
  const el = document.documentElement;
  if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
}

export function exitFullscreen() {
  const wait = holdUntil - performance.now();
  if (wait > 0) {
    // Leave only if nothing has taken full view over by the end of the hold.
    exitWanted = true;
    setTimeout(() => { if (exitWanted) exitFullscreen(); }, wait + 10);
    return;
  }
  exitWanted = false;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

/** Call `cb` when the browser leaves full screen (Esc, back gesture). Returns an unsubscribe. */
export function onFullscreenExit(cb: () => void) {
  const h = () => { if (!document.fullscreenElement) cb(); };
  document.addEventListener('fullscreenchange', h);
  return () => document.removeEventListener('fullscreenchange', h);
}
