// Cultivation: a rating earned against the sect, shown as the stages of a cultivator's path.
// Elo underneath (each sect level has a strength), nine layers to every stage on top.

/** The sect's strength at each level, 1–8. */
export const SECT_STRENGTH = [450, 650, 850, 1050, 1250, 1450, 1700, 1950];

export const STAGES = [
  { min: -Infinity, hz: '凡人', name: 'Mortal', note: 'Not yet on the path.' },
  { min: 600, hz: '练气', name: 'Qi Refining', note: 'Drawing qi into the body; the pieces start to obey.' },
  { min: 800, hz: '筑基', name: 'Foundation Establishment', note: 'A foundation laid: development, the centre, a safe king.' },
  { min: 1000, hz: '金丹', name: 'Golden Core', note: 'Qi condensed into a core: tactics come unbidden.' },
  { min: 1200, hz: '元婴', name: 'Nascent Soul', note: 'A second self sees the board from above.' },
  { min: 1400, hz: '化神', name: 'Spirit Transformation', note: 'Plans, not moves.' },
  { min: 1600, hz: '炼虚', name: 'Void Refining', note: 'Seeing what is not on the board.' },
  { min: 1800, hz: '合体', name: 'Body Integration', note: 'Mind and pieces are one.' },
  { min: 2000, hz: '大乘', name: 'Great Ascension', note: 'Few under heaven can stand before you.' },
  { min: 2200, hz: '渡劫', name: 'Tribulation Crossing', note: 'Only the heavens themselves remain.' },
];
const STAGE_SPAN = 200;
const ORDINAL = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth'];

export function stageOf(rating: number) {
  let i = 0;
  while (i + 1 < STAGES.length && rating >= STAGES[i + 1].min) i++;
  const s = STAGES[i];
  const base = i === 0 ? 400 : s.min;
  const layer = Math.max(1, Math.min(9, 1 + Math.floor(((rating - base) / STAGE_SPAN) * 9)));
  const next = STAGES[i + 1];
  const progress = next ? Math.max(0, Math.min(1, (rating - base) / (next.min - base))) : 1;
  return { index: i, ...s, layer, layerName: `${ORDINAL[layer - 1]} Layer`, progress };
}

interface Saved { rating: number; games: number; peak: number; rated: string[]; log: { at: number; rating: number }[] }
const KEY = 'nine-peaks-cultivation';
const START = 750;

function load(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (s && typeof s.rating === 'number') return s;
  } catch { /* fresh start */ }
  return { rating: START, games: 0, peak: START, rated: [], log: [] };
}

export interface Gain { gameId: string; delta: number; from: ReturnType<typeof stageOf>; to: ReturnType<typeof stageOf>; rating: number }

class Cultivation {
  private s = $state<Saved>(load());
  /** The most recent change, for the result card and the breakthrough announcement. */
  last = $state<Gain | null>(null);

  get rating() { return Math.round(this.s.rating); }
  get games() { return this.s.games; }
  get peak() { return Math.round(this.s.peak); }
  get stage() { return stageOf(this.s.rating); }
  get log() { return this.s.log; }

  /** Settle a finished game against the sect (each game counts once). 1 = won, 0.5 = drawn, 0 = lost. */
  record(gameId: string, level: number, score: number): Gain | null {
    if (this.s.rated.includes(gameId)) return null;
    const before = this.s.rating;
    const opp = SECT_STRENGTH[Math.max(1, Math.min(8, level)) - 1];
    const expected = 1 / (1 + 10 ** ((opp - before) / 400));
    // Settle in quickly over the first games, then steadier.
    const k = this.s.games < 12 ? 48 : 24;
    const delta = Math.round(k * (score - expected));
    const rating = Math.max(100, before + delta);
    this.s = {
      rating,
      games: this.s.games + 1,
      peak: Math.max(this.s.peak, rating),
      rated: [...this.s.rated, gameId].slice(-500),
      log: [...this.s.log, { at: Date.now(), rating }].slice(-200),
    };
    try { localStorage.setItem(KEY, JSON.stringify(this.s)); } catch { /* storage blocked */ }
    this.last = { gameId, delta, from: stageOf(before), to: stageOf(rating), rating };
    return this.last;
  }

  /** Which sect level is the fairest match for you now. */
  get fairLevel() {
    let best = 1;
    SECT_STRENGTH.forEach((s, i) => { if (Math.abs(s - this.s.rating) < Math.abs(SECT_STRENGTH[best - 1] - this.s.rating)) best = i + 1; });
    return best;
  }
}

export const cultivation = new Cultivation();
