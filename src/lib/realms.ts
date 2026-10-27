export type ParticleKind = 'snow' | 'leaves' | 'embers' | 'petals' | 'bubbles' | 'wisps' | 'glints';

export interface Realm {
  id: string;
  name: string;
  hanzi: string;
  /** English reading of the hanzi. */
  meaning: string;
  season: string;
  tagline: string;
  particles: { kind: ParticleKind; colors: string[]; count: number };
  /** CSS custom properties applied to :root */
  vars: Record<string, string>;
}

export const REALMS: Realm[] = [
  {
    id: 'frost',
    name: 'Frozen Peak Sect',
    hanzi: '冰峰',
    meaning: 'Ice Peak',
    season: 'Winter',
    tagline: 'Where breath turns to frost and every move is final.',
    particles: { kind: 'snow', colors: ['#ffffff', '#dff1ff', '#bfe3ff'], count: 140 },
    vars: {
      '--bg1': '#0b1a2e', '--bg2': '#2d5878', '--bg3': '#9cc7e4',
      '--ink': '#eaf6ff', '--muted': '#9fbdd4', '--accent': '#9fe0ff', '--accent-ink': '#06233a',
      '--panel': 'rgba(10, 30, 52, 0.55)', '--panel-border': 'rgba(190, 230, 255, 0.22)',
      '--light': '#e6f1f8', '--dark': '#7c9bb6', '--coord-light': '#7c9bb6', '--coord-dark': '#e6f1f8',
      '--hl': 'rgba(120, 210, 255, 0.55)', '--last': 'rgba(160, 230, 255, 0.42)', '--check': 'rgba(255, 70, 90, 0.75)',
      '--glow': 'rgba(160, 225, 255, 0.45)', '--mountain': '#d9ecf8',
    },
  },
  {
    id: 'autumn',
    name: 'Maple Grove Pavilion',
    hanzi: '枫林',
    meaning: 'Maple Forest',
    season: 'Autumn',
    tagline: 'Old wood remembers every master who sat here.',
    particles: { kind: 'leaves', colors: ['#e0612b', '#c73e1d', '#e8a33d', '#a5521f'], count: 45 },
    vars: {
      '--bg1': '#1c0d06', '--bg2': '#4a2412', '--bg3': '#9c4d1f',
      '--ink': '#fbead6', '--muted': '#d0a582', '--accent': '#f08a3c', '--accent-ink': '#2a1206',
      '--panel': 'rgba(40, 18, 8, 0.6)', '--panel-border': 'rgba(240, 170, 110, 0.22)',
      '--light': '#ecc898', '--dark': '#9b5f33', '--coord-light': '#9b5f33', '--coord-dark': '#ecc898',
      '--hl': 'rgba(255, 170, 60, 0.55)', '--last': 'rgba(240, 200, 80, 0.45)', '--check': 'rgba(220, 40, 30, 0.75)',
      '--glow': 'rgba(240, 130, 60, 0.4)', '--mountain': '#6b2e14',
    },
  },
  {
    id: 'volcano',
    name: 'Molten Flame Valley',
    hanzi: '炎谷',
    meaning: 'Flame Valley',
    season: 'Summer',
    tagline: 'The mountain bleeds fire; only the steady survive.',
    particles: { kind: 'embers', colors: ['#ffb347', '#ff6a1a', '#ff3b0f', '#ffd27a'], count: 90 },
    vars: {
      '--bg1': '#0d0403', '--bg2': '#3a0c05', '--bg3': '#a3260b',
      '--ink': '#ffe9dc', '--muted': '#d39a7f', '--accent': '#ff6a1a', '--accent-ink': '#1d0602',
      '--panel': 'rgba(28, 8, 4, 0.62)', '--panel-border': 'rgba(255, 110, 40, 0.28)',
      '--light': '#cf9a77', '--dark': '#4a1d14', '--coord-light': '#4a1d14', '--coord-dark': '#cf9a77',
      '--hl': 'rgba(255, 110, 20, 0.6)', '--last': 'rgba(255, 150, 40, 0.42)', '--check': 'rgba(255, 30, 10, 0.85)',
      '--glow': 'rgba(255, 90, 20, 0.5)', '--mountain': '#200704',
    },
  },
  {
    id: 'spring',
    name: 'Spring Blossom Court',
    hanzi: '春庭',
    meaning: 'Spring Courtyard',
    season: 'Spring',
    tagline: 'A quiet courtyard, a gentle breeze, a ruthless opening.',
    particles: { kind: 'petals', colors: ['#f7b7c8', '#f39bb5', '#ffd6e0', '#ffffff'], count: 55 },
    vars: {
      '--bg1': '#f4f8ec', '--bg2': '#cfe5bf', '--bg3': '#8fbf86',
      '--ink': '#23331f', '--muted': '#5d7454', '--accent': '#d9638a', '--accent-ink': '#ffffff',
      '--panel': 'rgba(255, 255, 250, 0.62)', '--panel-border': 'rgba(60, 100, 50, 0.18)',
      '--light': '#f2eed6', '--dark': '#7fa56b', '--coord-light': '#7fa56b', '--coord-dark': '#f2eed6',
      '--hl': 'rgba(230, 110, 150, 0.5)', '--last': 'rgba(240, 220, 90, 0.5)', '--check': 'rgba(220, 40, 60, 0.7)',
      '--glow': 'rgba(240, 150, 180, 0.4)', '--mountain': '#a9cf98',
    },
  },
  {
    id: 'rain',
    name: 'Sunken Jade Temple',
    hanzi: '沉玉殿',
    meaning: 'Sunken Jade Hall',
    season: 'Rains',
    tagline: 'Beneath the flood, the old temple still keeps its rules.',
    particles: { kind: 'bubbles', colors: ['#a6ffe0', '#6fe3c1', '#d6fff2'], count: 60 },
    vars: {
      '--bg1': '#021412', '--bg2': '#073a33', '--bg3': '#1d7a66',
      '--ink': '#dcfff3', '--muted': '#86c7b3', '--accent': '#4fe0b5', '--accent-ink': '#03251d',
      '--panel': 'rgba(3, 32, 28, 0.6)', '--panel-border': 'rgba(110, 230, 190, 0.22)',
      '--light': '#a8d4c0', '--dark': '#2c6a5a', '--coord-light': '#2c6a5a', '--coord-dark': '#a8d4c0',
      '--hl': 'rgba(80, 240, 190, 0.5)', '--last': 'rgba(170, 255, 150, 0.38)', '--check': 'rgba(255, 70, 90, 0.75)',
      '--glow': 'rgba(80, 230, 180, 0.4)', '--mountain': '#0d4a40',
    },
  },
  {
    id: 'night',
    name: 'Obsidian Underworld',
    hanzi: '冥渊',
    meaning: 'Abyss of the Dead',
    season: 'Night',
    tagline: 'Below the last mountain, ghosts still play for keeps.',
    particles: { kind: 'wisps', colors: ['#b57bff', '#7d5cff', '#e0b3ff', '#5af0ff'], count: 40 },
    vars: {
      '--bg1': '#05030a', '--bg2': '#1c0f30', '--bg3': '#4a2477',
      '--ink': '#efe4ff', '--muted': '#a691c4', '--accent': '#b57bff', '--accent-ink': '#14072a',
      '--panel': 'rgba(14, 8, 26, 0.62)', '--panel-border': 'rgba(180, 120, 255, 0.24)',
      '--light': '#8a7aa6', '--dark': '#2b1f3f', '--coord-light': '#2b1f3f', '--coord-dark': '#8a7aa6',
      '--hl': 'rgba(180, 110, 255, 0.55)', '--last': 'rgba(90, 240, 255, 0.32)', '--check': 'rgba(255, 50, 120, 0.8)',
      '--glow': 'rgba(170, 100, 255, 0.5)', '--mountain': '#120a20',
    },
  },
  {
    id: 'day',
    name: 'White Salt Plateau',
    hanzi: '白盐原',
    meaning: 'White Salt Plain',
    season: 'Day',
    tagline: 'Endless white under a blinding sun. Nowhere to hide.',
    particles: { kind: 'glints', colors: ['#ffffff', '#fff3c4', '#ffe08a'], count: 70 },
    vars: {
      '--bg1': '#fffdf7', '--bg2': '#efeadf', '--bg3': '#d8cfbd',
      '--ink': '#352f28', '--muted': '#7b7266', '--accent': '#c99327', '--accent-ink': '#ffffff',
      '--panel': 'rgba(255, 255, 255, 0.66)', '--panel-border': 'rgba(120, 100, 70, 0.18)',
      '--light': '#fffcf4', '--dark': '#cbc3b2', '--coord-light': '#a99f8b', '--coord-dark': '#fffcf4',
      '--hl': 'rgba(230, 170, 40, 0.5)', '--last': 'rgba(150, 200, 230, 0.45)', '--check': 'rgba(220, 50, 40, 0.7)',
      '--glow': 'rgba(255, 210, 120, 0.5)', '--mountain': '#e4dccb',
    },
  },
];

export const realmById = (id: string): Realm => REALMS.find((r) => r.id === id) ?? REALMS[0];

export function randomRealm(exclude?: string): Realm {
  const pool = REALMS.filter((r) => r.id !== exclude);
  return pool[Math.floor(Math.random() * pool.length)];
}

export function applyRealm(realm: Realm) {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(realm.vars)) root.style.setProperty(k, v);
  root.dataset.realm = realm.id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', realm.vars['--bg1']);
}

/** Every Chinese glyph used in the UI, with its English meaning. */
export const GLOSSARY: [string, string][] = [
  ['棋', 'Chess (the board game)'],
  ['弈', 'Play — to play a game of skill'],
  ['譜', 'Record — a game score'],
  ['卷', 'Scroll — the archive'],
  ['境', 'Realm'],
  ['設', 'Settings'],
  ['命', 'Fate — random realm'],
  ['勝', 'Victory'],
  ['敗', 'Defeat'],
  ['和', 'Draw — harmony'],
  ['終', 'The end'],
  ...REALMS.map((r) => [r.hanzi, r.meaning] as [string, string]),
];
