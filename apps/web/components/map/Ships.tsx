"use client";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { Haul, Npc, State } from "@/lib/types";
import { GOODS, NPC_COLORS } from "@/lib/types";
import { POS, headingOn, pointOn } from "./geometry";

export interface Mover { id: string; label: string; color: string; town: number; haul: Haul | null; npc?: Npc; me?: boolean; guild?: boolean }
export interface Box { x: number; y: number; w: number; h: number }

export function moversOf(s: State): Mover[] {
  const out: Mover[] = [];
  s.npcs.forEach((n, i) => n.player && out.push({ id: n.id, label: n.name, color: n.kind === "guild" ? "#E8E2C8" : NPC_COLORS[i % NPC_COLORS.length], town: n.player.town, haul: n.player.haul, npc: n, guild: n.kind === "guild" }));
  if (s.me?.player) out.push({ id: s.me.account, label: "You", color: "#FF4700", town: s.me.player.town, haul: s.me.player.haul, me: true });
  return out;
}

/** Elite-style selection brackets: 4 corner ticks around a square of half-size r. */
export const BRACKET = (r: number, l = Math.max(5, r * 0.38)) =>
  `M${-r},${-r + l} V${-r} H${-r + l} M${r - l},${-r} H${r} V${-r + l} M${r},${r - l} V${r} H${r - l} M${-r + l},${r} H${-r} V${r - l}`;
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** Convoys: oriented chevrons with engine trails, animated at display rate (rAF) from the haul's
 *  depart/arrive ticks. Docked ships hold a slow orbit around their station. Labels avoid
 *  stations, price boards and each other (greedy, 4 candidate slots); a label that can't be
 *  placed is hidden (shown on hover/pin). `freeze` holds the clock for hit-stop. */
export function Ships({ s, sp, obstacles, focus, freeze, onEnter, onLeave, onPick, posRef }: {
  s: State; sp: number; obstacles: Box[]; focus: string[];
  freeze: MutableRefObject<{ until: number; at: number }>;
  onEnter: (m: Mover, e: React.PointerEvent) => void; onLeave: (m: Mover) => void; onPick: (m: Mover, e: React.MouseEvent) => void;
  posRef?: MutableRefObject<Record<string, { x: number; y: number }>>;
}) {
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const f = freeze.current, n = Date.now();
      setClock(n < f.until ? f.at : n);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [freeze]);
  const p = s.params, tickMs = p.tick_seconds * 1000;
  const prog = (h: Haul) => {
    if (!s.genesisMs) return 0.5;
    const t0 = s.genesisMs + h.depart_tick * tickMs, t1 = s.genesisMs + h.arrive_tick * tickMs + tickMs;
    return Math.min(Math.max((clock - t0) / (t1 - t0), 0.02), 0.98);
  };
  const movers = moversOf(s);
  const docked: Record<number, Mover[]> = {};
  movers.forEach((m) => !m.haul && (docked[m.town] ??= []).push(m));
  const placed: Box[] = [...obstacles];
  // player first so "You" always gets the best label slot
  const order = [...movers].sort((a, b) => Number(!!b.me) - Number(!!a.me) || Number(!!b.haul) - Number(!!a.haul));
  const items = order.map((m) => {
    let x: number, y: number, rot: number, trail: { x: number; y: number }[] = [];
    if (m.haul) {
      const t = prog(m.haul);
      ({ x, y } = pointOn(m.haul.from, m.haul.to, m.haul.route, t));
      rot = headingOn(m.haul.from, m.haul.to, m.haul.route, t);
      for (let k = 0; k <= 8; k++) trail.push(pointOn(m.haul.from, m.haul.to, m.haul.route, Math.max(0, t - 0.16 * (k / 8))));
    } else {
      const list = docked[m.town], k = list.indexOf(m), n = list.length;
      const a = (k / n) * Math.PI * 2 + clock / 9000 + m.town * 1.3;
      const r = 56 * sp;
      x = POS[m.town].x + Math.cos(a) * r; y = POS[m.town].y + Math.sin(a) * r * 0.62;
      rot = a + Math.PI / 2;
    }
    const txt = m.haul ? `${m.label} · ${m.haul.qty} ${GOODS[m.haul.good].toUpperCase()}` : m.label;
    const fx = focus.includes(m.id);
    // label placement (world units)
    const w = (txt.length * 6.9 + 8) * sp, h = 14 * sp;
    const cands: [number, number, "middle" | "start" | "end"][] = [[0, -22, "middle"], [0, 30, "middle"], [22, 4, "start"], [-22, 4, "end"]];
    let slot: [number, number, "middle" | "start" | "end"] | null = null;
    const nearStation = POS.some((P) => Math.hypot(P.x - x, P.y - y) < 50 * sp);
    if ((m.haul && !nearStation) || m.me || fx) {
      for (const c of cands) {
        const bx = c[2] === "middle" ? x + c[0] * sp - w / 2 : c[2] === "start" ? x + c[0] * sp : x + c[0] * sp - w;
        const box = { x: bx, y: y + c[1] * sp - h + 3 * sp, w, h };
        if (!placed.some((o) => overlap(o, box))) { slot = c; placed.push(box); break; }
      }
      if (!slot && (m.me || fx)) slot = cands[0];
    }
    if (posRef) posRef.current[m.id] = { x, y };
    return { m, x, y, rot, trail, txt, slot, fx };
  });
  return (
    <g className="sm-ships">
      {items.map(({ m, trail }) =>
        trail.length > 1 ? (
          <g key={`t-${m.id}`} className="sm-trail">
            {trail.slice(1).map((q, k) => (
              <line key={k} x1={trail[k].x} y1={trail[k].y} x2={q.x} y2={q.y} stroke={m.color} strokeWidth={(m.me ? 3.2 : 2.4) * (1 - k / 8)} opacity={0.75 * (1 - k / 8)} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
            ))}
          </g>
        ) : null
      )}
      {items.map(({ m, x, y, rot, txt, slot, fx }) => (
        <g key={m.id} className={["mover", "sm-ship", m.me && "me", m.haul && "moving", fx && "focus", m.haul?.route === 1 && "lowsec"].filter(Boolean).join(" ")} data-name={m.label}
          transform={`translate(${x},${y}) scale(${sp})`} style={{ ["--c" as any]: m.color }}
          onPointerEnter={(e) => onEnter(m, e)} onPointerLeave={() => onLeave(m)} onClick={(e) => onPick(m, e)}>
          <circle r={22} className="sm-ship-hit" />
          {fx && <path d={BRACKET(m.me ? 22 : 19)} className="sm-bracket" />}
          {m.haul && <circle r={m.me ? 20 : 16} className={m.haul.route === 1 ? "sm-ship-ring danger" : "sm-ship-ring"} />}
          <g transform={`rotate(${(rot * 180) / Math.PI})`}>
            <circle cx={m.me ? -10 : -8.5} r={m.me ? 5.5 : 4} className="sm-engine" />
            <path d={m.me ? "M15,0 L-9,-10 L-4,0 L-9,10 Z" : "M12,0 L-8,-7.5 L-3.5,0 L-8,7.5 Z"} className="sm-chevron" />
          </g>
          <text className={slot ? "mover-label sm-ship-label" : "mover-label sm-ship-label hidden"} display={slot ? undefined : "none"}
            x={slot?.[0] ?? 0} y={slot?.[1] ?? -22} textAnchor={slot?.[2] ?? "middle"}>{txt}</text>
        </g>
      ))}
    </g>
  );
}
