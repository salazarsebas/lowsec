/** Dependency-free SVG chart: lines, area, or bars. No diagonal interpolation across unknown gaps
 *  unless the series is an explicit line of consecutive points. */
export interface Series {
  name: string;
  color: string;
  values: number[];
  /** Explicit x coordinates (e.g. epoch numbers). Default: 0..n-1. */
  xs?: number[];
  /** Bar/step width in x units (default 1). Bars cover [x, x+span]. */
  spans?: number[];
  dashed?: boolean;
  axis?: "left" | "right";
  fill?: boolean;
  kind?: "line" | "area" | "bars";
}

export interface ChartMarker {
  x: number;
  label: string;
}

export function LineChart({
  series, height = 200, yFmt = (v: number) => v.toFixed(1), yFmtRight,
  band, clip, animate = false, empty = "no data yet", markers = [],
}: {
  series: Series[];
  height?: number;
  yFmt?: (v: number) => string;
  yFmtRight?: (v: number) => string;
  band?: [number, number];
  clip?: [number, number];
  animate?: boolean;
  empty?: string;
  markers?: ChartMarker[];
}) {
  // Wide viewBox so --fs-micro / 9–10px axis type stays close to the token scale when the
  // SVG is stretched to the panel (a 640-wide box was enlarging labels ~2.5× at 1920).
  const W = 1200, H = Math.max(height, 200), padL = 52, padR = series.some((s) => s.axis === "right") ? 58 : 16, padT = 18, padB = 22;
  const left = series.filter((s) => s.axis !== "right");
  const right = series.filter((s) => s.axis === "right");
  const allXs = series.flatMap((s) => {
    const xs = s.xs ?? s.values.map((_, i) => i);
    const spans = s.spans ?? xs.map(() => 0);
    return xs.concat(xs.map((x, i) => x + (spans[i] ?? 0)));
  });
  const rawLeft = left.flatMap((s) => s.values).concat(band ?? []);
  if (!allXs.length || !series.some((s) => s.values.length)) {
    return <div className="econ-empty muted">{empty}</div>;
  }

  const clipV = (v: number) => (clip ? Math.min(Math.max(v, clip[0]), clip[1]) : v);
  const domain = (vals: number[], applyClip: boolean, fallback: [number, number] = [0, 1]): [number, number] => {
    if (!vals.length) return fallback;
    const used = applyClip && clip ? vals.map(clipV) : vals;
    let lo = Math.min(...used), hi = Math.max(...used);
    if (band && applyClip) { lo = Math.min(lo, band[0]); hi = Math.max(hi, band[1]); }
    if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
    const pad = (hi - lo) * 0.08;
    return [lo - pad, hi + pad];
  };
  const [lLo, lHi] = domain(rawLeft, true);
  const [rLo, rHi] = domain(right.flatMap((s) => s.values), false, [0, 1]);
  const xMin = Math.min(...allXs), xMax = Math.max(...allXs);
  const x = (v: number) => padL + ((v - xMin) * (W - padL - padR)) / Math.max(xMax - xMin, 1e-9);
  const yL = (v: number) => padT + ((lHi - v) * (H - padT - padB)) / (lHi - lLo);
  const yR = (v: number) => padT + ((rHi - v) * (H - padT - padB)) / (rHi - rLo);
  const lTicks = (() => {
    // 0 and the domain ends; skip the 1% band edge when it would sit on top of 0%.
    const raw = [lLo, 0, lHi];
    const uniq: number[] = [];
    for (const v of raw) if (!uniq.some((u) => Math.abs(u - v) < (lHi - lLo) * 0.08)) uniq.push(v);
    return uniq.sort((a, b) => a - b);
  })();
  const rTicks = [rLo, rLo + (rHi - rLo) / 2, rHi];
  const xTicks = (() => {
    const span = xMax - xMin;
    if (span <= 1) return [xMin, xMax];
    return [xMin, xMin + span / 2, xMax];
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
  const inBand = (v: number) => !!band && v >= band[0] && v <= band[1];
  const barFill = (v: number) => (inBand(v) ? "var(--profit)" : "var(--loss)");

  const visibleMarkers = markers.filter((m) => m.x >= xMin && m.x <= xMax);

  return (
    <div className="econ-chart-wrap">
      <div className="econ-legend">
        {series.map((s) => (
          <span key={s.name}>
            {s.kind === "bars"
              ? <><i className="swatch bars in" /><i className="swatch bars out" /></>
              : <i className="swatch" style={{ background: s.color }} />}
            {s.name}
          </span>
        ))}
        {band && <span><i className="swatch band" />{`${band[0]}–${band[1]}% target`}</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart econ-chart" role="img" preserveAspectRatio="xMidYMid meet">
        {lTicks.map((v, i) => (
          <g key={`l${i}`}>
            <line x1={padL} x2={W - padR} y1={yL(v)} y2={yL(v)} className="grid" />
            <text x={padL - 6} y={yL(v) + 3} textAnchor="end" className="axis">{yFmt(v)}</text>
          </g>
        ))}
        {right.length > 0 && rTicks.map((v, i) => (
          <text key={`r${i}`} x={W - padR + 6} y={yR(v) + 3} className="axis">{(yFmtRight ?? yFmt)(v)}</text>
        ))}
        {lLo < 0 && lHi > 0 && <line x1={padL} x2={W - padR} y1={yL(0)} y2={yL(0)} className="zero" />}
        {xTicks.map((v, i) => (
          <text key={`x${i}`} x={x(v)} y={H - 6} textAnchor="middle" className="axis">ep {Math.round(v)}</text>
        ))}

        {right.map((s) => (
          <g key={`fill-${s.name}`}>
            {(s.fill || s.kind === "area") && <polygon className="gold-area area" fill={s.color} points={area(s, yR, rLo)} />}
          </g>
        ))}

        {band && (
          <g className="econ-band">
            <rect x={padL} width={W - padL - padR} y={yL(band[1])} height={Math.max(yL(band[0]) - yL(band[1]), 1)} className="band" />
            <line x1={padL} x2={W - padR} y1={yL(band[0])} y2={yL(band[0])} className="band-edge" />
            <line x1={padL} x2={W - padR} y1={yL(band[1])} y2={yL(band[1])} className="band-edge" />
            <text x={padL + 6} y={yL(band[1]) - 4} className="band-label">0–{band[1]}% target</text>
          </g>
        )}
        {right.map((s) => {
          const draw = animate && !s.dashed;
          return (
            <polyline
              key={s.name}
              className={draw ? "draw" : undefined}
              fill="none"
              stroke={s.color}
              strokeWidth={1.75}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={s.dashed ? "5 4" : undefined}
              pathLength={draw ? 1 : undefined}
              points={points(s, yR)}
            />
          );
        })}
        {left.map((s) => {
          if (s.kind === "bars") {
            const xs = s.xs ?? s.values.map((_, i) => i);
            const spans = s.spans ?? xs.map(() => 1);
            const y0 = yL(0);
            return (
              <g key={s.name}>
                {s.values.map((v, i) => {
                  const x0 = x(xs[i]!);
                  const x1 = x(xs[i]! + Math.max(spans[i] ?? 1, 0.5));
                  const gap = Math.min(1.2, Math.max(0.4, (x1 - x0) * 0.08));
                  const w = Math.max(1.5, x1 - x0 - gap);
                  const cv = clipV(v);
                  const yv = yL(cv);
                  const top = Math.min(yv, y0), h = Math.max(Math.abs(yv - y0), 1);
                  return (
                    <g key={i}>
                      <rect x={x0 + gap / 2} y={top} width={w} height={h} fill={barFill(v)} opacity={inBand(v) ? 0.85 : 0.9} />
                      {clip && (v > clip[1] || v < clip[0]) && (
                        <text x={x0 + w / 2} y={yv + (v > clip[1] ? -3 : 10)} textAnchor="middle" className="axis clipped" fill="var(--loss)">
                          {v > clip[1] ? "▲" : "▼"}{yFmt(v)}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          }
          const y = yL;
          const draw = animate && !s.dashed;
          return (
            <g key={s.name}>
              {s.fill && <polygon className="area" fill={s.color} points={area(s, y, Math.max(lLo, 0))} />}
              <polyline
                className={draw ? "draw" : undefined}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeDasharray={s.dashed ? "5 4" : undefined}
                pathLength={draw ? 1 : undefined}
                points={points(s, y)}
              />
            </g>
          );
        })}

        {visibleMarkers.map((m, i) => {
          const mx = x(m.x);
          const nearRight = mx > W - 200;
          const labelY = padT - 5 + (i % 2) * 10;
          return (
            <g key={`${m.x}-${m.label}`} className="econ-marker">
              <line x1={mx} x2={mx} y1={padT + (i % 2) * 8} y2={H - padB} className="marker-line" />
              <circle cx={mx} cy={padT + (i % 2) * 8} r={2.5} className="marker-dot" />
              <text x={mx + (nearRight ? -6 : 6)} y={labelY} textAnchor={nearRight ? "end" : "start"} className="marker-label">{m.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Pick up to 3 real Council raise/cut events, one per third of the epoch range. Never fabricates points. */
export function councilMarkers(council: { ok?: boolean; hold?: string | null; epoch: number; prevFaucetBps: number; nextFaucetBps: number }[]): ChartMarker[] {
  const ev = (council ?? []).filter((c) => c && c.ok && !c.hold && Number(c.nextFaucetBps) !== Number(c.prevFaucetBps));
  if (!ev.length) return [];
  const mag = (c: (typeof ev)[number]) => Math.abs(Number(c.nextFaucetBps) - Number(c.prevFaucetBps));
  const lo = Math.min(...ev.map((c) => c.epoch)), hi = Math.max(...ev.map((c) => c.epoch));
  const w = Math.max(hi - lo, 1);
  const thirds = [0, 1, 2].map((i) => ev.filter((c) => c.epoch >= lo + (i * w) / 3 && c.epoch < lo + ((i + 1) * w) / 3 + (i === 2 ? 1 : 0)));
  const pick = (arr: typeof ev) => [...arr].sort((a, b) => mag(b) - mag(a))[0];
  const picked = thirds.map(pick).filter((c): c is (typeof ev)[number] => !!c);
  const tag = (c: (typeof ev)[number]) => {
    const a = (c.prevFaucetBps / 100).toFixed(0), b = (c.nextFaucetBps / 100).toFixed(0);
    return c.nextFaucetBps > c.prevFaucetBps ? `Raise ${a}→${b}%` : `Cut ${a}→${b}%`;
  };
  return picked.sort((a, b) => a.epoch - b.epoch).map((c) => ({ x: c.epoch, label: tag(c) }));
}
