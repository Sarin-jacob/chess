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

/** Ask for browser full screen. Fine to fail: iPhones only allow it for video. */
export function enterFullscreen() {
  const el = document.documentElement;
  if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
}

export function exitFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

/** Call `cb` when the browser leaves full screen (Esc, back gesture). Returns an unsubscribe. */
export function onFullscreenExit(cb: () => void) {
  const h = () => { if (!document.fullscreenElement) cb(); };
  document.addEventListener('fullscreenchange', h);
  return () => document.removeEventListener('fullscreenchange', h);
}
