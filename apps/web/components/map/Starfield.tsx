"use client";
import { useEffect, useRef } from "react";

/** Layered parallax starfield + nebula on a single <canvas> (cheap: one draw per frame, no DOM).
 *  3 depth layers drift slowly and shift with the pointer (parallax). Nebula clouds are
 *  pre-rendered once per resize to an offscreen canvas. Respects prefers-reduced-motion. */
interface Star { x: number; y: number; r: number; a: number; tw: number; hue: number }
const LAYERS = [
  { n: 520, rMin: 0.35, rMax: 0.8, alpha: 0.45, drift: 0.004, par: 6 },
  { n: 200, rMin: 0.6, rMax: 1.2, alpha: 0.7, drift: 0.009, par: 14 },
  { n: 46, rMin: 1.0, rMax: 1.7, alpha: 0.95, drift: 0.016, par: 26 },
];
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function Starfield({ danger = 0 }: { danger?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dangerRef = useRef(danger);
  dangerRef.current = danger;
  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext("2d")!;
    const rand = rng(7);
    const layers: Star[][] = LAYERS.map((L) =>
      Array.from({ length: L.n }, () => ({ x: rand(), y: rand(), r: L.rMin + rand() * (L.rMax - L.rMin), a: L.alpha * (0.5 + rand() * 0.5), tw: rand() * 6.28, hue: rand() }))
    );
    let W = 0, H = 0, dpr = 1, raf = 0;
    let neb: HTMLCanvasElement | null = null;
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const paintNebula = () => {
      neb = document.createElement("canvas");
      neb.width = Math.max(1, Math.round(W / 2)); neb.height = Math.max(1, Math.round(H / 2));
      const n = neb.getContext("2d")!;
      const w = neb.width, h = neb.height;
      const blob = (x: number, y: number, r: number, c: string) => {
        const g = n.createRadialGradient(x * w, y * h, 0, x * w, y * h, r * Math.max(w, h));
        g.addColorStop(0, c); g.addColorStop(1, "rgba(0,0,0,0)");
        n.fillStyle = g; n.fillRect(0, 0, w, h);
      };
      // cool blue-black safe space at the edges, ember red at the core (lowsec)
      blob(0.08, 0.15, 0.55, "rgba(28,52,78,0.32)");
      blob(0.95, 0.85, 0.5, "rgba(20,44,70,0.28)");
      blob(0.5, 0.52, 0.42, "rgba(70,20,14,0.30)");
      blob(0.62, 0.38, 0.22, "rgba(110,34,16,0.16)");
      blob(0.3, 0.75, 0.3, "rgba(46,18,30,0.22)");
      blob(0.82, 0.12, 0.25, "rgba(60,40,22,0.14)");
    };
    const resize = () => {
      const r = cv.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = r.width; H = r.height;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      paintNebula();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(cv);
    resize();
    const onMove = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      mouse.tx = (e.clientX - r.left) / Math.max(1, r.width) - 0.5;
      mouse.ty = (e.clientY - r.top) / Math.max(1, r.height) - 0.5;
    };
    window.addEventListener("pointermove", onMove);
    const t0 = performance.now();
    const frame = (now: number) => {
      const t = (now - t0) / 1000;
      mouse.x += (mouse.tx - mouse.x) * 0.04; mouse.y += (mouse.ty - mouse.y) * 0.04;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#040507"; ctx.fillRect(0, 0, W, H);
      if (neb) {
        const ox = -mouse.x * 10, oy = -mouse.y * 8;
        ctx.globalAlpha = 1;
        ctx.drawImage(neb, ox - 12, oy - 12, W + 24, H + 24);
        const d = dangerRef.current;
        if (d > 0) {
          const g = ctx.createRadialGradient(W * 0.5, H * 0.52, 0, W * 0.5, H * 0.52, Math.max(W, H) * 0.45);
          g.addColorStop(0, `rgba(120,16,8,${0.1 + 0.08 * d * (0.75 + 0.25 * Math.sin(t * 2))})`); g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        }
      }
      LAYERS.forEach((L, li) => {
        const dx = reduce ? 0 : t * L.drift, px = -mouse.x * L.par, py = -mouse.y * L.par;
        for (const s of layers[li]) {
          let x = ((s.x + dx) % 1) * W + px, y = s.y * H + py;
          x = ((x % W) + W) % W;
          const tw = li === 2 ? 0.75 + 0.25 * Math.sin(t * 1.3 + s.tw) : 1;
          ctx.globalAlpha = s.a * tw;
          ctx.fillStyle = s.hue > 0.9 ? "#ffd9b0" : s.hue > 0.8 ? "#b8d8ff" : "#f4f3e6";
          if (s.r < 0.9) ctx.fillRect(x, y, s.r * 1.6, s.r * 1.6);
          else { ctx.beginPath(); ctx.arc(x, y, s.r, 0, 6.283); ctx.fill(); }
          if (li === 2 && s.r > 1.45) {
            ctx.globalAlpha = s.a * tw * 0.35;
            ctx.fillRect(x - 5, y - 0.3, 10, 0.6); ctx.fillRect(x - 0.3, y - 5, 0.6, 10);
          }
        }
      });
      ctx.globalAlpha = 1;
      if (!reduce) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener("pointermove", onMove); };
  }, []);
  return <canvas ref={ref} className="sm-stars" aria-hidden />;
}
