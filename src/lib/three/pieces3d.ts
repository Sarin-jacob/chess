// Low-poly Staunton-ish pieces built from lathe profiles (plus an extruded knight head).
import { BoxGeometry, BufferGeometry, ExtrudeGeometry, LatheGeometry, Shape, SphereGeometry, Vector2 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type P = [number, number];

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

const lathe = (pts: P[], seg = 28) => new LatheGeometry(pts.map(([r, y]) => new Vector2(r, y)), seg).toNonIndexed();

const at = (g: BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z).toNonIndexed();

function merge(parts: BufferGeometry[]): BufferGeometry {
  // Lathe/extrude/box disagree on which attributes they carry; keep only what the material needs.
  for (const p of parts) for (const k of Object.keys(p.attributes)) if (k !== 'position' && k !== 'normal') p.deleteAttribute(k);
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
  const g = new ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 2 });
  g.translate(0, 0.14, -0.08);
  return g.toNonIndexed();
}

export function buildPieceGeometries(): Record<string, BufferGeometry> {
  const pawn = lathe([...base(0.3), [0.17, 0.16], [0.12, 0.3], [0.1, 0.38], [0.17, 0.4], [0.17, 0.43], [0.09, 0.46], ...arc(0.56, 0.13, -1.0)]);

  const rook = merge([
    lathe([...base(0.34), [0.22, 0.16], [0.2, 0.3], [0.19, 0.5], [0.25, 0.52], [0.25, 0.62], [0.16, 0.62], [0.16, 0.58], [0, 0.58]]),
    ...ring(6, 0.205, 0.67, () => new BoxGeometry(0.1, 0.1, 0.09)),
  ]);

  const knight = merge([lathe([...base(0.34), [0.21, 0.16], [0, 0.17]]), knightHead()]);

  const bishop = lathe([
    ...base(0.32), [0.17, 0.16], [0.12, 0.4], [0.1, 0.5], [0.18, 0.52], [0.18, 0.55], [0.1, 0.57],
    [0.15, 0.62], [0.16, 0.7], [0.13, 0.8], [0.07, 0.88], [0.03, 0.9], ...arc(0.94, 0.045, -1.2, 5),
  ]);

  const queen = merge([
    lathe([
      ...base(0.36), [0.2, 0.16], [0.13, 0.45], [0.11, 0.62], [0.2, 0.65], [0.2, 0.68], [0.12, 0.7],
      [0.16, 0.8], [0.22, 0.9], [0.19, 0.92], [0.1, 0.93], [0.06, 0.96], ...arc(1.0, 0.06, -0.9, 5),
    ]),
    ...ring(8, 0.205, 0.93, () => new SphereGeometry(0.035, 8, 6)),
  ]);

  const king = merge([
    lathe([
      ...base(0.37), [0.21, 0.16], [0.14, 0.48], [0.12, 0.66], [0.21, 0.69], [0.21, 0.72], [0.13, 0.74],
      [0.18, 0.88], [0.2, 0.95], [0.15, 0.98], [0, 0.99],
    ]),
    at(new BoxGeometry(0.07, 0.24, 0.07), 0, 1.1, 0),
    at(new BoxGeometry(0.2, 0.07, 0.07), 0, 1.13, 0),
  ]);

  return { p: pawn, r: rook, n: knight, b: bishop, q: queen, k: king };
}
