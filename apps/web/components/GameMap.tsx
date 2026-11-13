"use client";
/** Lowsec star map (WP1). Full-bleed, container-responsive scene: canvas starfield + nebula,
 *  perspective grid floor with drop-lines, stations with price boards, security-coloured lanes,
 *  raider blips, convoys with trails, lane risk tooltips, click-to-pin pilots and the ambush
 *  cinematic (hit-stop → flash → shockwave → shake → floating loss). Pure presentation: reads
 *  State only, no API or data-shape changes.
 *
 *  Props (all new ones optional, so existing callers keep working):
 *   - s, now, blasts, shake            (unchanged)
 *   - fullBleed?: boolean              fill the parent (position:absolute; inset:0). Parent must be
 *                                      positioned and sized, e.g. a fixed full-viewport layer.
 *   - insets?: {top,right,bottom,left} px kept clear for HUD panels when fitting the map.
 *   - burnCounter?: "top-left" | "bottom-left" | "bottom-right" | "none"  (default "top-left")
 *   - legend?: boolean                 small lane legend bottom-right (default true)
 *   - onSelectTown?(i|null), onSelectPilot?(id|null)   selection callbacks for the HUD.
 *  Exports kept: GameMap, pointOn, Blast (world space is fixed, so page.tsx blasts still land). */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { State } from "@/lib/types";
import { GOODS, LANES, TOWNS, laneOf } from "@/lib/types";
import { CountUp, GoodIcon, Icon, KV, Pill } from "@/ui";
import { NpcCard } from "./NpcCard";
import { CENTROID, PAIRS, POS, fitView, headingOn, pointOn as pOn, spriteScale, type Insets } from "./map/geometry";
import { Starfield } from "./map/Starfield";
import { Lanes, Raiders, raiderPoints, type LaneKey, type RaidKey } from "./map/Lanes";
import { Station, TOWN_ACCENT, labelBox } from "./map/Station";
import { BRACKET, Ships, moversOf, type Box, type Mover } from "./map/Ships";
import { BlastFx, type Blast } from "./map/Fx";
import { fmtS, laneStat, townName } from "./map/econ";
import "./map/map.css";

export { pointOn } from "./map/geometry";
export type { Blast } from "./map/Fx";

const HORIZON = 150;
/** Decorative distant systems around the playable region (deterministic). */
const FAR = (() => {
  let seed = 42;
  const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pts: { x: number; y: number; r: number; warm: boolean }[] = [];
  while (pts.length < 34) {
    const x = -700 + r() * 2300, y = -320 + r() * 1100;
    if (POS.some((P) => Math.hypot(P.x - x, P.y - y) < 230) || (x > 60 && x < 860 && y > 20 && y < 440)) continue;
    pts.push({ x, y, r: 1.2 + r() * 1.6, warm: r() > 0.7 });
  }
  const links: [number, number][] = [];
  pts.forEach((p, i) => {
    const near = pts.map((q, j) => [Math.hypot(p.x - q.x, p.y - q.y), j] as const).filter(([, j]) => j !== i).sort((a, b) => a[0] - b[0]).slice(0, 2);
    near.forEach(([d, j]) => d < 330 && i < j && links.push([i, j]));
  });
  return { pts, links };
})();
const DROP = [64, 112, 70];

export interface GameMapProps {
  s: State; now: number; blasts?: Blast[]; shake?: boolean;
  fullBleed?: boolean; insets?: Insets; burnCounter?: "top-left" | "bottom-left" | "bottom-right" | "none"; legend?: boolean;
  /** "Replay last ambush" on the burn counter: label of the source ambush (null hides the button). */
  replay?: { label: string; onReplay: () => void } | null;
  onSelectTown?: (i: number | null) => void; onSelectPilot?: (id: string | null) => void; className?: string;
}

export function GameMap({ s, now, blasts = [], shake = false, fullBleed = false, insets, burnCounter = "top-left", legend = true, replay = null, onSelectTown, onSelectPilot, className }: GameMapProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ W: 1040, H: 560 });
  useEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(([e]) => setSize({ W: Math.max(320, e.contentRect.width), H: Math.max(240, e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const v = useMemo(() => fitView(size.W, size.H, insets), [size.W, size.H, insets?.top, insets?.right, insets?.bottom, insets?.left]);
  const S = spriteScale(v.k), sp = S / v.k;
  const toScreen = (x: number, y: number) => ({ x: (x - v.x) * v.k, y: (y - v.y) * v.k });

  // ---- selection / hover state
  const [hoverLane, setHoverLane] = useState<(LaneKey & { px: number; py: number }) | null>(null);
  const [hoverRaid, setHoverRaid] = useState<(RaidKey & { px: number; py: number }) | null>(null);
  const [hoverTown, setHoverTown] = useState<number | null>(null);
  const [selTown, setSelTown] = useState<number | null>(null);
  const [hoverShip, setHoverShip] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const leaveT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shipPos = useRef<Record<string, { x: number; y: number }>>({});
  const local = (e: { clientX: number; clientY: number }) => {
    const r = wrap.current!.getBoundingClientRect();
    return { px: e.clientX - r.left, py: e.clientY - r.top };
  };
  const onLane = useCallback((l: LaneKey | null, e?: React.PointerEvent) => setHoverLane(l && e ? { ...l, ...local(e) } : null), []);
  const onRaid = useCallback((r: RaidKey | null, e?: React.PointerEvent) => setHoverRaid(r && e ? { ...r, ...local(e) } : null), []);
  const enterShip = useCallback((m: Mover) => { if (leaveT.current) clearTimeout(leaveT.current); setHoverShip(m.id); }, []);
  const leaveShip = useCallback(() => { if (leaveT.current) clearTimeout(leaveT.current); leaveT.current = setTimeout(() => setHoverShip(null), 650); }, []);
  const pickShip = useCallback((m: Mover, e: React.MouseEvent) => {
    e.stopPropagation();
    setPinned((p) => { const n = p === m.id ? null : m.id; onSelectPilot?.(n); return n; });
  }, [onSelectPilot]);
  const pickTown = useCallback((i: number) => setSelTown((p) => { const n = p === i ? null : i; onSelectTown?.(n); return n; }), [onSelectTown]);
  const clearSel = () => { if (pinned) { setPinned(null); onSelectPilot?.(null); } if (selTown != null) { setSelTown(null); onSelectTown?.(null); } };

  // ---- ambush cinematic: hit-stop + desaturate, then red alarm + kick on our own (big) blasts
  const freeze = useRef({ until: 0, at: 0 });
  const seen = useRef<Set<number>>(new Set());
  const [hitstop, setHitstop] = useState(false);
  const [alarm, setAlarm] = useState(0);
  const [kick, setKick] = useState(false);
  useEffect(() => {
    const fresh = blasts.filter((b) => !seen.current.has(b.id));
    if (!fresh.length) return;
    fresh.forEach((b) => seen.current.add(b.id));
    const t = Date.now();
    freeze.current = { until: t + 100, at: t };
    setHitstop(true);
    const a = setTimeout(() => setHitstop(false), 130);
    if (fresh.some((x) => x.big)) {
      setAlarm((n) => n + 1); setKick(true);
      setTimeout(() => setKick(false), 560);
      setTimeout(() => setAlarm(0), 1700);
    }
    return () => clearTimeout(a);
  }, [blasts]);

  // ---- burn counter delta floats
  const burned = s.economy.total.cargo_burned_units ?? 0;
  const lastBurn = useRef(burned);
  const [burnFloats, setBurnFloats] = useState<{ id: number; n: number }[]>([]);
  useEffect(() => {
    const d = burned - lastBurn.current;
    lastBurn.current = burned;
    if (d <= 0) return;
    const id = Date.now() + Math.random();
    setBurnFloats((f) => [...f, { id, n: d }]);
    setTimeout(() => setBurnFloats((f) => f.filter((x) => x.id !== id)), 1700);
  }, [burned]);

  // ---- label obstacles for ship labels (world units)
  const obstacles: Box[] = useMemo(() => {
    const out: Box[] = [];
    POS.forEach((P, i) => {
      const L = labelBox(i);
      out.push({ x: P.x + L.x * sp, y: P.y + L.y * sp, w: L.w * sp, h: L.h * sp });
      out.push({ x: P.x - 46 * sp, y: P.y - 46 * sp, w: 92 * sp, h: 92 * sp });
    });
    // lane tags (rotated text → axis-aligned box)
    PAIRS.forEach(([a, b]) => [0, 1].forEach((route) => {
      const m = pOn(a, b, route, 0.5), th = headingOn(a, b, route, 0.5);
      const L = 150 * sp, H = 16 * sp, c = Math.abs(Math.cos(th)), sn = Math.abs(Math.sin(th));
      const w = L * c + H * sn, h = L * sn + H * c;
      out.push({ x: m.x - w / 2, y: m.y - h / 2, w, h });
    }));
    return out;
  }, [sp]);

  const raidsTotal = s.economy.raids.length;
  const focus = [pinned, hoverShip].filter(Boolean) as string[];
  const movers = moversOf(s);
  const tipShip = movers.find((m) => m.id === (hoverShip ?? pinned)) ?? null;

  // ---- grid floor (world space, spans the whole view)
  const grid = useMemo(() => {
    const bottom = v.y + v.h + 40, vx = CENTROID.x, vy = HORIZON - 900;
    const lines: string[] = [];
    for (let i = -30; i <= 30; i++) {
      const xb = vx + i * 70;
      // ray from vanishing point through (xb, bottom), clipped at the horizon
      const tH = (HORIZON - vy) / (bottom - vy);
      lines.push(`M${vx + (xb - vx) * tH},${HORIZON} L${xb},${bottom}`);
    }
    for (let j = 1; j <= 14; j++) {
      const y = HORIZON + (bottom - HORIZON) * Math.pow(j / 14, 1.8);
      lines.push(`M${v.x - 50},${y} L${v.x + v.w + 50},${y}`);
    }
    return { d: lines.join(" "), bottom };
  }, [v.x, v.y, v.w, v.h]);

  const cls = ["map-wrap", "sm-wrap", fullBleed && "full", (shake || kick) && "shake", hitstop && "hitstop", alarm && "alarm", className].filter(Boolean).join(" ");
  const laneTip = hoverLane && laneStat(s, hoverLane.a, hoverLane.b, hoverLane.route);
  const raidTip = hoverRaid && raiderPoints(s).find((r) => r.lane === hoverRaid.lane && r.idx === hoverRaid.idx);
  const tipPos = (px: number, py: number, w = 260, h = 170) => ({ left: Math.min(Math.max(8, px + 18), size.W - w - 8), top: Math.min(Math.max(8, py + 18), size.H - h - 8) });

  return (
    <div ref={wrap} className={cls}>
      <Starfield danger={raidsTotal ? 1 : 0.35} />
      <svg viewBox={`${v.x} ${v.y} ${v.w} ${v.h}`} className="map sm-svg" onClick={clearSel} role="img" aria-label="Lowsec star map: three stations joined by Safe and Lowsec lanes">
        <defs>
          {TOWNS.map((t) => (
            <radialGradient key={t} id={`sm-glow-${t}`}>
              <stop offset="0%" stopColor={TOWN_ACCENT[t]} stopOpacity={0.42} />
              <stop offset="35%" stopColor={TOWN_ACCENT[t]} stopOpacity={0.12} />
              <stop offset="100%" stopColor={TOWN_ACCENT[t]} stopOpacity={0} />
            </radialGradient>
          ))}
          <radialGradient id="sm-haze"><stop offset="0%" stopColor="#F00000" stopOpacity={0.5} /><stop offset="60%" stopColor="#B01000" stopOpacity={0.12} /><stop offset="100%" stopColor="#F00000" stopOpacity={0} /></radialGradient>
          <radialGradient id="sm-haze-o"><stop offset="0%" stopColor="#F06000" stopOpacity={0.1} /><stop offset="100%" stopColor="#F06000" stopOpacity={0} /></radialGradient>
          <linearGradient id="sm-floor-fade" x1="0" y1={HORIZON} x2="0" y2={grid.bottom} gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#fff" stopOpacity={0} /><stop offset="35%" stopColor="#fff" stopOpacity={0.55} /><stop offset="100%" stopColor="#fff" stopOpacity={1} />
          </linearGradient>
          <mask id="sm-floor-mask"><rect x={v.x - 60} y={HORIZON} width={v.w + 120} height={grid.bottom - HORIZON} fill="url(#sm-floor-fade)" /></mask>
        </defs>
        <g className="sm-scene">
          {/* perspective floor */}
          <path d={grid.d} className="sm-grid" mask="url(#sm-floor-mask)" vectorEffect="non-scaling-stroke" />
          {/* distant, unreachable systems (decor only: no data) */}
          <g className="sm-far" aria-hidden>
            {FAR.links.map(([i, j], k) => <line key={k} x1={FAR.pts[i].x} y1={FAR.pts[i].y} x2={FAR.pts[j].x} y2={FAR.pts[j].y} vectorEffect="non-scaling-stroke" />)}
            {FAR.pts.map((q, k) => <circle key={k} cx={q.x} cy={q.y} r={q.r * sp} className={q.warm ? "warm" : undefined} />)}
          </g>
          {/* danger haze over lowsec corridors */}
          {[[0, 1], [1, 2], [0, 2]].map(([a, b]) => {
            const hot = s.economy.raids.some((r) => r.lane === laneOf(a, b));
            const m = { x: (POS[a].x + POS[b].x) / 2, y: (POS[a].y + POS[b].y) / 2 };
            const len = Math.hypot(POS[b].x - POS[a].x, POS[b].y - POS[a].y);
            const ang = (Math.atan2(POS[b].y - POS[a].y, POS[b].x - POS[a].x) * 180) / Math.PI;
            return <ellipse key={`${a}${b}`} cx={0} cy={0} rx={len * 0.42} ry={hot ? 70 : 34} transform={`translate(${m.x},${m.y}) rotate(${ang})`} fill={hot ? "url(#sm-haze)" : "url(#sm-haze-o)"} className={hot ? "sm-haze hot" : "sm-haze"} />;
          })}
          {/* drop-lines to the floor */}
          {POS.map((P, i) => (
            <g key={i} className="sm-drop" style={{ ["--acc" as any]: TOWN_ACCENT[TOWNS[i]] }}>
              <line x1={P.x} y1={P.y + 32 * sp} x2={P.x} y2={P.y + DROP[i]} vectorEffect="non-scaling-stroke" />
              <ellipse cx={P.x} cy={P.y + DROP[i]} rx={26 * sp} ry={7 * sp} vectorEffect="non-scaling-stroke" />
              <ellipse cx={P.x} cy={P.y + DROP[i]} rx={3 * sp} ry={1 * sp} className="dot" />
            </g>
          ))}
          <Lanes s={s} sp={sp} hover={hoverLane} onLane={onLane} />
          {TOWNS.map((t, i) => (
            <g key={t} transform={`translate(${POS[i].x},${POS[i].y}) scale(${sp})`}>
              <Station i={i} town={s.economy.towns[i]} towns={s.economy.towns} selected={selTown === i || hoverTown === i}
                onSelect={(k) => { pickTown(k); }} onHover={setHoverTown} />
              {(selTown === i || hoverTown === i) && <path d={BRACKET(50)} className="sm-bracket town" />}
            </g>
          ))}
          <Raiders s={s} sp={sp} onRaid={onRaid} />
          <Ships s={s} sp={sp} obstacles={obstacles} focus={focus} freeze={freeze} onEnter={enterShip} onLeave={leaveShip} onPick={pickShip} posRef={shipPos} />
          {blasts.map((b) => <BlastFx key={b.id} b={b} sp={sp * 1.1} />)}
        </g>
      </svg>

      <div className="sm-vignette" aria-hidden key={alarm || "calm"} />
      <div className="sm-flash" aria-hidden key={`f${alarm}`} />

      {burnCounter !== "none" && (
        <div className={`burn-counter sm-burn ${burnCounter}`}>
          <div className="bc-label">CARGO BURNED</div>
          <div className="sm-burn-row">
            <Icon name="burn" size={22} strokeWidth={1.75} className="bc-icon" />
            <CountUp value={burned} duration={700} className="bc-value" />
            {burnFloats.map((f) => <span key={f.id} className="sm-burn-float">+{f.n}</span>)}
          </div>
          <div className="bc-sub">{s.economy.total.ambushes ?? 0} ambushes · gone forever</div>
          {replay && (
            <button className="bc-replay" onClick={replay.onReplay} title={`Replays the visual of a real ambush from the activity feed (${replay.label}). No new roll, no transaction.`}>
              ▶ Replay last ambush <span>{replay.label}</span>
            </button>
          )}
        </div>
      )}

      {legend && (
        <div className="sm-legend" aria-hidden>
          <span><i className="safe" />HIGHSEC · 0% RISK</span>
          <span><i className="low" />LOWSEC · {s.params.ambush_base_bps / 100}%+ RISK</span>
          <span><i className="raid" />RAIDER</span>
        </div>
      )}

      {laneTip && hoverLane && !tipShip && (
        <div className="ui-tooltip sm-tip" style={tipPos(hoverLane.px, hoverLane.py)}>
          <div className="tt-title">{townName(hoverLane.a)} ⇄ {townName(hoverLane.b)} // {hoverLane.route ? "LOWSEC" : "SAFE"}</div>
          <KV items={[
            ["AMBUSH RISK", <b key="r" className={laneTip.riskPct > 0 ? "sm-risk bad" : "sm-risk ok"}>{laneTip.riskPct}%</b>],
            ...(laneTip.etaS != null ? [["ETA", fmtS(laneTip.etaS)] as [string, string]] : []),
            ...(laneTip.toll != null ? [["TOLL", `${laneTip.toll} ◎`] as [string, string]] : []),
            ...(hoverLane.route === 1 ? [["RAIDERS", String(laneTip.raids)] as [string, string]] : []),
            ...(laneTip.best ? [["EXP. PROFIT", <b key="p" className={laneTip.best.profit >= 0 ? "sm-profit" : "sm-loss"}>{laneTip.best.profit >= 0 ? "+" : ""}{laneTip.best.profit} ◎</b>] as [string, React.ReactNode]] : []),
          ]} />
          {laneTip.best && (
            <div className="sm-tip-foot">
              <GoodIcon good={GOODS[laneTip.best.good]} size={11} /> {laneTip.best.qty} {GOODS[laneTip.best.good].toUpperCase()} {townName(laneTip.best.from)} ▸ {townName(laneTip.best.to)}
              <span>{hoverLane.route ? `risk-adjusted · ` : ""}excl. dock fee</span>
            </div>
          )}
        </div>
      )}

      {raidTip && hoverRaid && (
        <div className="ui-tooltip sm-tip" style={tipPos(hoverRaid.px, hoverRaid.py, 240, 120)}>
          <div className="tt-title sm-red">RAIDER // CAMPING {(LANES[raidTip.lane] ?? "").toUpperCase()}</div>
          <KV items={[
            ["PILOT", raidTip.raider.split(".")[0]],
            ["STAKE", `${raidTip.stake} ◎`],
            ["EXPIRES", raidTip.expires > s.economy.tick ? fmtS((raidTip.expires - s.economy.tick) * s.params.tick_seconds) : "now"],
          ]} />
        </div>
      )}

      {tipShip && (() => {
        const p = shipPos.current[tipShip.id];
        const sc = p ? toScreen(p.x, p.y) : { x: size.W - 360, y: 20 };
        // place the card where it covers the fewest station price boards (and stays clear of the dock / rail)
        const W = 340, H = 330;
        const ins = { right: insets?.right ?? 0, bottom: insets?.bottom ?? 0, top: insets?.top ?? 8 };
        const maxL = Math.max(8, size.W - ins.right - W - 8), maxT = Math.max(ins.top, size.H - ins.bottom - H - 8);
        const boards = POS.flatMap((P, i) => {
          const L = labelBox(i), a = toScreen(P.x + L.x * sp, P.y + L.y * sp), b = toScreen(P.x - 46 * sp, P.y - 46 * sp);
          return [{ x: a.x, y: a.y, w: L.w * sp * v.k, h: L.h * sp * v.k }, { x: b.x, y: b.y, w: 92 * sp * v.k, h: 92 * sp * v.k }];
        });
        const overlap = (l: number, t: number) => boards.reduce((acc, r) => acc + Math.max(0, Math.min(l + W, r.x + r.w) - Math.max(l, r.x)) * Math.max(0, Math.min(t + H, r.y + r.h) - Math.max(t, r.y)), 0);
        const clampP = (l: number, t: number) => ({ l: Math.min(Math.max(8, l), maxL), t: Math.min(Math.max(ins.top, t), maxT) });
        const cands = [
          clampP(sc.x + 36, sc.y - 90), clampP(sc.x - 36 - W, sc.y - 90),
          clampP(sc.x - W / 2, sc.y - H - 30), clampP(sc.x - W / 2, sc.y + 30),
          clampP(sc.x + 36, sc.y - H + 40), clampP(sc.x - 36 - W, sc.y - H + 40),
        ];
        const bestC = cands.reduce((a, c) => (overlap(c.l, c.t) < overlap(a.l, a.t) - 1 ? c : a), cands[sc.x > size.W / 2 ? 1 : 0]);
        const left = bestC.l, top = bestC.t;
        const pl = tipShip.npc?.player ?? s.me?.player ?? null;
        const h = tipShip.haul;
        return (
          <div className={pinned === tipShip.id ? "tooltip sm-pilot pinned" : "tooltip sm-pilot"} style={{ left: Math.max(8, left), top, right: "auto", ["--c" as any]: tipShip.color }}
            onMouseEnter={() => leaveT.current && clearTimeout(leaveT.current)} onMouseLeave={leaveShip}>
            <div className="tt-head sm-pilot-head">
              <span className="sm-pilot-dot" />
              <b>{tipShip.npc?.name ?? "You"}</b>
              <span className="muted">{tipShip.npc ? tipShip.npc.id : tipShip.id}</span>
              {pinned === tipShip.id ? (
                <button className="sm-pin-x" onClick={() => { setPinned(null); onSelectPilot?.(null); }} aria-label="Unpin"><Icon name="close" size={12} /></button>
              ) : <span className="sm-pin-hint">CLICK TO PIN</span>}
            </div>
            <div className="sm-pilot-status">
              {h ? (
                <Pill tone={h.route === 1 ? "low" : "high"} icon={h.route === 1 ? "lowsec" : "safe"}>IN TRANSIT · {townName(h.from)} ▸ {townName(h.to)} · {h.qty} {GOODS[h.good].toUpperCase()}</Pill>
              ) : <Pill icon="cargo">DOCKED · {townName(tipShip.town)}</Pill>}
            </div>
            {pl && <KV items={[["HAULS", pl.hauls], ["AMBUSHED", pl.ambushed], ["RAIDS WON", pl.raids_won]]} />}
            {tipShip.npc && <div className="sm-pilot-body"><NpcCard n={tipShip.npc} explorer={s.explorer} /></div>}
          </div>
        );
      })()}
    </div>
  );
}
