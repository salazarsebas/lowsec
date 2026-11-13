/** Star-map world geometry. Everything (towns, lanes, convoys, blasts) lives in one fixed world
 *  space so `pointOn()` stays a pure function that callers (page.tsx → blasts) can use without
 *  knowing the screen size. The SVG viewBox is then fitted to the container (see fitView). */
export interface Pt { x: number; y: number }

/** Town anchors: 0 Mina (bottom-left), 1 Forja (top), 2 Puerto (bottom-right). */
export const POS: Pt[] = [
  { x: 150, y: 330 },
  { x: 455, y: 92 },
  { x: 760, y: 318 },
];
/** Content bounds incl. station labels and price boards. Centre = (450, 240), the legacy
 *  fallback blast point used by page.tsx. */
export const WORLD = { x: -150, y: -50, w: 1200, h: 530 };
const C: Pt = { x: (POS[0].x + POS[1].x + POS[2].x) / 3, y: (POS[0].y + POS[1].y + POS[2].y) / 3 };
export const CENTROID = C;
export const PAIRS: [number, number][] = [[0, 1], [1, 2], [0, 2]];

/** Control point of the curved Safe (highsec) lane, bowed away from the map centre. */
export function safeCtrl(a: number, b: number): Pt {
  const m = { x: (POS[a].x + POS[b].x) / 2, y: (POS[a].y + POS[b].y) / 2 };
  const d = { x: m.x - C.x, y: m.y - C.y };
  const len = Math.hypot(d.x, d.y) || 1;
  return { x: m.x + (d.x / len) * 135, y: m.y + (d.y / len) * 135 };
}
/** Position along a lane. route 0 = Safe (curve), 1 = Lowsec (straight). t in 0..1. */
export function pointOn(a: number, b: number, route: number, t: number): Pt {
  const A = POS[a], B = POS[b];
  if (route === 1) return { x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t };
  const Q = safeCtrl(a, b);
  const u = 1 - t;
  return { x: u * u * A.x + 2 * u * t * Q.x + t * t * B.x, y: u * u * A.y + 2 * u * t * Q.y + t * t * B.y };
}
/** Heading (radians) of travel at t. */
export function headingOn(a: number, b: number, route: number, t: number) {
  const p = pointOn(a, b, route, Math.max(0, t - 0.01)), q = pointOn(a, b, route, Math.min(1, t + 0.01));
  return Math.atan2(q.y - p.y, q.x - p.x);
}
export function lanePath(a: number, b: number, route: number) {
  const A = POS[a], B = POS[b];
  if (route === 1) return `M${A.x},${A.y} L${B.x},${B.y}`;
  const Q = safeCtrl(a, b);
  return `M${A.x},${A.y} Q${Q.x},${Q.y} ${B.x},${B.y}`;
}

export interface Insets { top?: number; right?: number; bottom?: number; left?: number }
export interface View { x: number; y: number; w: number; h: number; k: number; W: number; H: number }
/** Fit WORLD into a W×H px container, keeping `insets` (px) free for HUD panels. k = px per world unit. */
export function fitView(W: number, H: number, ins: Insets = {}): View {
  const l = ins.left ?? 0, r = ins.right ?? 0, t = ins.top ?? 0, b = ins.bottom ?? 0;
  const aw = Math.max(80, W - l - r), ah = Math.max(80, H - t - b);
  const k = Math.min(aw / WORLD.w, ah / WORLD.h);
  const w = W / k, h = H / k;
  const x = WORLD.x - l / k - (aw / k - WORLD.w) / 2;
  const y = WORLD.y - t / k - (ah / k - WORLD.h) / 2;
  return { x, y, w, h, k, W, H };
}
/** Sprite scale: stations/labels are drawn in px and grow only gently with the screen. */
export const spriteScale = (k: number) => Math.max(0.78, Math.min(1.3, k * 0.95));
