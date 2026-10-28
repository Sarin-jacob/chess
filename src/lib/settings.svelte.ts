// Per-device preferences, kept in localStorage.
import type { Rules } from './db';
import { randomName } from './names';

export interface SettingsData {
  realm: string; // 'random' or a realm id
  sound: boolean;
  haptics: boolean;
  particles: boolean;
  coords: boolean;
  level: number;
  name: string;
  /** True while the name is one we generated rather than one the player typed. */
  nameAuto: boolean;
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
  name: '',
  nameAuto: true,
  useStun: true,
  // Turning the board each move suits a phone passed across a table, not a desktop screen.
  rules: { hints: true, undo: true, clock: null, flip: typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches },
  view3d: false,
  view3dAngle: 'player',
};

function load(): SettingsData {
  try {
    const saved: Partial<SettingsData> = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    const s: SettingsData = { ...DEFAULTS, ...saved };
    // Saved before random names existed: 'Wanderer' was the old fixed default, anything else was typed.
    if (saved.name && saved.nameAuto === undefined) s.nameAuto = saved.name === 'Wanderer';
    if (!s.name || (s.nameAuto && s.name === 'Wanderer')) Object.assign(s, { name: randomName(), nameAuto: true });
    return s;
  } catch {
    return { ...DEFAULTS, name: randomName() };
  }
}

export const settings = $state<SettingsData>(load());

$effect.root(() => {
  $effect(() => {
    const snapshot = JSON.stringify(settings);
    try { localStorage.setItem(KEY, snapshot); } catch { /* private mode */ }
  });
});
