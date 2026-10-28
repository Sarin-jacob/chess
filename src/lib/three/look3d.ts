// What each realm's 3D set is carved from: piece materials, board finish and lighting.
import { BackSide, CanvasTexture, Color, MeshBasicMaterial, MeshPhysicalMaterial, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';

type Tex = 'grain' | 'veins' | 'marble' | 'speckle';

interface Finish {
  color: string;
  roughness: number;
  metalness?: number;
  clearcoat?: number;
  /** Glass-like see-through (ice, jade). */
  transmission?: number;
  thickness?: number;
  attenuation?: string;
  ior?: number;
  sheen?: string;
  emissive?: string;
  emissiveIntensity?: number;
  tex?: Tex;
  /** Glowing pattern (lava seams) instead of a surface pattern. */
  glow?: Tex;
}

export interface Look {
  w: Finish;
  b: Finish;
  /** Collars, mitre cut, crown beads, cross, eyes: a contrasting inlay per side. */
  trim: { w: Finish; b: Finish };
  /** Silhouette line around each side's pieces, so they stand out from the squares. */
  outline: { w: string; b: string };
  board: { roughness: number; clearcoat?: number; tex?: Tex };
  frame: string;
  hemi: [string, string, number];
  key: [string, number];
  rim: [string, number];
  env: number;
  exposure: number;
}

const gold = (glow = 0): Finish => ({ color: '#d9a646', roughness: 0.35, metalness: 1, ...(glow ? { emissive: '#7a4a10', emissiveIntensity: glow } : {}) });

export const LOOKS: Record<string, Look> = {
  // Frosted ice against deep glacier blue, inlaid with silver.
  frost: {
    w: { color: '#c4e2f7', roughness: 0.22, transmission: 0.5, thickness: 1.1, ior: 1.31, attenuation: '#7fb8e3', clearcoat: 0.4 },
    b: { color: '#2f6aa6', roughness: 0.25, transmission: 0.35, thickness: 1.2, ior: 1.31, attenuation: '#123a66', clearcoat: 0.4 },
    trim: { w: { color: '#4f86b8', roughness: 0.35, metalness: 0.6 }, b: { color: '#e6f3ff', roughness: 0.3, metalness: 0.8 } },
    outline: { w: '#264a6b', b: '#d8efff' },
    board: { roughness: 0.55, clearcoat: 0.1 },
    frame: '#2c4b66',
    hemi: ['#e2f2ff', '#3c5a75', 0.8],
    key: ['#ffffff', 2.8],
    rim: ['#9fe0ff', 1.4],
    env: 0.55,
    exposure: 1.0,
  },
  // Maple and walnut, oiled; each inlaid with the other wood.
  autumn: {
    w: { color: '#e8b97c', roughness: 0.6, clearcoat: 0.15, tex: 'grain' },
    b: { color: '#5b2c14', roughness: 0.55, clearcoat: 0.2, tex: 'grain' },
    trim: { w: { color: '#4a220e', roughness: 0.5 }, b: { color: '#e9b06a', roughness: 0.45, metalness: 0.4 } },
    outline: { w: '#3a1a0a', b: '#e8a15a' },
    board: { roughness: 0.65, clearcoat: 0.1, tex: 'grain' },
    frame: '#3d1d0e',
    hemi: ['#ffd2a0', '#3a1a0a', 0.75],
    key: ['#ffc58a', 3.0],
    rim: ['#f08a3c', 1.4],
    env: 0.4,
    exposure: 1.05,
  },
  // Temple gold against basalt split by molten seams.
  volcano: {
    w: { color: '#e2a94a', roughness: 0.38, metalness: 1 },
    b: { color: '#1d1512', roughness: 0.85, glow: 'veins', emissive: '#ff5a14', emissiveIntensity: 2.4 },
    trim: { w: { color: '#3a120a', roughness: 0.7 }, b: { color: '#ff7a2a', roughness: 0.6, emissive: '#ff5a14', emissiveIntensity: 1.6 } },
    outline: { w: '#2a0c05', b: '#ff6a1a' },
    board: { roughness: 0.8, tex: 'speckle' },
    frame: '#1c0b07',
    hemi: ['#ff9a6a', '#200604', 0.65],
    key: ['#ffb27a', 2.4],
    rim: ['#ff5a14', 2.2],
    env: 0.45,
    exposure: 1.1,
  },
  // Blue-and-white porcelain and red lacquer with gold leaf.
  spring: {
    w: { color: '#f8f5ee', roughness: 0.32, clearcoat: 0.4, tex: 'marble' },
    b: { color: '#8f1f22', roughness: 0.38, clearcoat: 0.4 },
    trim: { w: { color: '#2b4fa3', roughness: 0.3, clearcoat: 0.5 }, b: gold() },
    outline: { w: '#2b3f73', b: '#3a0a0c' },
    board: { roughness: 0.6, clearcoat: 0.05 },
    frame: '#5e3f26',
    hemi: ['#f2f9ff', '#6c8a5a', 0.85],
    key: ['#fff4e0', 2.8],
    rim: ['#ffd1e0', 1.1],
    env: 0.5,
    exposure: 1.0,
  },
  // Translucent jade bound in gold, and sea-worn bronze with jade inlay.
  rain: {
    w: { color: '#a8e6c4', roughness: 0.3, transmission: 0.45, thickness: 1.4, ior: 1.6, attenuation: '#2f8a5e', clearcoat: 0.3 },
    b: { color: '#2f5a4a', roughness: 0.55, metalness: 0.65 },
    trim: { w: gold(), b: { color: '#7fe0b0', roughness: 0.4, emissive: '#2fbf86', emissiveIntensity: 0.25 } },
    outline: { w: '#0d3b2c', b: '#9ff0cc' },
    board: { roughness: 0.6, clearcoat: 0.05, tex: 'marble' },
    frame: '#0b332c',
    hemi: ['#9fffe6', '#02140f', 0.75],
    key: ['#c8fff0', 2.4],
    rim: ['#5af0c8', 1.5],
    env: 0.5,
    exposure: 1.1,
  },
  // Brushed moon-silver and matte obsidian, both veined with a spirit's violet.
  night: {
    w: { color: '#d4cfe8', roughness: 0.5, metalness: 0.6 },
    b: { color: '#1a1026', roughness: 0.55, metalness: 0.1, clearcoat: 0.15, emissive: '#6b35c9', emissiveIntensity: 0.08 },
    trim: { w: { color: '#7b52e8', roughness: 0.45, emissive: '#5b2fd0', emissiveIntensity: 0.5 }, b: { color: '#b48cff', roughness: 0.4, emissive: '#8a55ff', emissiveIntensity: 0.9 } },
    outline: { w: '#1b1030', b: '#9a72ff' },
    board: { roughness: 0.6, clearcoat: 0.05 },
    frame: '#120a1e',
    hemi: ['#8a6cff', '#05030a', 0.7],
    key: ['#d8ccff', 2.4],
    rim: ['#b57bff', 1.8],
    env: 0.45,
    exposure: 1.2,
  },
  // Rose salt crystal and sun-dark sandstone, trimmed in each other's tone.
  day: {
    w: { color: '#e2a48c', roughness: 0.5, sheen: '#fff0e8', tex: 'speckle' },
    b: { color: '#5e4029', roughness: 0.65, tex: 'speckle' },
    trim: { w: { color: '#7a3f2a', roughness: 0.5 }, b: { color: '#f2e2c4', roughness: 0.5 } },
    outline: { w: '#5a2e1e', b: '#f4e6cc' },
    board: { roughness: 0.75, tex: 'speckle' },
    frame: '#7d6c55',
    hemi: ['#ffffff', '#cfc4ae', 0.8],
    key: ['#fffaf0', 3.0],
    rim: ['#ffe9c0', 0.9],
    env: 0.45,
    exposure: 0.85,
  },
};

export const lookFor = (id: string): Look => LOOKS[id] ?? LOOKS.frost;

/** Deterministic PRNG so textures look the same every visit. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cache = new Map<Tex, Texture>();

/** Greyscale patterns: the material colour tints them (or, for glow, they mask the emissive). */
export function texture(kind: Tex): Texture {
  const hit = cache.get(kind);
  if (hit) return hit;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const r = rng(kind.length * 977);
  if (kind === 'grain') {
    g.fillStyle = '#e6e6e6';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 46; i++) {
      const y0 = r() * S, amp = 2 + r() * 6, freq = 1 + r() * 2, phase = r() * 6;
      g.strokeStyle = `rgba(60,40,30,${0.08 + r() * 0.22})`;
      g.lineWidth = 0.6 + r() * 2.2;
      g.beginPath();
      for (let x = 0; x <= S; x += 4) {
        const y = y0 + Math.sin((x / S) * Math.PI * 2 * freq + phase) * amp;
        if (x) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.stroke();
    }
  } else if (kind === 'veins') {
    g.fillStyle = '#000';
    g.fillRect(0, 0, S, S);
    g.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      let x = r() * S, y = r() * S;
      g.strokeStyle = '#ffffff';
      g.lineWidth = 1 + r() * 2.5;
      g.shadowColor = '#fff';
      g.shadowBlur = 6;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 9; k++) {
        x += (r() - 0.5) * 60;
        y += (r() - 0.3) * 50;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  } else if (kind === 'marble') {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, S, S);
    g.filter = 'blur(1.5px)';
    for (let i = 0; i < 7; i++) {
      g.strokeStyle = `rgba(120,130,140,${0.15 + r() * 0.2})`;
      g.lineWidth = 1 + r() * 3;
      g.beginPath();
      let x = r() * S, y = 0;
      g.moveTo(x, y);
      while (y < S) {
        x += (r() - 0.5) * 40;
        y += 20 + r() * 20;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  } else {
    const img = g.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const v = 215 + r() * 40 - (r() < 0.04 ? 60 : 0);
      img.data.set([v, v, v, 255], i * 4);
    }
    g.putImageData(img, 0, 0);
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  cache.set(kind, t);
  return t;
}

export function pieceMaterial(f: Finish): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({
    color: new Color(f.color),
    roughness: f.roughness,
    metalness: f.metalness ?? 0,
    clearcoat: f.clearcoat ?? 0,
    clearcoatRoughness: 0.15,
  });
  if (f.transmission) {
    m.transmission = f.transmission;
    m.thickness = f.thickness ?? 0.5;
    m.ior = f.ior ?? 1.45;
    if (f.attenuation) {
      m.attenuationColor = new Color(f.attenuation);
      m.attenuationDistance = 1.2;
    }
  }
  if (f.sheen) {
    m.sheen = 1;
    m.sheenColor = new Color(f.sheen);
    m.sheenRoughness = 0.6;
  }
  if (f.emissive) {
    m.emissive = new Color(f.emissive);
    m.emissiveIntensity = f.emissiveIntensity ?? 0.2;
  }
  if (f.tex) m.map = texture(f.tex);
  if (f.glow) m.emissiveMap = texture(f.glow);
  return m;
}

/**
 * Inverted-hull outline: the mesh is drawn again, pushed out along its normals and seen only
 * from behind, which leaves a clean line around the silhouette.
 */
export function outlineMaterial(color: string, thickness: number): MeshBasicMaterial {
  const m = new MeshBasicMaterial({ color, side: BackSide });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `vec3 transformed = position + normal * ${thickness.toFixed(4)};`);
  };
  m.customProgramCacheKey = () => `outline-${thickness}`;
  return m;
}
