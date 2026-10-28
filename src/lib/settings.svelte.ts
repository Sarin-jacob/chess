// Per-device preferences, kept in localStorage.
import type { Rules } from './db';

export interface SettingsData {
  realm: string; // 'random' or a realm id
  sound: boolean;
  haptics: boolean;
  particles: boolean;
  coords: boolean;
  level: number;
  name: string;
  useStun: boolean;
  /** Rules picked for the next match. */
  rules: Rules;
  /** Immersive three.js board instead of the flat one. */
  view3d: boolean;
  view3dAngle: 'player' | 'top' | 'low';
}

const KEY = 'frost-chess:settings';
const DEFAULTS: SettingsData = {
  realm: 'random',
  sound: true,
  haptics: true,
  particles: true,
  coords: true,
  level: 3,
  name: 'Wanderer',
  useStun: true,
  // Turning the board each move suits a phone passed across a table, not a desktop screen.
  rules: { hints: true, undo: true, clock: null, flip: typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches },
  view3d: false,
  view3dAngle: 'player',
};

function load(): SettingsData {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings = $state<SettingsData>(load());

$effect.root(() => {
  $effect(() => {
    const snapshot = JSON.stringify(settings);
    try { localStorage.setItem(KEY, snapshot); } catch { /* private mode */ }
  });
});
