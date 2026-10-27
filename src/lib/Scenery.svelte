<script lang="ts">
  import type { Realm } from './realms';

  let { realm, animate = true }: { realm: Realm; animate?: boolean } = $props();

  let canvas: HTMLCanvasElement;

  type P = { x: number; y: number; vx: number; vy: number; r: number; a: number; spin: number; rot: number; c: string; phase: number };

  $effect(() => {
    const { kind, colors, count } = realm.particles;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!animate || reduce) return;
    const ctx = canvas.getContext('2d')!;
    let w = 0, h = 0, raf = 0;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    addEventListener('resize', resize);

    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    const n = Math.round(count * Math.min(1.4, (w * h) / (1400 * 900)) + count * 0.3);
    const spawn = (initial: boolean): P => {
      const p: P = { x: rand(0, w), y: initial ? rand(0, h) : -20, vx: 0, vy: 0, r: 2, a: 1, spin: 0, rot: rand(0, Math.PI * 2), c: colors[Math.floor(Math.random() * colors.length)], phase: rand(0, 6.28) };
      switch (kind) {
        case 'snow': p.r = rand(0.8, 3.2); p.vy = p.r * 0.35 + 0.2; p.vx = rand(-0.2, 0.2); p.a = rand(0.4, 0.95); break;
        case 'leaves': p.r = rand(5, 10); p.vy = rand(0.5, 1.2); p.vx = rand(0.2, 0.9); p.spin = rand(-0.04, 0.04); p.a = rand(0.6, 0.95); break;
        case 'petals': p.r = rand(3, 6); p.vy = rand(0.35, 0.8); p.vx = rand(0.3, 0.9); p.spin = rand(-0.05, 0.05); p.a = rand(0.6, 0.95); break;
        case 'embers': p.r = rand(0.8, 2.6); p.vy = -rand(0.4, 1.6); p.vx = rand(-0.3, 0.3); p.a = rand(0.5, 1); if (!initial) p.y = h + 10; break;
        case 'bubbles': p.r = rand(1.5, 6); p.vy = -rand(0.2, 0.7); p.a = rand(0.25, 0.6); if (!initial) p.y = h + 10; break;
        case 'wisps': p.r = rand(2, 5); p.vy = -rand(0.05, 0.3); p.vx = rand(-0.25, 0.25); p.a = rand(0.3, 0.8); if (!initial) p.y = h + 10; break;
        case 'glints': p.r = rand(0.6, 2.2); p.y = rand(h * 0.35, h); p.a = 0; p.vx = rand(0.02, 0.1); break;
      }
      return p;
    };
    const ps = Array.from({ length: n }, () => spawn(true));

    let t = 0;
    const frame = () => {
      t += 1;
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        const sway = Math.sin(t * 0.01 + p.phase);
        p.x += p.vx + (kind === 'snow' || kind === 'petals' || kind === 'leaves' ? sway * 0.4 : kind === 'bubbles' ? sway * 0.25 : 0);
        p.y += p.vy;
        p.rot += p.spin;
        ctx.globalAlpha = p.a;
        ctx.fillStyle = p.c;
        switch (kind) {
          case 'snow':
          case 'embers':
            if (kind === 'embers') { p.a *= 0.997; ctx.shadowBlur = 8; ctx.shadowColor = p.c; }
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;
            break;
          case 'leaves':
            ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.abs(Math.cos(t * 0.03 + p.phase)) * 0.7 + 0.3);
            ctx.beginPath(); ctx.moveTo(0, -p.r);
            ctx.quadraticCurveTo(p.r * 0.9, -p.r * 0.2, 0, p.r); ctx.quadraticCurveTo(-p.r * 0.9, -p.r * 0.2, 0, -p.r);
            ctx.fill(); ctx.restore();
            break;
          case 'petals':
            ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.abs(Math.sin(t * 0.04 + p.phase)) * 0.6 + 0.4);
            ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 0.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
            break;
          case 'bubbles':
            ctx.strokeStyle = p.c; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.stroke();
            ctx.globalAlpha = p.a * 0.6; ctx.beginPath(); ctx.arc(p.x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.25, 0, Math.PI * 2); ctx.fill();
            break;
          case 'wisps': {
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 5);
            g.addColorStop(0, p.c); g.addColorStop(1, 'transparent');
            ctx.globalAlpha = p.a * (0.6 + 0.4 * Math.sin(t * 0.02 + p.phase));
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 5, 0, Math.PI * 2); ctx.fill();
            break;
          }
          case 'glints': {
            const life = Math.sin(t * 0.012 + p.phase);
            ctx.globalAlpha = Math.max(0, life) ** 6;
            const s = p.r * 3;
            ctx.beginPath(); ctx.moveTo(p.x - s, p.y); ctx.lineTo(p.x + s, p.y); ctx.moveTo(p.x, p.y - s); ctx.lineTo(p.x, p.y + s);
            ctx.strokeStyle = p.c; ctx.lineWidth = 1; ctx.stroke();
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.6, 0, Math.PI * 2); ctx.fill();
            if (life < -0.99) { p.x = rand(0, w); p.y = rand(h * 0.35, h); }
            break;
          }
        }
        if (p.y > h + 30 || p.y < -40 || p.x > w + 40 || p.x < -40 || (kind === 'embers' && p.a < 0.05)) ps[i] = spawn(false);
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const vis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(frame);
    };
    document.addEventListener('visibilitychange', vis);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', vis);
      ctx.clearRect(0, 0, w, h);
    };
  });
</script>

<div class="scenery" aria-hidden="true">
  <div class="sky"></div>
  <div class="sun"></div>
  <svg class="ridge far" viewBox="0 0 1600 400" preserveAspectRatio="none">
    <path d="M0 400V260l90-60 70 40 120-140 80 70 60-30 140 150 110-120 90 50 150-170 120 130 90-40 130 110 100-90 80 60 170-60V400Z" />
  </svg>
  <svg class="ridge mid" viewBox="0 0 1600 400" preserveAspectRatio="none">
    <path d="M0 400V300l140-110 90 60 110-160 70 40 50-30 150 190 160-120 110 80 130-60 180 140 120-100 120 60 170-40V400Z" />
    <path class="cap" d="M340 190l-40 60 30-10 20 20 25-35zM825 140l-35 45 25-5 20 15 15-30z" />
  </svg>
  <svg class="ridge near" viewBox="0 0 1600 400" preserveAspectRatio="none">
    <path d="M0 400V340l200-60 160 40 200-80 140 60 220-40 180 70 200-50 160 30 140-20V400Z" />
  </svg>
  <div class="mist"></div>
  <div class="glyph">{realm.hanzi}</div>
  <canvas bind:this={canvas}></canvas>
</div>

<style>
  .scenery {
    position: fixed;
    inset: 0;
    z-index: -1;
    overflow: hidden;
    pointer-events: none;
  }
  .sky {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, var(--bg1) 0%, var(--bg2) 55%, var(--bg3) 100%);
    transition: background 1s;
  }
  .sun {
    position: absolute;
    width: 50vmax;
    aspect-ratio: 1;
    top: -12vmax;
    right: -8vmax;
    border-radius: 50%;
    background: radial-gradient(circle, var(--glow) 0%, transparent 65%);
    filter: blur(10px);
  }
  .ridge {
    position: absolute;
    left: 0;
    width: 100%;
    bottom: 0;
    transition: fill 1s;
  }
  .ridge.far { height: 52vh; fill: color-mix(in srgb, var(--mountain) 35%, var(--bg2)); opacity: 0.55; }
  .ridge.mid { height: 42vh; fill: color-mix(in srgb, var(--mountain) 60%, var(--bg1)); opacity: 0.7; }
  .ridge.mid .cap { fill: var(--ink); opacity: 0.35; }
  .ridge.near { height: 24vh; fill: color-mix(in srgb, var(--bg1) 85%, var(--mountain)); opacity: 0.9; }
  .mist {
    position: absolute;
    left: -10%;
    right: -10%;
    bottom: 10vh;
    height: 30vh;
    background: radial-gradient(ellipse at center, color-mix(in srgb, var(--ink) 14%, transparent) 0%, transparent 70%);
    animation: drift 40s ease-in-out infinite alternate;
  }
  .glyph {
    position: absolute;
    left: 2vw;
    top: 50%;
    transform: translateY(-50%);
    writing-mode: vertical-rl;
    font-family: 'Ma Shan Zheng', serif;
    font-size: min(26vh, 22vw);
    line-height: 1;
    color: var(--ink);
    opacity: 0.07;
    white-space: nowrap;
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  @keyframes drift {
    from { transform: translateX(-4%); }
    to { transform: translateX(4%); }
  }
  @media (prefers-reduced-motion: reduce) {
    .mist { animation: none; }
  }
</style>
