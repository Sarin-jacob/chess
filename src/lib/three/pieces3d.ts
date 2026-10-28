// Low-poly Staunton-ish pieces built from lathe profiles (plus an extruded knight head).
// Each piece has a body and a "trim": collar rings, the bishop's mitre cut, crown beads,
// the king's cross and the knight's eyes, drawn in a contrasting finish so the details read.
import { BoxGeometry, BufferGeometry, ExtrudeGeometry, LatheGeometry, Shape, SphereGeometry, TorusGeometry, Vector2 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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

export function buildPieceGeometries(): Record<string, PieceGeometry> {
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
