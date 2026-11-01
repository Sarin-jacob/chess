// Low-poly 3D pieces for each piece set, built from lathe profiles plus extruded shapes.
// Each piece has a body and a "trim": collar rings, the bishop's mitre cut, crown beads,
// the king's cross, the knight's eyes or a disc's glyph, drawn in a contrasting finish so
// the details read.
import { BoxGeometry, BufferGeometry, ConeGeometry, ExtrudeGeometry, LatheGeometry, Shape, SphereGeometry, TorusGeometry, Vector2 } from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLYPHS } from '../glyphs';
import { DISC_GLYPHS } from '../pieceSets';

type P = [number, number];

export interface PieceGeometry {
  body: BufferGeometry;
  trim: BufferGeometry;
}

const base = (r: number): P[] => [[0, 0], [r, 0], [r, 0.05], [r - 0.03, 0.08], [r - 0.06, 0.1], [r - 0.09, 0.13]];

/** Points around a ball of radius `rad` centred on the axis at height `cy`, from `from` (radians) to the top. */
function arc(cy: number, rad: number, from: number, steps = 8): P[] {
  const out: P[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = from + ((Math.PI / 2 - from) * i) / steps;
    out.push([Math.max(0, rad * Math.cos(a)), cy + rad * Math.sin(a)]);
  }
  return out;
}

const lathe = (pts: P[], seg = 32) => new LatheGeometry(pts.map(([r, y]) => new Vector2(r, y)), seg).toNonIndexed();

const at = (g: BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z).toNonIndexed();

/** A flat ring lying around the piece at height y. */
const band = (r: number, y: number, tube = 0.016) => at(new TorusGeometry(r, tube, 8, 40).rotateX(Math.PI / 2), 0, y, 0);

function merge(parts: BufferGeometry[]): BufferGeometry {
  // Lathe/extrude/box disagree on which attributes they carry; keep only what the materials need.
  for (const p of parts) for (const k of Object.keys(p.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') p.deleteAttribute(k);
  const g = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  g.computeBoundingSphere();
  return g;
}

function ring(n: number, r: number, y: number, make: () => BufferGeometry, offset = 0): BufferGeometry[] {
  return Array.from({ length: n }, (_, i) => {
    const a = offset + (i / n) * Math.PI * 2;
    return at(make(), Math.cos(a) * r, y, Math.sin(a) * r);
  });
}

function knightHead(): BufferGeometry {
  const s = new Shape();
  const pts: P[] = [
    [-0.2, 0], [0.2, 0], [0.16, 0.18], [0.06, 0.32], [0.27, 0.42], [0.33, 0.52], [0.3, 0.6],
    [0.12, 0.7], [0.02, 0.78], [-0.02, 0.88], [-0.08, 0.78], [-0.16, 0.66], [-0.22, 0.44], [-0.23, 0.2],
  ];
  s.moveTo(...pts[0]);
  for (const p of pts.slice(1)) s.lineTo(...p);
  s.closePath();
  const g = new ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 3 });
  g.translate(0, 0.14, -0.08);
  return g.toNonIndexed();
}

/** The knight's mane: a ridge of small blocks down the back of the neck. */
function mane(): BufferGeometry[] {
  const spine: P[] = [[-0.02, 0.98], [-0.09, 0.9], [-0.15, 0.8], [-0.2, 0.68], [-0.24, 0.55], [-0.26, 0.42]];
  return spine.map(([x, y], i) => {
    const g = new BoxGeometry(0.05, 0.075, 0.1);
    g.rotateZ(0.5 + i * 0.12);
    return at(g, x - 0.012, y, 0);
  });
}

/**
 * Geometry per piece type ('p', 'n', ...). A set may also key a colour-specific piece
 * ('wp', 'bp'), which wins over the shared one.
 */
export function buildPieceGeometries(set: string): Record<string, PieceGeometry> {
  return set === 'minimal' ? minimal() : set === 'discs' ? discs() : staunton();
}

function staunton(): Record<string, PieceGeometry> {
  const foot = (r: number) => band(r - 0.075, 0.125);

  const pawn = {
    body: lathe([...base(0.3), [0.17, 0.16], [0.12, 0.3], [0.1, 0.38], [0.17, 0.4], [0.17, 0.43], [0.09, 0.46], ...arc(0.56, 0.13, -1.0)]),
    trim: merge([foot(0.3), band(0.165, 0.415, 0.02)]),
  };

  const rook = {
    body: merge([
      lathe([...base(0.34), [0.22, 0.16], [0.2, 0.3], [0.19, 0.5], [0.25, 0.52], [0.25, 0.62], [0.16, 0.62], [0.16, 0.58], [0, 0.58]]),
      ...ring(6, 0.205, 0.67, () => new BoxGeometry(0.1, 0.1, 0.09)),
    ]),
    trim: merge([foot(0.34), band(0.235, 0.51, 0.02), band(0.2, 0.3, 0.012)]),
  };

  const knight = {
    body: merge([lathe([...base(0.34), [0.21, 0.16], [0, 0.17]]), knightHead()]),
    trim: merge([
      foot(0.34),
      band(0.215, 0.16, 0.02),
      ...mane(),
      // Eyes on both cheeks.
      at(new SphereGeometry(0.032, 10, 8), 0.1, 0.74, 0.115),
      at(new SphereGeometry(0.032, 10, 8), 0.1, 0.74, -0.115),
      // Nostril line across the muzzle.
      at(new BoxGeometry(0.03, 0.03, 0.25), 0.29, 0.6, 0),
    ]),
  };

  // The mitre cut: a thin blade through the head, tilted like the classic Staunton slit.
  const slit = new BoxGeometry(0.03, 0.2, 0.36);
  slit.rotateX(0.55);
  const bishop = {
    body: lathe([
      ...base(0.32), [0.17, 0.16], [0.12, 0.4], [0.1, 0.5], [0.18, 0.52], [0.18, 0.55], [0.1, 0.57],
      [0.15, 0.62], [0.16, 0.7], [0.13, 0.8], [0.07, 0.88], [0.03, 0.9], ...arc(0.94, 0.045, -1.2, 5),
    ]),
    trim: merge([foot(0.32), band(0.175, 0.535, 0.022), at(slit.rotateY(Math.PI / 2), 0, 0.76, 0), at(new SphereGeometry(0.05, 12, 10), 0, 0.95, 0)]),
  };

  const queen = {
    body: lathe([
      ...base(0.36), [0.2, 0.16], [0.13, 0.45], [0.11, 0.62], [0.2, 0.65], [0.2, 0.68], [0.12, 0.7],
      [0.16, 0.8], [0.22, 0.9], [0.19, 0.92], [0.1, 0.93], [0.06, 0.96], ...arc(1.0, 0.06, -0.9, 5),
    ]),
    trim: merge([
      foot(0.36),
      band(0.195, 0.665, 0.022),
      band(0.215, 0.905, 0.016),
      ...ring(8, 0.205, 0.94, () => new SphereGeometry(0.038, 10, 8)),
      at(new SphereGeometry(0.065, 12, 10), 0, 1.0, 0),
    ]),
  };

  const king = {
    body: lathe([
      ...base(0.37), [0.21, 0.16], [0.14, 0.48], [0.12, 0.66], [0.21, 0.69], [0.21, 0.72], [0.13, 0.74],
      [0.18, 0.88], [0.2, 0.95], [0.15, 0.98], [0, 0.99],
    ]),
    trim: merge([
      foot(0.37),
      band(0.205, 0.705, 0.022),
      band(0.195, 0.95, 0.016),
      at(new BoxGeometry(0.075, 0.26, 0.075), 0, 1.11, 0),
      at(new BoxGeometry(0.21, 0.075, 0.075), 0, 1.14, 0),
    ]),
  };

  return { p: pawn, r: rook, n: knight, b: bishop, q: queen, k: king };
}

// ---------- Minimal ----------

/** A low drum the minimal pieces stand on. */
const plinth = (r: number): P[] => [[0, 0], [r, 0], [r, 0.09], [r - 0.03, 0.11]];

/** The 2D minimal knight's outline (45-unit box, y down), stood up and facing +x. */
function blockKnight(): BufferGeometry {
  const pts: P[] = [
    [31, 35], [30, 24], [31.2, 14], [27.2, 7.8], [24.2, 4.5], [22.6, 8.1], [17, 11.1],
    [11, 19], [11.6, 22.6], [15.2, 23.2], [19.2, 20], [15.8, 27], [14, 35],
  ];
  const k = 0.028;
  const s = new Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo : s.moveTo).call(s, (22.5 - x) * k, (35 - y) * k + 0.12));
  s.closePath();
  const g = new ExtrudeGeometry(s, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: 2 });
  g.translate(0, 0, -0.1);
  return g.toNonIndexed();
}

function minimal(): Record<string, PieceGeometry> {
  const foot = (r: number) => band(r - 0.015, 0.1, 0.014);
  const ball = (r: number, y: number) => at(new SphereGeometry(r, 20, 14), 0, y, 0);
  return {
    p: {
      body: merge([lathe([...plinth(0.28), [0.19, 0.12], [0.1, 0.42], [0, 0.43]], 24), ball(0.13, 0.53)]),
      trim: merge([foot(0.28), band(0.11, 0.42, 0.022)]),
    },
    r: {
      body: merge([
        lathe([...plinth(0.32), [0.22, 0.12], [0.21, 0.55], [0, 0.56]], 24),
        ...ring(4, 0.15, 0.61, () => new BoxGeometry(0.13, 0.12, 0.13), Math.PI / 4),
      ]),
      trim: merge([foot(0.32), band(0.215, 0.55, 0.02)]),
    },
    n: {
      body: merge([lathe([...plinth(0.32), [0.2, 0.12], [0, 0.13]], 24), blockKnight()]),
      trim: merge([
        foot(0.32),
        at(new SphereGeometry(0.03, 10, 8), 0.04, 0.78, 0.135),
        at(new SphereGeometry(0.03, 10, 8), 0.04, 0.78, -0.135),
      ]),
    },
    b: {
      body: merge([
        lathe([...plinth(0.3), [0.17, 0.12], [0.1, 0.45], [0.17, 0.6], [0.15, 0.72], [0.08, 0.82], [0, 0.86]], 24),
        ball(0.05, 0.9),
      ]),
      trim: merge([foot(0.3), band(0.105, 0.45, 0.022), at(new BoxGeometry(0.03, 0.03, 0.36).rotateX(0.6).rotateY(Math.PI / 2), 0, 0.7, 0)]),
    },
    q: {
      body: lathe([...plinth(0.34), [0.2, 0.12], [0.12, 0.6], [0.21, 0.8], [0.23, 0.82], [0, 0.82]], 24),
      trim: merge([
        foot(0.34),
        band(0.125, 0.6, 0.022),
        ...ring(6, 0.19, 0.88, () => new ConeGeometry(0.045, 0.13, 10)),
        ball(0.06, 0.88),
      ]),
    },
    k: {
      body: lathe([...plinth(0.35), [0.21, 0.12], [0.13, 0.62], [0.22, 0.8], [0.22, 0.85], [0, 0.85]], 24),
      trim: merge([
        foot(0.35),
        band(0.135, 0.62, 0.022),
        at(new BoxGeometry(0.075, 0.28, 0.075), 0, 1.0, 0),
        at(new BoxGeometry(0.22, 0.075, 0.075), 0, 1.03, 0),
      ]),
    },
  };
}

// ---------- Discs ----------

const DISC_TOP = 0.19;

/** A brush glyph raised from the disc's face, reading upright from the +z side. */
function glyph(ch: string): BufferGeometry {
  const depth = 0.014;
  const data = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${GLYPHS[ch]}"/></svg>`);
  const shapes = data.paths.flatMap((p) => SVGLoader.createShapes(p));
  const g = new ExtrudeGeometry(shapes, { depth, bevelEnabled: false, curveSegments: 4 });
  g.translate(-500, -500, 0);
  g.scale(0.00042, 0.00042, 1);
  // The path's y points down, so a quarter turn about x lays it flat with its top toward -z.
  g.rotateX(Math.PI / 2);
  return at(g, 0, DISC_TOP + depth, 0);
}

function discs(): Record<string, PieceGeometry> {
  const body = lathe([[0, 0], [0.37, 0], [0.4, 0.03], [0.4, 0.16], [0.37, DISC_TOP], [0, DISC_TOP]], 40);
  const out: Record<string, PieceGeometry> = {};
  for (const [code, ch] of Object.entries(DISC_GLYPHS)) {
    // Every piece but the pawn wears the same glyph on both sides.
    const key = code[1] === 'p' ? code : code[1];
    if (out[key]) continue;
    out[key] = { body: body.clone(), trim: merge([band(0.31, DISC_TOP, 0.012), glyph(ch)]) };
  }
  body.dispose();
  return out;
}
