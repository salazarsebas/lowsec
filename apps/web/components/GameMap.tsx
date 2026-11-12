"use client";
import { useState } from "react";
import type { Npc, State } from "@/lib/types";
import { GOODS, GOOD_ICON, TOWNS, TOWN_LABEL, laneOf } from "@/lib/types";
import { AttestationBadge } from "./Badge";

const POS = [
  { x: 150, y: 320 },
  { x: 450, y: 80 },
  { x: 750, y: 320 },
];
const C = { x: 450, y: 240 };

function safeCtrl(a: number, b: number) {
  const m = { x: (POS[a].x + POS[b].x) / 2, y: (POS[a].y + POS[b].y) / 2 };
  const d = { x: m.x - C.x, y: m.y - C.y };
  const len = Math.hypot(d.x, d.y) || 1;
  return { x: m.x + (d.x / len) * 90, y: m.y + (d.y / len) * 90 };
}
export function pointOn(a: number, b: number, route: number, t: number) {
  const A = POS[a], B = POS[b];
  if (route === 1) return { x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t };
  const Q = safeCtrl(a, b);
  const u = 1 - t;
  return { x: u * u * A.x + 2 * u * t * Q.x + t * t * B.x, y: u * u * A.y + 2 * u * t * Q.y + t * t * B.y };
}

interface Mover { id: string; label: string; color: string; town: number; haul: any; npc?: Npc }
export interface Blast { id: number; x: number; y: number; text: string; big?: boolean }

export function GameMap({ s, now, blasts = [], shake = false }: { s: State; now: number; blasts?: Blast[]; shake?: boolean }) {
  const [hover, setHover] = useState<string | null>(null);
  const p = s.params;
  const tickMs = p.tick_seconds * 1000;
  const prog = (h: any) => {
    if (!s.genesisMs) return 0.5;
    const t0 = s.genesisMs + h.depart_tick * tickMs, t1 = s.genesisMs + h.arrive_tick * tickMs + tickMs;
    return Math.min(Math.max((now - t0) / (t1 - t0), 0.02), 0.98);
  };
  const movers: Mover[] = [];
  s.npcs.forEach((n, i) => n.player && movers.push({ id: n.id, label: n.name, color: i === 0 ? "#f5a524" : "#c06cff", town: n.player.town, haul: n.player.haul, npc: n }));
  if (s.me?.player) movers.push({ id: s.me.account, label: "You", color: "#3ee6ff", town: s.me.player.town, haul: s.me.player.haul });
  const pairs: [number, number][] = [[0, 1], [1, 2], [0, 2]];
  return (
    <div className={shake ? "map-wrap shake" : "map-wrap"}>
      <svg viewBox="0 0 900 420" className="map">
        <defs>
          <radialGradient id="glow"><stop offset="0%" stopColor="#2b3b55" /><stop offset="100%" stopColor="#0b0f17" /></radialGradient>
        </defs>
        <rect width="900" height="420" fill="url(#glow)" />
        {pairs.map(([a, b]) => {
          const Q = safeCtrl(a, b);
          const lane = laneOf(a, b);
          const raids = s.economy.raids.filter((r) => r.lane === lane).length;
          const mid = pointOn(a, b, 1, 0.5);
          return (
            <g key={`${a}-${b}`}>
              <path d={`M${POS[a].x},${POS[a].y} Q${Q.x},${Q.y} ${POS[b].x},${POS[b].y}`} className="lane-safe" />
              <path d={`M${POS[a].x},${POS[a].y} Q${Q.x},${Q.y} ${POS[b].x},${POS[b].y}`} className="lane-safe-flow" />
              <line x1={POS[a].x} y1={POS[a].y} x2={POS[b].x} y2={POS[b].y} className={raids ? "lane-low hot" : "lane-low"} />
              {raids > 0 && <line x1={POS[a].x} y1={POS[a].y} x2={POS[b].x} y2={POS[b].y} className="lane-danger" />}
              <text x={mid.x} y={mid.y - 10} className="lane-label">LOWSEC {raids ? `☠×${raids}` : ""}</text>
              <text x={pointOn(a, b, 0, 0.5).x} y={pointOn(a, b, 0, 0.5).y + 18} className="lane-label safe">safe</text>
            </g>
          );
        })}
        {TOWNS.map((t, i) => {
          const town = s.economy.towns[i];
          return (
            <g key={t} transform={`translate(${POS[i].x},${POS[i].y})`}>
              <circle r={34} className="town" />
              <text y={-44} className="town-name">{TOWN_LABEL[t]}</text>
              <text y={5} className="town-icon">{GOOD_ICON[GOODS[i]]}</text>
              {town && (
                <text y={56} className="town-prices">
                  {GOODS.map((g, gi) => `${GOOD_ICON[g]}${town.ask[gi]}`).join("  ")}
                </text>
              )}
            </g>
          );
        })}
        {movers.map((m, i) => {
          const t = m.haul ? prog(m.haul) : 0;
          const pt = m.haul ? pointOn(m.haul.from, m.haul.to, m.haul.route, t) : { x: POS[m.town].x + (i - 1) * 22, y: POS[m.town].y + 28 };
          const trail = m.haul ? [0.03, 0.06, 0.09].map((d) => pointOn(m.haul.from, m.haul.to, m.haul.route, Math.max(t - d, 0))) : [];
          return (
            <g key={m.id} onMouseEnter={() => setHover(m.id)} onMouseLeave={() => setHover(null)} className="mover" data-name={m.label}>
              {trail.map((q, k) => <circle key={k} cx={q.x} cy={q.y} r={5 - k * 1.4} fill={m.color} opacity={0.45 - k * 0.12} className="trail" />)}
              <g transform={`translate(${pt.x},${pt.y})`} className="mover-body">
              {m.haul && <circle r={15} fill="none" stroke={m.color} strokeWidth={1.5} className={m.haul.route === 1 ? "pulse danger" : "pulse"} />}
              <circle r={m.label === "You" ? 9 : 8} fill={m.color} stroke="#000" strokeWidth={1.5} />
              <text y={-13} className="mover-label" fill={m.color}>{m.label}{m.haul ? ` · ${m.haul.qty}${GOOD_ICON[GOODS[m.haul.good]]}` : ""}</text>
              </g>
            </g>
          );
        })}
        <g className="burn-counter" transform="translate(18,30)">
          <text className="bc-label">CARGO BURNED</text>
          <text key={s.economy.total.cargo_burned_units} y={30} className="bc-value">🔥 {s.economy.total.cargo_burned_units}</text>
          <text y={48} className="bc-sub">{s.economy.total.ambushes} ambushes · gone forever</text>
        </g>
        {blasts.map((b) => (
          <g key={b.id} transform={`translate(${b.x},${b.y})`} className="blast">
            <circle r={10} className="blast-flash" />
            <circle r={10} className="blast-ring" />
            <circle r={10} className="blast-ring r2" />
            {Array.from({ length: 10 }).map((_, k) => {
              const a = (k / 10) * Math.PI * 2;
              return <circle key={k} r={2.5} className="debris" style={{ ["--dx" as any]: `${Math.cos(a) * 60}px`, ["--dy" as any]: `${Math.sin(a) * 60}px` }} />;
            })}
            <text y={-30} className={b.big ? "blast-text big" : "blast-text"}>{b.text}</text>
          </g>
        ))}
      </svg>
      {hover && (() => {
        const m = movers.find((x) => x.id === hover);
        const d = m?.npc?.decisions[0];
        if (!m?.npc) return null;
        return (
          <div className="tooltip">
            <div className="tt-head"><b>{m.npc.name}</b> <span className="muted">{m.npc.id}</span></div>
            <div className="muted small">{m.npc.style}</div>
            {d ? (
              <>
                <div className="tt-action">→ {d.summary}</div>
                <div className="tt-reason">“{d.reasoning}”</div>
                <div className="tt-foot"><AttestationBadge d={d} /> <span className="muted small">{d.model}</span></div>
              </>
            ) : <div className="muted">thinking…</div>}
          </div>
        );
      })()}
    </div>
  );
}
