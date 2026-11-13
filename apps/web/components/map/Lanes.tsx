"use client";
import { memo } from "react";
import type { State } from "@/lib/types";
import { laneOf } from "@/lib/types";
import { Icon } from "@/ui";
import { CENTROID, PAIRS, POS, lanePath, pointOn, headingOn } from "./geometry";

export interface LaneKey { a: number; b: number; route: number }
export interface RaidKey { lane: number; idx: number }

/** Lanes in world space. Safe = curved highsec (cyan) with flowing dashes; Lowsec = straight
 *  hazard corridor (orange; red + pulse when raiders camp it). Stroke widths are px
 *  (non-scaling). Labels/raider markers are px sprites scaled by `sp` = spriteScale/k. */
export const Lanes = memo(function Lanes({ s, sp, hover, onLane }: {
  s: State; sp: number; hover: LaneKey | null; onLane: (l: LaneKey | null, e?: React.PointerEvent) => void;
}) {
  const speed = s.params.travel_ticks?.[0] && s.params.travel_ticks?.[1] ? Math.round((s.params.travel_ticks[0] / s.params.travel_ticks[1]) * 10) / 10 : null;
  return (
    <g className="sm-lanes">
      {PAIRS.map(([a, b]) => {
        const lane = laneOf(a, b);
        const raids = s.economy.raids.filter((r) => r.lane === lane).length;
        const hot = raids > 0;
        const hs = hover && hover.a === a && hover.b === b && hover.route === 0;
        const hl = hover && hover.a === a && hover.b === b && hover.route === 1;
        const safeD = lanePath(a, b, 0), lowD = lanePath(a, b, 1);
        const ms = pointOn(a, b, 0, 0.5), ml = pointOn(a, b, 1, 0.5);
        const ang = (Math.atan2(POS[b].y - POS[a].y, POS[b].x - POS[a].x) * 180) / Math.PI;
        const upright = ang > 90 || ang < -90 ? ang + 180 : ang;
        // put the lowsec tag on the side facing away from the map centre (raider blips sit inside)
        const ur = (upright * Math.PI) / 180, upN = { x: Math.sin(ur), y: -Math.cos(ur) };
        const inward = upN.x * (CENTROID.x - ml.x) + upN.y * (CENTROID.y - ml.y) > 0;
        const sang = (headingOn(a, b, 0, 0.5) * 180) / Math.PI;
        const supright = sang > 90 || sang < -90 ? sang + 180 : sang;
        return (
          <g key={`${a}-${b}`} data-lane={lane}>
            {/* safe (highsec) */}
            <path d={safeD} className={hs ? "sm-safe-glow on" : "sm-safe-glow"} vectorEffect="non-scaling-stroke" />
            <path d={safeD} className="sm-safe" vectorEffect="non-scaling-stroke" />
            <path d={safeD} className="sm-safe-flow lane-safe-flow" vectorEffect="non-scaling-stroke" />
            {/* lowsec hazard corridor */}
            <path d={lowD} className={hot ? "sm-low-band hot" : "sm-low-band"} vectorEffect="non-scaling-stroke" />
            <path d={lowD} className={hot ? "sm-low-glow hot" : "sm-low-glow"} vectorEffect="non-scaling-stroke" />
            <path d={lowD} className={`${hot ? "sm-low hot" : "sm-low"}${hl ? " on" : ""}`} vectorEffect="non-scaling-stroke" />
            <path d={lowD} className={hot ? "sm-low-flow hot" : "sm-low-flow"} vectorEffect="non-scaling-stroke" />
            {/* labels */}
            <g transform={`translate(${ms.x},${ms.y}) rotate(${supright}) scale(${sp})`} className="sm-lane-tag safe">
              <text y={-7}>HIGHSEC · SAFE</text>
            </g>
            <g transform={`translate(${ml.x},${ml.y}) rotate(${upright}) scale(${sp})`} className={hot ? "sm-lane-tag low hot" : "sm-lane-tag low"}>
              <text y={inward ? 17 : -9}>{hot ? `LOWSEC · ${raids} RAIDER${raids > 1 ? "S" : ""}` : `LOWSEC${speed ? ` · ${speed}× FASTER` : ""}`}</text>
            </g>
            {/* hit areas (wide, invisible) */}
            <path d={safeD} className="sm-hit" vectorEffect="non-scaling-stroke" onPointerMove={(e) => onLane({ a, b, route: 0 }, e)} onPointerLeave={() => onLane(null)} />
            <path d={lowD} className="sm-hit" vectorEffect="non-scaling-stroke" onPointerMove={(e) => onLane({ a, b, route: 1 }, e)} onPointerLeave={() => onLane(null)} />
          </g>
        );
      })}
    </g>
  );
});

/** Raider blips camping a lowsec lane (one per open raid). */
export function raiderPoints(s: State) {
  const out: { x: number; y: number; lane: number; idx: number; raider: string; expires: number; stake: number }[] = [];
  PAIRS.forEach(([a, b]) => {
    const lane = laneOf(a, b);
    const rs = s.economy.raids.filter((r) => r.lane === lane);
    rs.forEach((r, k) => {
      const t = rs.length === 1 ? 0.6 : 0.3 + (0.45 * k) / (rs.length - 1);
      const p = pointOn(a, b, 1, t);
      const ang = Math.atan2(POS[b].y - POS[a].y, POS[b].x - POS[a].x) + Math.PI / 2;
      const nx = Math.cos(ang), ny = Math.sin(ang);
      const off = nx * (CENTROID.x - p.x) + ny * (CENTROID.y - p.y) > 0 ? 20 : -20; // inside the triangle
      out.push({ x: p.x + nx * off, y: p.y + ny * off, lane, idx: k, raider: r.raider, expires: r.expires_tick, stake: Number(r.stake) });
    });
  });
  return out;
}

export function Raiders({ s, sp, onRaid }: { s: State; sp: number; onRaid: (r: RaidKey | null, e?: React.PointerEvent) => void }) {
  return (
    <g className="sm-raiders">
      {raiderPoints(s).map((r) => (
        <g key={`${r.lane}-${r.idx}-${r.raider}`} transform={`translate(${r.x},${r.y}) scale(${sp})`} className="sm-raider"
          onPointerMove={(e) => onRaid({ lane: r.lane, idx: r.idx }, e)} onPointerLeave={() => onRaid(null)}>
          <circle r={18} className="sm-raider-ping" />
          <circle r={14} className="sm-raider-ring" />
          <path d="M0,-10 L10,0 L0,10 L-10,0 Z" className="sm-raider-body" />
          <Icon name="ambush" x={-6.5} y={-6.5} size={13} strokeWidth={2} className="sm-raider-icon" />
          <circle r={20} fill="transparent" />
        </g>
      ))}
    </g>
  );
}
