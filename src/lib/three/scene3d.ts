// The 3D board: renderer, fixed camera views, realm-carved pieces, highlights and picking.
// The canvas is transparent so the flat realm scenery shows behind the board.
import {
  ACESFilmicToneMapping, BoxGeometry, CanvasTexture, CircleGeometry, Clock, Color, DirectionalLight, Group, HemisphereLight,
  Mesh, MeshBasicMaterial, MeshPhysicalMaterial, PCFSoftShadowMap, PerspectiveCamera, PlaneGeometry, PMREMGenerator,
  Raycaster, RingGeometry, Scene, ShadowMaterial, SRGBColorSpace, Vector2, Vector3, WebGLRenderer,
  type BufferGeometry, type Object3D, type Texture,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Realm } from '../realms';
import { lookFor, outlineMaterial, pieceMaterial, texture } from './look3d';
import { buildPieceGeometries, type PieceGeometry } from './pieces3d';

type Color2 = 'w' | 'b';
const FILES = 'abcdefgh';

export type View = 'player' | 'top' | 'low';
export const VIEWS: { id: View; label: string }[] = [
  { id: 'player', label: 'Player' },
  { id: 'top', label: 'Overhead' },
  { id: 'low', label: 'Low' },
];
/** Angle down from straight overhead, how far back to sit, and where to aim along the board. */
const VIEW_POSE: Record<View, { polar: number; dist: number; aim: number }> = {
  player: { polar: 0.72, dist: 1.22, aim: -0.3 },
  top: { polar: 0.001, dist: 1.12, aim: 0 },
  low: { polar: 1.05, dist: 1.05, aim: -0.9 },
};

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

interface Pose { az: number; polar: number; dist: number; aim: number }

export class ChessScene {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(36, 1, 0.1, 200);
  private clock = new Clock();
  private realm: Realm | null = null;
  private envMap: Texture;

  private hemi = new HemisphereLight();
  private key = new DirectionalLight();
  private rim = new DirectionalLight();

  private squares: Mesh[] = [];
  private squareMats = { light: new MeshPhysicalMaterial(), dark: new MeshPhysicalMaterial() };
  private frameMat = new MeshPhysicalMaterial({ roughness: 0.45, clearcoat: 0.5 });
  private overlays = new Map<string, Mesh>();
  private destGroup = new Group();
  private pieceGroup = new Group();
  private coordGroup = new Group();
  private geos: Record<string, PieceGeometry>;
  private pieceMats: Record<Color2, MeshPhysicalMaterial> = { w: new MeshPhysicalMaterial(), b: new MeshPhysicalMaterial() };
  private trimMats: Record<Color2, MeshPhysicalMaterial> = { w: new MeshPhysicalMaterial(), b: new MeshPhysicalMaterial() };
  private outlineMats: Record<Color2, MeshBasicMaterial> = { w: new MeshBasicMaterial(), b: new MeshBasicMaterial() };
  /** The selected piece's outline glows in the realm's accent instead. */
  private selOutline = outlineMaterial('#ffffff', 0.035);
  private dotGeo = new CircleGeometry(0.15, 24);
  private ringGeo = new RingGeometry(0.38, 0.47, 32);
  private destMat = new MeshBasicMaterial({ transparent: true, opacity: 0.7, depthWrite: false });

  private fen = '';
  private marks: Marks = { selected: null, dests: [], lastMove: null, check: null, hint: null };
  private hops: { mesh: Object3D; from: Vector3; to: Vector3; t0: number; dur: number }[] = [];
  private orientation: Color2 = 'w';
  private view: View = 'player';
  private pose: Pose = { az: 0, ...VIEW_POSE.player };
  private tween: { from: Pose; to: Pose; t0: number } | null = null;
  private visible = true;
  private io: IntersectionObserver;
  private ro: ResizeObserver;
  private downSq: string | null | undefined;
  private ray = new Raycaster();
  private ndc = new Vector2();
  private disposed = false;

  constructor(private host: HTMLElement, private opts: SceneOptions) {
    const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    Object.assign(renderer.domElement.style, { display: 'block', width: '100%', height: '100%', touchAction: 'none' });
    host.appendChild(renderer.domElement);
    this.renderer = renderer;

    // A soft studio environment gives glossy, metal and glassy pieces something to reflect.
    const pmrem = new PMREMGenerator(renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environment = this.envMap;

    this.key.position.set(5, 12, 7);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    Object.assign(this.key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 40 });
    this.key.shadow.bias = -0.0004;
    this.key.shadow.radius = 4;
    this.rim.position.set(-6, 5, -9);
    this.scene.add(this.hemi, this.key, this.rim);

    this.geos = buildPieceGeometries();
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
        // Alternate grain direction so the squares read as inlaid tiles.
        if (light) m.rotation.y = Math.PI / 2;
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
    // Catches the board's shadow on the transparent backdrop.
    const shadow = new Mesh(new PlaneGeometry(30, 30), new ShadowMaterial({ opacity: 0.35 }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -0.38;
    shadow.receiveShadow = true;
    this.scene.add(frame, shadow);

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
    const look = lookFor(realm.id);
    this.renderer.toneMappingExposure = look.exposure;
    this.scene.environmentIntensity = look.env;
    this.hemi.color.set(look.hemi[0]);
    this.hemi.groundColor.set(look.hemi[1]);
    this.hemi.intensity = look.hemi[2];
    this.key.color.set(look.key[0]);
    this.key.intensity = look.key[1];
    this.rim.color.set(look.rim[0]);
    this.rim.intensity = look.rim[1];

    for (const c of ['w', 'b'] as Color2[]) {
      this.pieceMats[c].dispose();
      this.trimMats[c].dispose();
      this.outlineMats[c].dispose();
      this.pieceMats[c] = pieceMaterial(look[c]);
      this.trimMats[c] = pieceMaterial(look.trim[c]);
      this.outlineMats[c] = outlineMaterial(look.outline[c], c === 'w' ? 0.016 : 0.012);
    }
    this.selOutline.color.copy(css(realm.vars['--accent']).color);
    // Rebuild the pieces so they pick up the new materials.
    const fen = this.fen;
    this.fen = '';
    if (fen) this.setPosition(fen + ' w', null, true);

    const b = look.board;
    for (const [k, v] of [['light', '--light'], ['dark', '--dark']] as const) {
      const m = this.squareMats[k];
      m.color.set(realm.vars[v]);
      m.roughness = b.roughness;
      m.clearcoat = b.clearcoat ?? 0;
      m.map = b.tex ? texture(b.tex) : null;
      m.needsUpdate = true;
    }
    this.frameMat.color.set(look.frame);
    this.destMat.color.copy(css(realm.vars['--accent']).color);
    this.applyMarks();
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
    this.goTo(this.view, instant);
  }

  setView(v: View) {
    this.view = v;
    this.goTo(v);
  }

  setPosition(fen: string, lastMove: { from: string; to: string } | null, still = false) {
    const board = fen.split(' ')[0];
    if (board === this.fen) return;
    const first = !this.fen || still;
    this.fen = board;
    this.hops = [];
    this.pieceGroup.clear();
    for (const [sq, code] of parseFen(fen)) {
      const col = code[0] as Color2;
      const geo = this.geos[code[1]];
      const m = new Group();
      const body = new Mesh(geo.body, this.pieceMats[col]);
      const trim = new Mesh(geo.trim, this.trimMats[col]);
      const outline = new Mesh(geo.body, this.outlineMats[col]);
      body.castShadow = trim.castShadow = true;
      body.receiveShadow = trim.receiveShadow = true;
      outline.userData.outline = true;
      m.add(body, trim, outline);
      const p = sqPos(sq);
      m.position.set(p.x, 0, p.z);
      // Knights show their profile, facing the centre files and turned a little toward the enemy.
      if (code[1] === 'n') {
        const inward = FILES.indexOf(sq[0]) < 4 ? 0 : Math.PI;
        const lean = (code[0] === 'w' ? 0.45 : -0.45) * (inward ? -1 : 1);
        m.rotation.y = inward + lean;
      } else {
        // A fixed twist per square so grain and veins don't all line up.
        m.rotation.y = (FILES.indexOf(sq[0]) * 1.7 + +sq[1] * 0.9) % (Math.PI * 2);
      }
      m.userData.sq = sq;
      m.userData.color = code[0];
      this.pieceGroup.add(m);
    }
    if (!first && lastMove && !this.opts.reduceMotion) {
      const now = this.clock.getElapsedTime();
      const hop = (from: string, to: string) => {
        const mesh = this.pieceGroup.children.find((c) => c.userData.sq === to);
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
    this.scene.traverse((o: Object3D) => {
      const m = o as Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) mat.dispose();
    });
    for (const c of ['w', 'b'] as Color2[]) [this.pieceMats[c], this.trimMats[c], this.outlineMats[c]].forEach((m) => m.dispose());
    this.selOutline.dispose();
    Object.values(this.geos).forEach((g) => { g.body.dispose(); g.trim.dispose(); });
    this.envMap.dispose();
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
    for (const m of this.pieceGroup.children) {
      const col = m.userData.color as Color2;
      const sel = m.userData.sq === selected;
      const outline = m.children.find((c) => c.userData.outline) as Mesh | undefined;
      if (outline) outline.material = sel ? this.selOutline : this.outlineMats[col];
      if (!this.hops.some((h) => h.mesh === m)) m.position.y = sel ? 0.14 : 0;
    }
  }

  private goTo(v: View, instant = false) {
    const az = this.orientation === 'w' ? 0 : Math.PI;
    const to: Pose = { az, ...VIEW_POSE[v] };
    // Turn the short way round.
    let from = { ...this.pose };
    from.az = to.az + Math.atan2(Math.sin(from.az - to.az), Math.cos(from.az - to.az));
    if (instant || this.opts.reduceMotion) {
      this.tween = null;
      this.place(to);
    } else this.tween = { from, to, t0: this.clock.getElapsedTime() };
  }

  /** Put the camera at a pose, stepping back far enough that the whole board fits the frame. */
  private place(p: Pose) {
    this.pose = p;
    const vfov = (this.camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const fov = Math.min(vfov, hfov);
    const d = (p.dist * 5.0) / Math.tan(fov / 2);
    // The aim point slides toward the far side so low views keep the far rank in frame.
    const sAz = Math.sin(p.az), cAz = Math.cos(p.az);
    const target = new Vector3(sAz * p.aim, 0, cAz * p.aim);
    this.camera.position.set(target.x + d * Math.sin(p.polar) * sAz, d * Math.cos(p.polar), target.z + d * Math.sin(p.polar) * cAz);
    // Overhead: keep the player's side at the bottom of the screen.
    this.camera.up.set(p.polar < 0.05 ? -sAz : 0, p.polar < 0.05 ? 0 : 1, p.polar < 0.05 ? -cAz : 0);
    this.camera.lookAt(target);
  }

  private resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.place(this.pose);
  }

  private frame = () => {
    if (this.disposed) return;
    const t = this.clock.getElapsedTime();
    if (!this.visible) return;
    if (this.tween) {
      const k = Math.min(1, (t - this.tween.t0) / 0.8);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      const { from, to } = this.tween;
      const mix = (a: number, b: number) => a + (b - a) * e;
      this.place({ az: mix(from.az, to.az), polar: mix(from.polar, to.polar), dist: mix(from.dist, to.dist), aim: mix(from.aim, to.aim) });
      if (k >= 1) this.tween = null;
    }
    this.hops = this.hops.filter((h) => {
      const k = Math.min(1, (t - h.t0) / h.dur);
      const e = 1 - Math.pow(1 - k, 3);
      h.mesh.position.lerpVectors(h.from, h.to, e);
      h.mesh.position.y = Math.sin(Math.PI * k) * 0.45;
      return k < 1;
    });
    if (!this.opts.reduceMotion)
      for (const o of this.overlays.values())
        if (o.visible && o.userData.hint) (o.material as MeshBasicMaterial).opacity = 0.3 + 0.3 * (0.5 + 0.5 * Math.sin(t * 5));
    this.renderer.render(this.scene, this.camera);
  };

  private pick(e: PointerEvent): string | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const hit = this.ray.intersectObjects(this.pieceGroup.children, true)[0] ?? this.ray.intersectObjects(this.squares, false)[0];
    const obj = hit?.object;
    return ((obj?.userData.sq ?? obj?.parent?.userData.sq) as string | undefined) ?? null;
  }

  // Tap a piece then a square, or press on a piece and release over its destination.
  private onDown = (e: PointerEvent) => {
    if (e.button > 0) return;
    this.downSq = this.pick(e);
    this.opts.onPick(this.downSq);
  };

  private onUp = (e: PointerEvent) => {
    const from = this.downSq;
    this.downSq = undefined;
    if (from === undefined || e.button > 0) return;
    const sq = this.pick(e);
    if (sq && sq !== from) this.opts.onPick(sq);
  };

  private onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const sq = this.pick(e);
    this.renderer.domElement.style.cursor = sq && this.opts.pickable(sq) ? 'pointer' : 'default';
  };
}
