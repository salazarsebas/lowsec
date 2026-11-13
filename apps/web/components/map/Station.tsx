"use client";
import { memo } from "react";
import type { Town } from "@/lib/types";
import { GOODS, TOWNS, TOWN_LABEL } from "@/lib/types";
import { GoodIcon } from "@/ui";

export const TOWN_ACCENT: Record<string, string> = { mina: "var(--mina)", forja: "var(--forja)", puerto: "var(--puerto)" };
export const TOWN_ROLE: Record<string, string> = { mina: "MINING COLONY", forja: "FOUNDRY", puerto: "TRADE PORT" };

/** Where each town's label + price board sits, in px relative to the station (outer side, away
 *  from the lanes). `anchor` = text alignment of the block. */
export const LABEL_LAYOUT: Record<number, { x: number; y: number; anchor: "start" | "end" }> = {
  0: { x: -54, y: -2, anchor: "end" },
  1: { x: 54, y: -96, anchor: "start" },
  2: { x: 54, y: -2, anchor: "start" },
};
export const BOARD_W = 188, BOARD_H = 66, BLOCK_H = 44 + BOARD_H;

/** Box (px, relative to the station) the label block occupies; used for label collision. */
export function labelBox(i: number) {
  const L = LABEL_LAYOUT[i];
  const x = L.anchor === "end" ? L.x - BOARD_W : L.x;
  return { x, y: L.y - 24, w: BOARD_W, h: BLOCK_H };
}

function Art({ town }: { town: string }) {
  if (town === "mina")
    return (
      <g className="sm-art">
        <path d="M-14,-6 L-7,-15 L5,-14 L15,-5 L13,8 L4,15 L-9,13 L-15,4 Z" className="sm-art-hull" />
        <path d="M-6,-6 L2,-8 L7,-1 L2,6 L-6,4 Z" className="sm-art-core" />
        {[[-0.6, 1], [2.2, 1], [4.0, 1]].map(([a], k) => (
          <g key={k} transform={`rotate(${(a * 180) / Math.PI})`}>
            <line x1={15} y1={0} x2={23} y2={0} className="sm-art-line" />
            <rect x={23} y={-2} width={4} height={4} className="sm-art-tip" />
          </g>
        ))}
      </g>
    );
  if (town === "forja")
    return (
      <g className="sm-art">
        {[0, 90, 180, 270].map((r) => (
          <g key={r} transform={`rotate(${r})`}>
            <rect x={13} y={-3} width={10} height={6} className="sm-art-hull" />
            <line x1={16} y1={-3} x2={16} y2={3} className="sm-art-line" /><line x1={19} y1={-3} x2={19} y2={3} className="sm-art-line" />
          </g>
        ))}
        <rect x={-12} y={-12} width={24} height={24} transform="rotate(45)" className="sm-art-hull" />
        <circle r={6.5} className="sm-art-core furnace" />
      </g>
    );
  return (
    <g className="sm-art">
      {[45, 135, 225, 315].map((r) => (
        <g key={r} transform={`rotate(${r})`}>
          <line x1={9} y1={0} x2={24} y2={0} className="sm-art-line thick" />
          <rect x={22} y={-3.5} width={5} height={7} className="sm-art-tip" />
        </g>
      ))}
      <circle r={15} className="sm-art-ring" />
      <circle r={8} className="sm-art-hull" />
      <circle r={3.5} className="sm-art-core" />
    </g>
  );
}

/** One station sprite (drawn in px; parent applies the world→px scale). */
export const Station = memo(function Station({ i, town, towns, selected, onSelect, onHover }: {
  i: number; town?: Town; towns: Town[]; selected: boolean; onSelect?: (i: number) => void; onHover?: (i: number | null) => void;
}) {
  const id = TOWNS[i];
  const accent = TOWN_ACCENT[id];
  const L = LABEL_LAYOUT[i];
  const bx = L.anchor === "end" ? L.x - BOARD_W : L.x;
  const minAsk = GOODS.map((_, g) => Math.min(...towns.map((t) => t.ask[g])));
  const maxBid = GOODS.map((_, g) => Math.max(...towns.map((t) => t.bid[g])));
  return (
    <g className={selected ? "sm-station sel" : "sm-station"} style={{ ["--acc" as any]: accent }} data-town={id}>
      <g className="sm-station-hit" onClick={() => onSelect?.(i)} onMouseEnter={() => onHover?.(i)} onMouseLeave={() => onHover?.(null)}>
        <circle r={70} fill={`url(#sm-glow-${id})`} className="sm-station-glow" />
        <circle r={42} className="sm-orbit" />
        <circle r={30} className="sm-ring" />
        <circle r={30} className="sm-ring-tick" />
        <Art town={id} />
        <circle r={2.4} className="sm-core" />
        <circle r={44} fill="transparent" />
      </g>
      <g className="sm-label" transform={`translate(${L.x},${L.y})`} textAnchor={L.anchor}>
        <text className="sm-town-name" y={-2}>{TOWN_LABEL[id]}</text>
        <text className="sm-town-role" y={12}>
          {TOWN_ROLE[id]} <tspan className="sm-town-exp">· EXPORTS {GOODS[i].toUpperCase()}</tspan>
        </text>
      </g>
      {town && (
        <g className="sm-board" transform={`translate(${bx},${L.y + 22})`}>
          <path d={`M8,0 H${BOARD_W} V${BOARD_H - 8} L${BOARD_W - 8},${BOARD_H} H0 V8 Z`} className="sm-board-bg" />
          <line x1={0} y1={0} x2={14} y2={0} className="sm-board-tick" />
          <text x={8} y={17} className="sm-board-key">PRICE</text>
          <text x={8} y={36} className="sm-board-key">BUY</text>
          <text x={8} y={53} className="sm-board-key">SELL</text>
          {GOODS.map((g, gi) => {
            const cx = 74 + gi * 42;
            const cheap = town.ask[gi] === minAsk[gi];
            const best = town.bid[gi] === maxBid[gi];
            return (
              <g key={g}>
                <GoodIcon good={g} x={cx - 6} y={6} size={12} strokeWidth={1.75} className={gi === i ? "sm-board-icon home" : "sm-board-icon"} />
                <text x={cx} y={36} className={cheap ? "sm-board-v cheap" : "sm-board-v"}>{town.ask[gi]}</text>
                <text x={cx} y={53} className={best ? "sm-board-v best" : "sm-board-v"}>{town.bid[gi]}</text>
              </g>
            );
          })}
        </g>
      )}
    </g>
  );
});
