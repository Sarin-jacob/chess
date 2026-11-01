// The piece sets a player can pick. Each has a flat SVG look for the 2D board and a matching
// carved look for the 3D one (see three/pieces3d.ts).
import { GLYPHS } from './glyphs';
import { PIECES } from './pieces';

export type PieceSetId = 'staunton' | 'minimal' | 'discs';

export const PIECE_SETS: { id: PieceSetId; name: string; hint: string }[] = [
  { id: 'staunton', name: 'Staunton', hint: 'The classic tournament shapes' },
  { id: 'minimal', name: 'Minimal', hint: 'Flat geometric silhouettes' },
  { id: 'discs', name: 'Xiangqi discs', hint: 'Lacquered discs with brushed glyphs: 王 后 车 象 马 兵/卒' },
];

/** The brush glyph on each disc. Pawns follow xiangqi: 兵 for the first player, 卒 for the second. */
export const DISC_GLYPHS: Record<string, string> = {
  wk: '王', wq: '后', wr: '车', wb: '象', wn: '马', wp: '兵',
  bk: '王', bq: '后', br: '车', bb: '象', bn: '马', bp: '卒',
};

// Brackets and quotes are escaped too, so the URL also works unquoted inside CSS url().
const url = (svg: string) => 'data:image/svg+xml,' + encodeURIComponent(svg).replace(/[()']/g, (c) => '%' + c.charCodeAt(0).toString(16));
const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45">${body}</svg>`;

// ---------- Minimal ----------

/** Silhouettes in a 45 x 45 box, base on y = 39. `detail` lines are drawn in the contrasting colour. */
const MINIMAL: Record<string, { shape: string; detail?: string }> = {
  p: {
    shape: '<circle cx="22.5" cy="14.5" r="5.5"/><path d="M16.5 35c0-6 3-9.5 4-13h4c1 3.5 4 7 4 13z"/><rect x="17.5" y="20" width="10" height="2.8" rx="1.3"/>',
  },
  r: {
    shape: '<path d="M14.5 35l1.5-16.5h13l1.5 16.5z"/><path d="M12.5 18.5v-8h4v3h4v-3h4v3h4v-3h4v8z"/>',
    detail: '<path d="M16 23h13"/>',
  },
  b: {
    shape: '<circle cx="22.5" cy="6.6" r="2.3"/><path d="M22.5 9c-5 4-8 8.5-8 13 0 3 1.5 5 3 6l-1 7h12l-1-7c1.5-1 3-3 3-6 0-4.5-3-9-8-13z"/>',
    detail: '<path d="M25 14l-4 5.5M18.5 28h8"/>',
  },
  n: {
    shape: '<path d="M31 35L30 24L31.2 14L27.2 7.8L24.2 4.5L22.6 8.1L17 11.1L11 19L11.6 22.6L15.2 23.2L19.2 20L15.8 27L14 35Z"/>',
    detail: '<circle cx="21" cy="12.3" r="1.1" stroke="none"/>',
  },
  q: {
    shape: '<path d="M13 30l-2-16 3 8 3-11 2.8 9 2.7-11 2.7 11 2.8-9 3 11 3-8-2 16z"/><path d="M13 30h19l1 5H12z"/>' +
      [[11, 13], [17, 10], [22.5, 8], [28, 10], [34, 13]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.8"/>`).join(''),
  },
  k: {
    shape: '<path d="M14.5 35c0-5.5-3.5-8.5-3.5-12.5 0-4 4.5-6.5 11.5-6.5S34 18.5 34 22.5c0 4-3.5 7-3.5 12.5z"/><path d="M22.5 4v11M18.5 8h8" fill="none" stroke-width="2.4"/>',
    detail: '<path d="M14 29h17"/>',
  },
};

function minimal(code: string) {
  const white = code[0] === 'w';
  const p = MINIMAL[code[1]];
  const [fill, stroke, detail] = white ? ['#f6f2e8', '#1e1e1e', '#1e1e1e'] : ['#262626', '#0d0d0d', '#e9e4d8'];
  return url(svg(
    `<g fill="${fill}" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round">` +
      p.shape +
      '<rect x="11" y="35" width="23" height="4.2" rx="1.6"/>' +
      `</g><g fill="${detail}" stroke="${detail}" stroke-width="1.4" stroke-linecap="round">${p.detail ?? ''}</g>`,
  ));
}

// ---------- Discs ----------

/** Disc colours: [face, rim, glyph]. Ivory with cinnabar ink against black lacquer with gold. */
export const DISC_COLORS = { w: ['#f2e4c4', '#b8925a', '#b3261e'], b: ['#2b2421', '#0f0c0a', '#e2b451'] } as const;

function disc(code: string) {
  const [face, rim, ink] = DISC_COLORS[code[0] as 'w' | 'b'];
  return url(svg(
    `<circle cx="22.5" cy="24" r="19" fill="${rim}"/>` +
      `<circle cx="22.5" cy="22" r="19" fill="${face}" stroke="${rim}" stroke-width="1"/>` +
      `<circle cx="22.5" cy="22" r="15.6" fill="none" stroke="${ink}" stroke-width="1.1"/>` +
      `<path d="${GLYPHS[DISC_GLYPHS[code]]}" fill="${ink}" transform="translate(11.5 11) scale(0.022)"/>`,
  ));
}

// ---------- Lookup ----------

const CODES = ['w', 'b'].flatMap((c) => ['p', 'n', 'b', 'r', 'q', 'k'].map((t) => c + t));
const build = (make: (code: string) => string) => Object.fromEntries(CODES.map((c) => [c, make(c)]));

const SETS: Record<PieceSetId, Record<string, string>> = {
  staunton: PIECES,
  minimal: build(minimal),
  discs: build(disc),
};

/** Image URL for each piece code ('wk', 'bp', ...) in the chosen set. */
export const pieceImages = (id: string): Record<string, string> => SETS[id as PieceSetId] ?? PIECES;
