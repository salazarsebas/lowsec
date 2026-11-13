/** Dependency-free SVG chart: several series, optional dual axis, target band, draw-in animation. */
export interface Series {
  name: string;
  color: string;
  values: number[];
  /** Explicit x coordinates (e.g. epoch numbers). Default: 0..n-1. */
  xs?: number[];
  dashed?: boolean;
  /** Plot against the right axis (e.g. gold supply next to inflation %). */
  axis?: "left" | "right";
  /** Fill the area under the line with a faint tint of `color`. */
  fill?: boolean;
}

export function LineChart({
  series, height = 200, yFmt = (v: number) => v.toFixed(1), yFmtRight,
  band, clip, animate = false, empty = "no data yet",
}: {
  series: Series[];
  height?: number;
  yFmt?: (v: number) => string;
  yFmtRight?: (v: number) => string;
  band?: [number, number];
  clip?: [number, number];
  animate?: boolean;
  empty?: string;
}) {
  const W = 640, H = height, padL = 46, padR = series.some((s) => s.axis === "right") ? 56 : 12, padT = 8, padB = 36;
  const left = series.filter((s) => s.axis !== "right");
  const right = series.filter((s) => s.axis === "right");
  const allXs = series.flatMap((s) => s.xs ?? s.values.map((_, i) => i));
  const rawLeft = left.flatMap((s) => s.values).concat(band ?? []);
  if (!allXs.length || !series.some((s) => s.values.length)) {
    return <div className="econ-empty muted">{empty}</div>;
  }

  const clipV = (v: number) => (clip ? Math.min(Math.max(v, clip[0]), clip[1]) : v);
  const domain = (vals: number[], applyClip: boolean, fallback: [number, number] = [0, 1]): [number, number] => {
    if (!vals.length) return fallback;
    const used = applyClip && clip ? vals.map(clipV) : vals;
    let lo = Math.min(...used), hi = Math.max(...used);
    if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
    const pad = (hi - lo) * 0.08;
    return [lo - pad, hi + pad];
  };
  // Clip is only for the left (inflation) axis. Applying it to gold supply
  // pinned the right axis to the clip ceiling (e.g. 25) and hid the line.
  const [lLo, lHi] = domain(rawLeft, true);
  const [rLo, rHi] = domain(right.flatMap((s) => s.values), false, [0, 1]);
  const xMin = Math.min(...allXs), xMax = Math.max(...allXs);
  const x = (v: number) => padL + ((v - xMin) * (W - padL - padR)) / Math.max(xMax - xMin, 1e-9);
  const yL = (v: number) => padT + ((lHi - v) * (H - padT - padB)) / (lHi - lLo);
  const yR = (v: number) => padT + ((rHi - v) * (H - padT - padB)) / (rHi - rLo);
  const ticks = (lo: number, hi: number) => [lo, lo + (hi - lo) / 2, hi];
  const xTicks = (() => {
    const span = xMax - xMin;
    if (span <= 1) return [xMin, xMax];
    const mid = xMin + span / 2;
    return [xMin, mid, xMax];
  })();

  const points = (s: Series, y: (v: number) => number) => {
    const xs = s.xs ?? s.values.map((_, i) => i);
    return s.values.map((v, i) => `${x(xs[i]!)},${y(s.axis === "right" ? v : clipV(v))}`).join(" ");
  };
  const area = (s: Series, y: (v: number) => number, baseline: number) => {
    const xs = s.xs ?? s.values.map((_, i) => i);
    if (!xs.length) return "";
    const line = s.values.map((v, i) => `${x(xs[i]!)},${y(s.axis === "right" ? v : clipV(v))}`).join(" ");
    return `${x(xs[0]!)},${y(baseline)} ${line} ${x(xs[xs.length - 1]!)},${y(baseline)}`;
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart econ-chart" role="img">
      {band && <rect x={padL} width={W - padL - padR} y={yL(band[1])} height={Math.max(yL(band[0]) - yL(band[1]), 1)} className="band" />}
      {ticks(lLo, lHi).map((v, i) => (
        <g key={`l${i}`}>
          <line x1={padL} x2={W - padR} y1={yL(v)} y2={yL(v)} className="grid" />
          <text x={padL - 6} y={yL(v) + 3} textAnchor="end" className="axis">{yFmt(v)}</text>
        </g>
      ))}
      {right.length > 0 && ticks(rLo, rHi).map((v, i) => (
        <text key={`r${i}`} x={W - padR + 6} y={yR(v) + 3} className="axis">{(yFmtRight ?? yFmt)(v)}</text>
      ))}
      {lLo < 0 && lHi > 0 && <line x1={padL} x2={W - padR} y1={yL(0)} y2={yL(0)} className="zero" />}
      {xTicks.map((v, i) => (
        <text key={`x${i}`} x={x(v)} y={H - 22} textAnchor="middle" className="axis">ep {Math.round(v)}</text>
      ))}
      {series.map((s) => {
        const y = s.axis === "right" ? yR : yL;
        const draw = animate && !s.dashed;
        return (
          <g key={s.name}>
            {s.fill && <polygon className="area" fill={s.color} points={area(s, y, s.axis === "right" ? rLo : Math.max(lLo, 0))} />}
            <polyline
              className={draw ? "draw" : undefined}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeDasharray={s.dashed ? "5 4" : undefined}
              pathLength={draw ? 1 : undefined}
              points={points(s, y)}
            />
            {clip && s.axis !== "right" && s.values.map((v, i) => {
              if (v <= clip[1] && v >= clip[0]) return null;
              const xs = s.xs ?? s.values.map((_, j) => j);
              return (
                <text key={i} x={x(xs[i]!)} y={y(clipV(v)) + (v > clip[1] ? 11 : -4)} textAnchor="middle" className="axis clipped" fill={s.color}>
                  {v > clip[1] ? "▲" : "▼"}{yFmt(v)}
                </text>
              );
            })}
          </g>
        );
      })}
      <g>
        {series.map((s, i) => (
          <g key={s.name} transform={`translate(${padL + i * 150}, ${H - 4})`}>
            <rect width={12} height={2} y={-6} fill={s.color} />
            <text x={16} y={-2} className="axis">{s.name}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}
