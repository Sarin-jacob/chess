// The immersive 3D board: renderer, camera, board, pieces, highlights and picking.
import {
  ACESFilmicToneMapping, BoxGeometry, CanvasTexture, CircleGeometry, Clock, Color, Group, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, PCFSoftShadowMap, PerspectiveCamera, PlaneGeometry, Raycaster, RingGeometry, Scene, SRGBColorSpace,
  Vector2, Vector3, WebGLRenderer, type BufferGeometry, type Object3D,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Realm } from '../realms';
import { buildEnv, ENV, type Env } from './env3d';
import { buildPieceGeometries } from './pieces3d';

type Color2 = 'w' | 'b';
const FILES = 'abcdefgh';

export interface Marks {
  selected: string | null;
  dests: { to: string; capture: boolean }[];
  lastMove: { from: string; to: string } | null;
  check: string | null;
  hint: { from: string; to: string } | null;
}

const sqPos = (sq: string) => ({ x: FILES.indexOf(sq[0]) - 3.5, z: 4.5 - +sq[1] });

/** CSS colour (hex or rgba()) → colour + alpha. */
function css(s: string): { color: Color; alpha: number } {
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (!m) return { color: new Color(s), alpha: 1 };
  const [r, g, b, a = '1'] = m[1].split(',').map((x) => x.trim());
  return { color: new Color(`rgb(${r}, ${g}, ${b})`), alpha: +a };
}

function parseFen(fen: string): Map<string, string> {
  const map = new Map<string, string>();
  fen.split(' ')[0].split('/').forEach((row, r) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) f += +ch;
      else {
        map.set(FILES[f] + (8 - r), (ch === ch.toUpperCase() ? 'w' : 'b') + ch.toLowerCase());
        f++;
      }
    }
  });
  return map;
}

function label(text: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f3ead8';
  g.font = '600 38px Georgia, "Times New Roman", serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 32, 34);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export interface SceneOptions {
  reduceMotion: boolean;
  onPick: (square: string | null) => void;
  /** Return true when hovering this square should show a pointer cursor. */
  pickable: (square: string) => boolean;
}

export class ChessScene {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(40, 1, 0.1, 400);
  private controls: OrbitControls;
  private clock = new Clock();
  private env: Env | null = null;
  private realm: Realm | null = null;

  private squares: Mesh[] = [];
  private squareMats: { light: MeshStandardMaterial; dark: MeshStandardMaterial };
  private frameMat = new MeshStandardMaterial({ color: '#333', roughness: 0.55 });
  private overlays = new Map<string, Mesh>();
  private destGroup = new Group();
  private pieceGroup = new Group();
  private coordGroup = new Group();
  private geos: Record<string, BufferGeometry>;
  private pieceMats = {
    w: new MeshStandardMaterial({ color: '#efe6d2', roughness: 0.38, metalness: 0.05 }),
    b: new MeshStandardMaterial({ color: '#25222b', roughness: 0.3, metalness: 0.25 }),
  };
  private selMats = {
    w: this.pieceMats.w.clone(),
    b: this.pieceMats.b.clone(),
  };
  private dotGeo = new CircleGeometry(0.15, 24);
  private ringGeo = new RingGeometry(0.38, 0.47, 32);
  private destMat = new MeshBasicMaterial({ transparent: true, opacity: 0.65, depthWrite: false });

  private fen = '';
  private marks: Marks = { selected: null, dests: [], lastMove: null, check: null, hint: null };
  private hops: { mesh: Mesh; from: Vector3; to: Vector3; t0: number; dur: number }[] = [];
  private orientation: Color2 = 'w';
  private spin: { from: number; to: number; t0: number } | null = null;
  private visible = true;
  private io: IntersectionObserver;
  private ro: ResizeObserver;
  private down: { x: number; y: number; t: number } | null = null;
  private ray = new Raycaster();
  private ndc = new Vector2();
  private disposed = false;
  /** Camera distance multiplier for the current aspect ratio. */
  private fit = 1;

  constructor(private host: HTMLElement, private opts: SceneOptions) {
    const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.touchAction = 'none';
    host.appendChild(renderer.domElement);
    this.renderer = renderer;

    // Low enough to see the realm's horizon past the far rank.
    this.camera.position.set(0, 8.8, 12.4);
    const c = new OrbitControls(this.camera, renderer.domElement);
    c.target.set(0, 0, -0.9);
    c.enablePan = false;
    c.enableDamping = !opts.reduceMotion;
    c.dampingFactor = 0.08;
    c.minDistance = 6;
    c.maxDistance = 28;
    c.minPolarAngle = 0.12;
    c.maxPolarAngle = 1.32;
    c.rotateSpeed = 0.7;
    c.update();
    this.controls = c;

    this.geos = buildPieceGeometries();
    // Selected pieces glow a little; black's glow colour is set per realm in setRealm.
    this.selMats.w.emissive.set('#ffffff');
    this.selMats.w.emissiveIntensity = 0.12;
    this.squareMats = { light: new MeshStandardMaterial({ roughness: 0.55 }), dark: new MeshStandardMaterial({ roughness: 0.55 }) };
    this.buildBoard();
    this.scene.add(this.pieceGroup, this.destGroup, this.coordGroup);

    const el = renderer.domElement;
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('contextmenu', (e) => e.preventDefault());

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.io = new IntersectionObserver(([e]) => (this.visible = e.isIntersecting));
    this.io.observe(host);
    this.resize();
    renderer.setAnimationLoop(this.frame);
  }

  // ---------- construction ----------

  private buildBoard() {
    const sqGeo = new BoxGeometry(1, 0.12, 1);
    for (let f = 0; f < 8; f++)
      for (let r = 1; r <= 8; r++) {
        const sq = FILES[f] + r;
        const light = (f + r) % 2 === 1;
        const m = new Mesh(sqGeo, light ? this.squareMats.light : this.squareMats.dark);
        const p = sqPos(sq);
        m.position.set(p.x, -0.06, p.z);
        m.receiveShadow = true;
        m.userData.sq = sq;
        this.squares.push(m);
        this.scene.add(m);

        const o = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ transparent: true, depthWrite: false }));
        o.rotation.x = -Math.PI / 2;
        o.position.set(p.x, 0.003, p.z);
        o.visible = false;
        o.renderOrder = 1;
        this.overlays.set(sq, o);
        this.scene.add(o);
      }
    const frame = new Mesh(new BoxGeometry(9.1, 0.36, 9.1), this.frameMat);
    frame.position.y = -0.2;
    frame.receiveShadow = frame.castShadow = true;
    const dais = new Mesh(new BoxGeometry(10.6, 0.62, 10.6), new MeshStandardMaterial({ color: '#6d6a66', roughness: 0.9 }));
    dais.position.y = -0.69;
    dais.receiveShadow = true;
    dais.castShadow = true;
    this.scene.add(frame, dais);

    for (let i = 0; i < 8; i++) {
      for (const [text, x, z] of [
        [FILES[i], i - 3.5, 4.28],
        [String(i + 1), -4.28, 3.5 - i],
      ] as [string, number, number][]) {
        const m = new Mesh(new PlaneGeometry(0.42, 0.42), new MeshBasicMaterial({ map: label(text), transparent: true, depthWrite: false, opacity: 0.85 }));
        m.rotation.x = -Math.PI / 2;
        m.position.set(x, -0.015, z);
        m.userData.home = { x, z };
        this.coordGroup.add(m);
      }
    }
  }

  // ---------- public API ----------

  setRealm(realm: Realm) {
    if (this.realm?.id === realm.id) return;
    this.realm = realm;
    this.env?.dispose();
    this.env = buildEnv(this.scene, realm);
    this.renderer.toneMappingExposure = (ENV[realm.id] ?? ENV.frost).exposure;
    this.squareMats.light.color.set(realm.vars['--light']);
    this.squareMats.dark.color.set(realm.vars['--dark']);
    this.frameMat.color.set((ENV[realm.id] ?? ENV.frost).frame);
    const glow = (ENV[realm.id] ?? ENV.frost).blackGlow ?? '#000000';
    this.pieceMats.b.emissive.set(glow);
    this.selMats.b.emissive.set(glow).lerp(new Color('#ffffff'), 0.25);
    this.destMat.color.copy(css(realm.vars['--accent']).color);
    this.applyMarks();
  }

  setWeather(on: boolean) {
    this.env?.setWeather(on);
  }

  setCoords(on: boolean) {
    this.coordGroup.visible = on;
  }

  setOrientation(o: Color2, instant = false) {
    if (o === this.orientation && !instant) return;
    this.orientation = o;
    // Labels read the right way up from the side the player sits on.
    for (const m of this.coordGroup.children) {
      const h = m.userData.home as { x: number; z: number };
      const s = o === 'w' ? 1 : -1;
      m.position.set(h.x * (Math.abs(h.x) > 4 ? s : 1), -0.015, h.z * (Math.abs(h.z) > 4 ? s : 1));
      m.rotation.z = o === 'w' ? 0 : Math.PI;
    }
    const az = Math.atan2(this.camera.position.x, this.camera.position.z);
    const goal = o === 'w' ? 0 : Math.PI;
    // Shortest turn to the player's side, wherever the camera was orbited to.
    let delta = goal - az;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    if (Math.abs(delta) < 0.01) return;
    if (instant || this.opts.reduceMotion) this.rotateCamera(delta);
    else this.spin = { from: az, to: az + delta, t0: this.clock.getElapsedTime() };
  }

  setPosition(fen: string, lastMove: { from: string; to: string } | null) {
    const board = fen.split(' ')[0];
    if (board === this.fen) return;
    const first = !this.fen;
    this.fen = board;
    this.hops = [];
    this.pieceGroup.clear();
    for (const [sq, code] of parseFen(fen)) {
      const m = new Mesh(this.geos[code[1]], this.pieceMats[code[0] as Color2]);
      const p = sqPos(sq);
      m.position.set(p.x, 0, p.z);
      // Knights show their profile, facing the centre files and turned a little toward the enemy.
      if (code[1] === 'n') {
        const inward = FILES.indexOf(sq[0]) < 4 ? 0 : Math.PI;
        const lean = (code[0] === 'w' ? 0.45 : -0.45) * (inward ? -1 : 1);
        m.rotation.y = inward + lean;
      }
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData.sq = sq;
      m.userData.color = code[0];
      this.pieceGroup.add(m);
    }
    if (!first && lastMove && !this.opts.reduceMotion) {
      const now = this.clock.getElapsedTime();
      const hop = (from: string, to: string) => {
        const mesh = this.pieceGroup.children.find((c) => c.userData.sq === to) as Mesh | undefined;
        if (!mesh) return;
        const a = sqPos(from), b = sqPos(to);
        const dist = Math.hypot(a.x - b.x, a.z - b.z);
        this.hops.push({ mesh, from: new Vector3(a.x, 0, a.z), to: new Vector3(b.x, 0, b.z), t0: now, dur: 0.22 + dist * 0.04 });
        mesh.position.set(a.x, 0, a.z);
      };
      hop(lastMove.from, lastMove.to);
      // Castling: slide the rook too.
      const kingMoved = parseFen(fen).get(lastMove.to)?.[1] === 'k';
      const df = FILES.indexOf(lastMove.to[0]) - FILES.indexOf(lastMove.from[0]);
      if (kingMoved && Math.abs(df) === 2) {
        const rank = lastMove.to[1];
        hop((df > 0 ? 'h' : 'a') + rank, (df > 0 ? 'f' : 'd') + rank);
      }
    }
    this.applyMarks();
  }

  setMarks(m: Marks) {
    this.marks = m;
    this.applyMarks();
  }

  dispose() {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.ro.disconnect();
    this.io.disconnect();
    this.controls.dispose();
    this.env?.dispose();
    this.scene.traverse((o: Object3D) => {
      const m = o as Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) {
        (mat as MeshBasicMaterial).map?.dispose();
        mat.dispose();
      }
    });
    Object.values(this.geos).forEach((g) => g.dispose());
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  // ---------- internals ----------

  private applyMarks() {
    if (!this.realm) return;
    const v = this.realm.vars;
    const { selected, dests, lastMove, check, hint } = this.marks;
    for (const [sq, o] of this.overlays) {
      let c: string | null = null;
      if (check === sq) c = v['--check'];
      else if (selected === sq) c = v['--hl'];
      else if (hint && (hint.from === sq || hint.to === sq)) c = v['--accent'];
      else if (lastMove && (lastMove.from === sq || lastMove.to === sq)) c = v['--last'];
      o.visible = !!c;
      o.userData.hint = !!c && c === v['--accent'];
      if (c) {
        const { color, alpha } = css(c);
        const mat = o.material as MeshBasicMaterial;
        mat.color.copy(color);
        mat.opacity = o.userData.hint ? 0.55 : Math.min(0.9, alpha + 0.1);
      }
    }
    this.destGroup.clear();
    for (const d of dests) {
      const m = new Mesh(d.capture ? this.ringGeo : this.dotGeo, this.destMat);
      const p = sqPos(d.to);
      m.rotation.x = -Math.PI / 2;
      m.position.set(p.x, 0.006, p.z);
      m.renderOrder = 2;
      this.destGroup.add(m);
    }
    for (const c of this.pieceGroup.children) {
      const m = c as Mesh;
      const col = m.userData.color as Color2;
      const sel = m.userData.sq === selected;
      m.material = sel ? this.selMats[col] : this.pieceMats[col];
      if (!this.hops.some((h) => h.mesh === m)) m.position.y = sel ? 0.14 : 0;
    }
  }

  /** Swing the camera (and the point it looks at) around the board's vertical axis. */
  private rotateCamera(delta: number) {
    const cos = Math.cos(delta), sin = Math.sin(delta);
    for (const p of [this.camera.position, this.controls.target]) p.set(p.x * cos + p.z * sin, p.y, -p.x * sin + p.z * cos);
    this.controls.update();
  }

  private resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.aspect = aspect;
    // On tall screens keep the board's width in frame: widen the lens a bit and step back the rest.
    const narrow = Math.min(1, aspect);
    this.camera.fov = (2 * Math.atan(Math.tan((20 * Math.PI) / 180) / Math.sqrt(narrow)) * 180) / Math.PI;
    this.camera.updateProjectionMatrix();
    const fit = 1 / Math.sqrt(narrow);
    if (Math.abs(fit - this.fit) > 0.01) {
      const offset = this.camera.position.clone().sub(this.controls.target).multiplyScalar(fit / this.fit);
      this.camera.position.copy(this.controls.target).add(offset);
      this.controls.maxDistance = 28 * fit;
      this.fit = fit;
      this.controls.update();
    }
  }

  private frame = () => {
    if (this.disposed) return;
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.getElapsedTime();
    if (!this.visible) return;
    if (this.spin) {
      const k = Math.min(1, (t - this.spin.t0) / 0.7);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      const target = this.spin.from + (this.spin.to - this.spin.from) * e;
      const cur = Math.atan2(this.camera.position.x, this.camera.position.z);
      this.rotateCamera(target - cur);
      if (k >= 1) this.spin = null;
    }
    this.hops = this.hops.filter((h) => {
      const k = Math.min(1, (t - h.t0) / h.dur);
      const e = 1 - Math.pow(1 - k, 3);
      h.mesh.position.lerpVectors(h.from, h.to, e);
      h.mesh.position.y = Math.sin(Math.PI * k) * 0.45;
      return k < 1;
    });
    if (!this.opts.reduceMotion) {
      this.env?.update(t, dt);
      for (const o of this.overlays.values())
        if (o.visible && o.userData.hint) (o.material as MeshBasicMaterial).opacity = 0.3 + 0.3 * (0.5 + 0.5 * Math.sin(t * 5));
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  private pick(e: PointerEvent): string | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const hit = this.ray.intersectObjects(this.pieceGroup.children, false)[0] ?? this.ray.intersectObjects(this.squares, false)[0];
    return (hit?.object.userData.sq as string | undefined) ?? null;
  }

  private onDown = (e: PointerEvent) => {
    this.down = { x: e.clientX, y: e.clientY, t: performance.now() };
  };

  private onUp = (e: PointerEvent) => {
    const d = this.down;
    this.down = null;
    if (!d || e.button > 0) return;
    // A drag means the player was orbiting the camera, not choosing a square.
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8 || performance.now() - d.t > 700) return;
    this.opts.onPick(this.pick(e));
  };

  private onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.buttons) return;
    const sq = this.pick(e);
    this.renderer.domElement.style.cursor = sq && this.opts.pickable(sq) ? 'pointer' : 'grab';
  };
}
