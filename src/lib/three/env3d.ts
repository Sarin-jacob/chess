// Per-realm 3D surroundings: sky, ground, landmarks, lights and weather.
import {
  AdditiveBlending, BackSide, BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, CircleGeometry, Color,
  ConeGeometry, CylinderGeometry, DoubleSide, Fog, FogExp2, Group, HemisphereLight, DirectionalLight, IcosahedronGeometry,
  Mesh, MeshBasicMaterial, MeshStandardMaterial, NormalBlending, PlaneGeometry, PointLight, Points, PointsMaterial,
  ShaderMaterial, SphereGeometry, type Blending, type Scene, type Texture,
} from 'three';
import type { ParticleKind, Realm } from '../realms';

interface EnvSpec {
  sky: [string, string, string]; // zenith, mid, horizon
  fog: [string, number, number] | [string, number]; // linear [near, far] or exp2 [density]
  ground: string;
  hemi: [string, string, number];
  sun: [string, number, [number, number, number]];
  exposure: number;
  frame: string;
  /** Faint glow on the black pieces where the board itself is very dark. */
  blackGlow?: string;
}

export const ENV: Record<string, EnvSpec> = {
  frost: { sky: ['#0d2340', '#3d6f93', '#c4dff0'], fog: ['#c4dff0', 26, 95], ground: '#eef5fb', hemi: ['#d6ecff', '#5d7f99', 1.2], sun: ['#ffffff', 2.4, [8, 14, 6]], exposure: 1.0, frame: '#34495c' },
  autumn: { sky: ['#2a1208', '#8c3f18', '#f2a65a'], fog: ['#c46a33', 24, 90], ground: '#5a2a12', hemi: ['#ffcf9a', '#3a1a0a', 1.0], sun: ['#ffc58a', 2.6, [-10, 9, 6]], exposure: 1.05, frame: '#3d1d0e' },
  volcano: { sky: ['#0a0302', '#3a0c05', '#b8340f'], fog: ['#5a1407', 18, 80], ground: '#1b0a07', hemi: ['#ff9a6a', '#200604', 0.7], sun: ['#ffb27a', 1.4, [6, 12, -8]], exposure: 1.1, frame: '#1c0b07', blackGlow: '#3a120a' },
  spring: { sky: ['#6fb3e6', '#bfe1f4', '#f2f8ea'], fog: ['#e3f0e0', 30, 110], ground: '#86b97a', hemi: ['#e8f6ff', '#5f8a4f', 1.3], sun: ['#fff4e0', 2.6, [7, 15, 5]], exposure: 1.0, frame: '#5e3f26' },
  rain: { sky: ['#01100e', '#063a32', '#1b7a66'], fog: ['#0b4a3f', 0.04], ground: '#0f4a3f', hemi: ['#7fffe0', '#02140f', 1.0], sun: ['#b8ffe8', 1.8, [3, 15, 2]], exposure: 1.15, frame: '#0b332c' },
  night: { sky: ['#030207', '#140a26', '#3a1d60'], fog: ['#1a0d2e', 20, 85], ground: '#0b0714', hemi: ['#8a6cff', '#05030a', 0.7], sun: ['#c8b8ff', 1.1, [-8, 14, -4]], exposure: 1.2, frame: '#120a1e', blackGlow: '#4a3580' },
  day: { sky: ['#5ea4e0', '#bcdcf2', '#fbf8ef'], fog: ['#f3eee2', 34, 130], ground: '#f2ede2', hemi: ['#ffffff', '#cfc4ae', 1.3], sun: ['#fffaf0', 3.2, [6, 18, 4]], exposure: 0.95, frame: '#7d6c55' },
};

export interface Env {
  group: Group;
  update(t: number, dt: number): void;
  setWeather(on: boolean): void;
  dispose(): void;
}

/** Deterministic PRNG so each realm's layout is the same every visit. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lin = (c: string) => new Color(c);

/** Roughen a geometry while keeping coincident vertices together (no cracks). */
function jitter(g: BufferGeometry, amt: number, seed: number) {
  const pos = g.getAttribute('position') as BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const h = Math.sin(Math.round(x * 97) * 12.9898 + Math.round(y * 89) * 78.233 + Math.round(z * 83) * 37.719 + seed) * 43758.5453;
    const r = h - Math.floor(h) - 0.5;
    const h2 = (h * 1.618) % 1;
    pos.setXYZ(i, x + r * amt, y + (h2 - 0.5) * amt * 0.6, z - r * amt);
  }
  g.computeVertexNormals();
  return g;
}

const SKY_V = /* glsl */ `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_F = /* glsl */ `
  uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP;
  void main(){
    float h = vP.y;
    vec3 c = mix(bot, mid, smoothstep(-0.02, 0.28, h));
    c = mix(c, top, smoothstep(0.28, 0.9, h));
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }`;

// Animated ground overlays: 0 caustics (underwater), 1 lava cracks, 2 salt crust.
const OVER_V = /* glsl */ `varying vec2 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const OVER_F = /* glsl */ `
  uniform float time; uniform int kind; uniform vec3 tint; uniform float strength; varying vec2 vW;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
  float fbm(vec2 p){ float v = 0.0, a = 0.5; for(int i=0;i<4;i++){ v += a*noise(p); p *= 2.03; a *= 0.5; } return v; }
  vec2 cell(vec2 p){ vec2 n = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
    for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){ vec2 g = vec2(i,j); vec2 o = vec2(hash(n+g), hash(n+g+19.1));
      float d = length(g + o - f); if(d < d1){ d2 = d1; d1 = d; } else if(d < d2) d2 = d; }
    return vec2(d1, d2); }
  void main(){
    float fade = 1.0 - smoothstep(14.0, 55.0, length(vW));
    float a = 0.0;
    if (kind == 0) {
      vec2 p = mod(vW * 0.55, 6.2831) - 250.0; vec2 i = p; float c = 1.0; float inten = 0.005;
      for (int n = 0; n < 4; n++) { float t = time * 0.45 * (1.0 - (3.5 / float(n + 1)));
        i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
        c += 1.0 / length(vec2(p.x / (sin(i.x + t) / inten), p.y / (cos(i.y + t) / inten))); }
      c /= 4.0; c = 1.17 - pow(c, 1.4); a = clamp(pow(abs(c), 8.0), 0.0, 1.0);
    } else if (kind == 1) {
      vec2 w = vW * 0.22 + vec2(fbm(vW * 0.1), fbm(vW * 0.1 + 7.0)) * 1.6;
      vec2 d = cell(w); float edge = d.y - d.x;
      float glow = 1.0 - smoothstep(0.0, 0.09, edge);
      float pulse = 0.65 + 0.35 * sin(time * 1.3 + fbm(vW * 0.3) * 6.0);
      a = glow * pulse;
    } else {
      vec2 d = cell(vW * 0.35); float edge = d.y - d.x;
      a = (1.0 - smoothstep(0.0, 0.05, edge)) * 0.55;
    }
    gl_FragColor = vec4(tint * (kind == 2 ? 1.0 : a * strength), (kind == 2 ? a : 1.0) * fade);
    #include <colorspace_fragment>
  }`;

function overlay(kind: 0 | 1 | 2, tint: string, strength: number, blending: Blending) {
  const mat = new ShaderMaterial({
    uniforms: { time: { value: 0 }, kind: { value: kind }, tint: { value: lin(tint) }, strength: { value: strength } },
    vertexShader: OVER_V,
    fragmentShader: OVER_F,
    transparent: true,
    depthWrite: false,
    blending,
  });
  const m = new Mesh(new PlaneGeometry(130, 130), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = -0.98;
  return { mesh: m, mat };
}

function sprite(kind: ParticleKind): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  if (kind === 'bubbles') {
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 5;
    g.beginPath(); g.arc(32, 32, 24, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.beginPath(); g.arc(23, 22, 6, 0, Math.PI * 2); g.fill();
  } else if (kind === 'leaves' || kind === 'petals') {
    g.fillStyle = '#fff';
    g.translate(32, 32); g.rotate(0.6);
    g.beginPath(); g.ellipse(0, 0, 26, kind === 'leaves' ? 13 : 17, 0, 0, Math.PI * 2); g.fill();
  } else {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    const hard = kind === 'snow';
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(hard ? 0.45 : 0.2, 'rgba(255,255,255,0.85)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  }
  const t = new CanvasTexture(c);
  return t;
}

const PARTICLE: Record<ParticleKind, { size: number; mult: number; additive: boolean }> = {
  snow: { size: 0.2, mult: 3, additive: false },
  leaves: { size: 0.42, mult: 3, additive: false },
  petals: { size: 0.3, mult: 3, additive: false },
  embers: { size: 0.16, mult: 3, additive: true },
  bubbles: { size: 0.26, mult: 3, additive: false },
  wisps: { size: 0.9, mult: 2, additive: true },
  glints: { size: 0.22, mult: 3, additive: true },
};

function weather(realm: Realm, rnd: () => number) {
  const { kind, colors, count } = realm.particles;
  const spec = PARTICLE[kind];
  const n = Math.round(count * spec.mult);
  const R = 20, Y0 = -1, Y1 = 15;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const base = new Float32Array(n * 3);
  const vel = new Float32Array(n * 3);
  const phase = new Float32Array(n);
  const tmp = new Color();
  const spawn = (i: number, initial: boolean) => {
    const rising = kind === 'embers' || kind === 'bubbles' || kind === 'wisps';
    pos[i * 3] = (rnd() * 2 - 1) * R;
    pos[i * 3 + 2] = (rnd() * 2 - 1) * R;
    pos[i * 3 + 1] = initial || kind === 'glints' ? Y0 + rnd() * (Y1 - Y0) : rising ? Y0 : Y1;
    if (kind === 'glints') pos[i * 3 + 1] = -0.95 + rnd() * 0.6;
    const speed: Record<ParticleKind, [number, number]> = {
      snow: [-1.3, -0.5], leaves: [-1.1, -0.5], petals: [-0.9, -0.4], embers: [0.8, 2.6], bubbles: [0.5, 1.4], wisps: [0.08, 0.35], glints: [0, 0],
    };
    const [a, b] = speed[kind];
    vel[i * 3 + 1] = a + rnd() * (b - a);
    vel[i * 3] = kind === 'leaves' || kind === 'petals' ? 0.3 + rnd() * 0.6 : (rnd() - 0.5) * 0.3;
    vel[i * 3 + 2] = (rnd() - 0.5) * 0.3;
  };
  for (let i = 0; i < n; i++) {
    spawn(i, true);
    tmp.set(colors[Math.floor(rnd() * colors.length)]);
    base[i * 3] = col[i * 3] = tmp.r;
    base[i * 3 + 1] = col[i * 3 + 1] = tmp.g;
    base[i * 3 + 2] = col[i * 3 + 2] = tmp.b;
    phase[i] = rnd() * Math.PI * 2;
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('color', new BufferAttribute(col, 3));
  const mat = new PointsMaterial({
    size: spec.size,
    map: sprite(kind),
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    alphaTest: spec.additive ? 0 : 0.05,
    blending: spec.additive ? AdditiveBlending : NormalBlending,
    opacity: kind === 'bubbles' ? 0.55 : 0.95,
  });
  const points = new Points(geo, mat);
  points.frustumCulled = false;

  const flicker = kind === 'embers' || kind === 'glints' || kind === 'wisps';
  const update = (t: number, dt: number) => {
    for (let i = 0; i < n; i++) {
      const j = i * 3;
      const sway = Math.sin(t * 0.9 + phase[i]);
      pos[j] += (vel[j] + (kind === 'embers' ? 0 : sway * (kind === 'wisps' ? 0.25 : 0.35))) * dt;
      pos[j + 1] += vel[j + 1] * dt;
      pos[j + 2] += (vel[j + 2] + Math.cos(t * 0.7 + phase[i]) * 0.15) * dt;
      if (pos[j + 1] < Y0 || pos[j + 1] > Y1 || Math.abs(pos[j]) > R || Math.abs(pos[j + 2]) > R) spawn(i, false);
      if (flicker) {
        const k = kind === 'glints' ? Math.pow(Math.max(0, Math.sin(t * 1.7 + phase[i] * 3)), 10) : kind === 'embers' ? 0.55 + 0.45 * Math.sin(t * 9 + phase[i] * 5) : 0.5 + 0.5 * Math.sin(t * 1.2 + phase[i]);
        col[j] = base[j] * k; col[j + 1] = base[j + 1] * k; col[j + 2] = base[j + 2] * k;
      }
    }
    geo.attributes.position.needsUpdate = true;
    if (flicker) geo.attributes.color.needsUpdate = true;
  };
  if (kind === 'glints') update(0, 0); // set initial twinkle so static (reduced-motion) frames aren't blank
  return { points, update };
}

// ---------- props ----------

function rock(radius: number, height: number, seg: number, color: string, seed: number, emissive?: string) {
  const g = jitter(new ConeGeometry(radius, height, seg, 3), radius * 0.18, seed);
  const m = new Mesh(g, new MeshStandardMaterial({ color, flatShading: true, roughness: 0.95, emissive: emissive ?? '#000', emissiveIntensity: emissive ? 0.25 : 0 }));
  m.position.y = height / 2 - 1;
  return m;
}

function ringOf(n: number, rmin: number, rmax: number, rnd: () => number, make: (i: number) => Mesh | Group, gapFront = true) {
  const g = new Group();
  for (let i = 0; i < n; i++) {
    let a = (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.4;
    // Keep the view behind the white player clear-ish so the board isn't framed by a wall.
    if (gapFront && Math.abs(Math.sin(a)) > 0.92 && Math.sin(a) > 0) a += 0.6;
    const r = rmin + rnd() * (rmax - rmin);
    const m = make(i);
    m.position.x = Math.cos(a) * r;
    m.position.z = Math.sin(a) * r;
    m.rotation.y = rnd() * Math.PI * 2;
    g.add(m);
  }
  return g;
}

function tree(rnd: () => number, crown: string[], trunk = '#3b2316', scale = 1) {
  const g = new Group();
  const h = (1.6 + rnd() * 1.4) * scale;
  const t = new Mesh(new CylinderGeometry(0.12 * scale, 0.22 * scale, h, 6), new MeshStandardMaterial({ color: trunk, roughness: 1 }));
  t.position.y = h / 2 - 1;
  g.add(t);
  for (let k = 0; k < 3; k++) {
    const r = (0.8 + rnd() * 0.6) * scale;
    const c = new Mesh(new IcosahedronGeometry(r, 0), new MeshStandardMaterial({ color: crown[Math.floor(rnd() * crown.length)], flatShading: true, roughness: 0.9 }));
    c.position.set((rnd() - 0.5) * scale, h - 1 + (rnd() * 0.6 - 0.1) * scale, (rnd() - 0.5) * scale);
    c.castShadow = true;
    g.add(c);
  }
  return g;
}

function pine(rnd: () => number, snowy: boolean) {
  const g = new Group();
  const h = 2.5 + rnd() * 2.5;
  const green = new MeshStandardMaterial({ color: '#28443f', flatShading: true, roughness: 1 });
  for (let k = 0; k < 3; k++) {
    const c = new Mesh(new ConeGeometry(1.1 - k * 0.28, h * 0.45, 7), green);
    c.position.y = -1 + h * 0.3 + k * h * 0.22;
    g.add(c);
    if (snowy) {
      const s = new Mesh(new ConeGeometry((1.1 - k * 0.28) * 0.55, h * 0.2, 7), new MeshStandardMaterial({ color: '#f4fbff', flatShading: true }));
      s.position.y = c.position.y + h * 0.14;
      g.add(s);
    }
  }
  return g;
}

function torii(z: number) {
  const g = new Group();
  const red = new MeshStandardMaterial({ color: '#b3261e', roughness: 0.6 });
  const black = new MeshStandardMaterial({ color: '#1a1414', roughness: 0.6 });
  for (const x of [-2.6, 2.6]) {
    const p = new Mesh(new CylinderGeometry(0.22, 0.27, 5.6, 12), red);
    p.position.set(x, 1.8, 0);
    p.castShadow = true;
    g.add(p);
  }
  const top = new Mesh(new BoxGeometry(7.6, 0.4, 0.6), black);
  top.position.y = 4.75;
  const lintel = new Mesh(new BoxGeometry(6.6, 0.3, 0.35), red);
  lintel.position.y = 3.9;
  const plaque = new Mesh(new BoxGeometry(0.5, 0.75, 0.12), black);
  plaque.position.set(0, 4.3, 0.2);
  g.add(top, lintel, plaque);
  g.position.z = z;
  g.scale.setScalar(1.25);
  return g;
}

// ---------- assembly ----------

export function buildEnv(scene: Scene, realm: Realm): Env {
  const spec = ENV[realm.id] ?? ENV.frost;
  const rnd = rng([...realm.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
  const group = new Group();
  const updaters: ((t: number, dt: number) => void)[] = [];

  // Sky dome
  const sky = new Mesh(
    new SphereGeometry(140, 32, 16),
    new ShaderMaterial({
      uniforms: { top: { value: lin(spec.sky[0]) }, mid: { value: lin(spec.sky[1]) }, bot: { value: lin(spec.sky[2]) } },
      vertexShader: SKY_V,
      fragmentShader: SKY_F,
      side: BackSide,
      depthWrite: false,
      fog: false,
    }),
  );
  group.add(sky);
  scene.background = lin(spec.sky[2]);
  scene.fog = spec.fog.length === 2 ? new FogExp2(spec.fog[0], spec.fog[1]) : new Fog(spec.fog[0], spec.fog[1], spec.fog[2]);

  // Ground
  const ground = new Mesh(new CircleGeometry(150, 48), new MeshStandardMaterial({ color: spec.ground, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1;
  ground.receiveShadow = true;
  group.add(ground);

  // Lights
  const hemi = new HemisphereLight(spec.hemi[0], spec.hemi[1], spec.hemi[2]);
  const sun = new DirectionalLight(spec.sun[0], spec.sun[1]);
  sun.position.set(...spec.sun[2]);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -8;
  sc.right = sc.top = 8;
  sc.near = 1;
  sc.far = 40;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.02;
  group.add(hemi, sun, sun.target);

  const mountain = realm.vars['--mountain'];
  switch (realm.id) {
    case 'frost': {
      group.add(ringOf(16, 38, 62, rnd, (i) => {
        const h = 14 + rnd() * 18, r = 9 + rnd() * 8;
        const m = rock(r, h, 7, mountain, i);
        const cap = rock(r * 0.36, h * 0.36, 7, '#ffffff', i + 50);
        cap.position.y = h * 0.82 - 1 - h * 0.18;
        const g = new Group();
        g.add(m, cap);
        return g;
      }, false));
      group.add(ringOf(22, 10, 22, rnd, () => pine(rnd, true)));
      // Frozen pond
      const ice = new Mesh(new CircleGeometry(4, 24), new MeshStandardMaterial({ color: '#a9d8f2', roughness: 0.08, metalness: 0.2 }));
      ice.rotation.x = -Math.PI / 2;
      ice.position.set(-9, -0.97, 5);
      group.add(ice);
      break;
    }
    case 'autumn': {
      group.add(ringOf(14, 40, 60, rnd, (i) => rock(12 + rnd() * 8, 8 + rnd() * 10, 8, mountain, i), false));
      group.add(ringOf(16, 9, 20, rnd, () => tree(rnd, ['#e0612b', '#c73e1d', '#e8a33d', '#a5521f'])));
      group.add(torii(-20));
      break;
    }
    case 'volcano': {
      const cone = new Mesh(
        jitter(new CylinderGeometry(5, 28, 26, 11, 3, true), 1.5, 3),
        new MeshStandardMaterial({ color: '#2a0c06', flatShading: true, roughness: 1, side: DoubleSide }),
      );
      cone.position.set(6, 12, -55);
      const crater = new Mesh(new CircleGeometry(5.2, 16), new MeshBasicMaterial({ color: '#ff7a24', fog: false }));
      crater.rotation.x = -Math.PI / 2;
      crater.position.set(6, 24.6, -55);
      const plume = new PointLight('#ff5a12', 60, 70, 1.6);
      plume.position.set(6, 28, -50);
      group.add(cone, crater, plume);
      group.add(ringOf(14, 26, 46, rnd, (i) => rock(4 + rnd() * 6, 6 + rnd() * 14, 6, '#160604', i, '#ff3b0f')));
      const lava = overlay(1, '#ff5a14', 2.2, AdditiveBlending);
      group.add(lava.mesh);
      const glow = new PointLight('#ff6a1a', 14, 22, 1.4);
      glow.position.set(0, 2.5, 0);
      group.add(glow);
      updaters.push((t) => {
        lava.mat.uniforms.time.value = t;
        glow.intensity = 12 + Math.sin(t * 7) * 1.5 + Math.sin(t * 13.3) * 1.2;
        plume.intensity = 55 + Math.sin(t * 2.1) * 10;
      });
      break;
    }
    case 'spring': {
      group.add(ringOf(14, 42, 64, rnd, (i) => rock(14 + rnd() * 8, 6 + rnd() * 8, 9, mountain, i), false));
      group.add(ringOf(14, 9, 20, rnd, () => tree(rnd, ['#f7b7c8', '#f39bb5', '#ffd6e0', '#ffffff'], '#5a3b2a')));
      group.add(torii(-20));
      const pond = new Mesh(new CircleGeometry(3.5, 24), new MeshStandardMaterial({ color: '#6fb6c8', roughness: 0.1, metalness: 0.1 }));
      pond.rotation.x = -Math.PI / 2;
      pond.position.set(9, -0.97, 4);
      group.add(pond);
      break;
    }
    case 'rain': {
      const jade = new MeshStandardMaterial({ color: '#2c6a5a', roughness: 0.5, emissive: '#0b3a30', emissiveIntensity: 0.4 });
      group.add(ringOf(12, 9, 13, rnd, () => {
        const h = 2.5 + rnd() * 7;
        const p = new Mesh(new CylinderGeometry(0.45, 0.55, h, 10), jade);
        p.position.y = h / 2 - 1;
        p.rotation.z = (rnd() - 0.5) * 0.25;
        p.castShadow = true;
        return p;
      }));
      const weeds: Mesh[] = [];
      group.add(ringOf(30, 6.5, 24, rnd, () => {
        const h = 1.5 + rnd() * 3;
        const g = new ConeGeometry(0.12, h, 5);
        g.translate(0, h / 2, 0);
        const w = new Mesh(g, new MeshStandardMaterial({ color: rnd() > 0.5 ? '#1d7a66' : '#3a9a5a', flatShading: true }));
        w.position.y = -1;
        weeds.push(w);
        return w;
      }));
      group.add(ringOf(10, 30, 50, rnd, (i) => rock(6 + rnd() * 6, 8 + rnd() * 10, 7, '#0d3b33', i), false));
      const caustics = overlay(0, '#b9ffe9', 0.9, AdditiveBlending);
      group.add(caustics.mesh);
      const rays: Mesh[] = [];
      for (let i = 0; i < 6; i++) {
        const ray = new Mesh(
          new CylinderGeometry(0.6, 2.2, 22, 12, 1, true),
          new MeshBasicMaterial({ color: '#a6ffe0', transparent: true, opacity: 0.05, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false }),
        );
        ray.position.set((rnd() - 0.5) * 18, 9, (rnd() - 0.5) * 18);
        ray.rotation.z = 0.25;
        rays.push(ray);
        group.add(ray);
      }
      updaters.push((t) => {
        caustics.mat.uniforms.time.value = t;
        weeds.forEach((w, i) => (w.rotation.z = Math.sin(t * 0.8 + i) * 0.12));
        rays.forEach((r, i) => ((r.material as MeshBasicMaterial).opacity = 0.035 + 0.025 * Math.sin(t * 0.6 + i * 1.7)));
      });
      break;
    }
    case 'night': {
      group.add(ringOf(18, 14, 40, rnd, (i) => rock(1.2 + rnd() * 2.2, 6 + rnd() * 16, 5, '#120a20', i, '#4a2477')));
      const moon = new Mesh(new SphereGeometry(5, 24, 16), new MeshBasicMaterial({ color: '#e6dcff', fog: false }));
      moon.position.set(-40, 42, -80);
      group.add(moon);
      const lanterns: { m: Mesh; y: number; p: number }[] = [];
      const cols = ['#b57bff', '#5af0ff', '#e0b3ff'];
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2, r = 7 + rnd() * 8;
        const m = new Mesh(new SphereGeometry(0.16 + rnd() * 0.12, 10, 8), new MeshBasicMaterial({ color: cols[i % 3] }));
        const y = 1 + rnd() * 4;
        m.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
        lanterns.push({ m, y, p: rnd() * 6 });
        group.add(m);
      }
      const l1 = new PointLight('#b57bff', 10, 20, 1.5);
      const l2 = new PointLight('#5af0ff', 7, 18, 1.5);
      l1.position.set(-5, 3, -3);
      l2.position.set(5, 2.5, 4);
      group.add(l1, l2);
      updaters.push((t) => {
        lanterns.forEach((l) => (l.m.position.y = l.y + Math.sin(t * 0.7 + l.p) * 0.5));
        l1.position.x = -5 + Math.sin(t * 0.3) * 2;
        l2.position.z = 4 + Math.cos(t * 0.25) * 2;
      });
      break;
    }
    case 'day': {
      group.add(ringOf(10, 55, 80, rnd, (i) => {
        const h = 3 + rnd() * 5;
        const m = new Mesh(jitter(new CylinderGeometry(6 + rnd() * 6, 9 + rnd() * 8, h, 8, 2), 0.8, i), new MeshStandardMaterial({ color: mountain, flatShading: true, roughness: 1 }));
        m.position.y = h / 2 - 1;
        return m;
      }, false));
      const sunDisc = new Mesh(new SphereGeometry(6, 24, 16), new MeshBasicMaterial({ color: '#fff6d0', fog: false }));
      sunDisc.position.set(40, 60, -90);
      group.add(sunDisc);
      group.add(overlay(2, '#b8ab8f', 1, NormalBlending).mesh);
      break;
    }
  }

  const wx = weather(realm, rnd);
  group.add(wx.points);
  scene.add(group);

  return {
    group,
    update(t, dt) {
      if (wx.points.visible) wx.update(t, dt);
      for (const u of updaters) u(t, dt);
    },
    setWeather(on) {
      wx.points.visible = on;
    },
    dispose() {
      scene.remove(group);
      group.traverse((o) => {
        const m = o as Mesh;
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        for (const mat of mats) {
          (mat as MeshBasicMaterial).map?.dispose();
          mat.dispose();
        }
      });
    },
  };
}
