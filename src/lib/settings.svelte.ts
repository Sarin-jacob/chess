// Per-device preferences, kept in localStorage.

export interface SettingsData {
  realm: string; // 'random' or a realm id
  sound: boolean;
  haptics: boolean;
  particles: boolean;
  coords: boolean;
  level: number;
  name: string;
  autoFlip: boolean;
  useStun: boolean;
  /** Immersive three.js board instead of the flat one. */
  view3d: boolean;
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
  autoFlip: false,
  useStun: true,
  view3d: false,
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
