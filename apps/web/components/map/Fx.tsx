"use client";
import { memo } from "react";

export interface Blast { id: number; x: number; y: number; text: string; big?: boolean }

/** Ambush impact at a world point (px sprite): flash → 3 shockwaves → debris → floating loss
 *  text. All CSS keyframes start after a 100 ms delay so they land right after the hit-stop. */
export const BlastFx = memo(function BlastFx({ b, sp }: { b: Blast; sp: number }) {
  const n = b.big ? 16 : 10, R = b.big ? 110 : 64;
  return (
    <g transform={`translate(${b.x},${b.y}) scale(${sp})`} className={b.big ? "sm-blast big" : "sm-blast"}>
      <circle r={b.big ? 34 : 20} className="sm-blast-flash" />
      <circle r={12} className="sm-blast-ring r1" />
      <circle r={12} className="sm-blast-ring r2" />
      {b.big && <circle r={12} className="sm-blast-ring r3" />}
      {Array.from({ length: n }).map((_, k) => {
        const a = (k / n) * Math.PI * 2 + (k % 3) * 0.2;
        const d = R * (0.55 + ((k * 37) % 10) / 22);
        return <rect key={k} x={-1.5} y={-1.5} width={k % 3 ? 3 : 5} height={k % 3 ? 3 : 1.6} className="sm-debris" style={{ ["--dx" as any]: `${Math.cos(a) * d}px`, ["--dy" as any]: `${Math.sin(a) * d}px`, ["--rot" as any]: `${k * 47}deg` }} />;
      })}
      <text y={b.big ? -44 : -30} className={b.big ? "sm-blast-text big" : "sm-blast-text"}>{b.text}</text>
    </g>
  );
});
