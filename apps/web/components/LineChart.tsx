/** Tiny dependency-free SVG chart: several series over the same x axis. */
export interface Series { name: string; color: string; values: number[]; dashed?: boolean }
export function LineChart({ series, height = 180, yFmt = (v: number) => v.toFixed(1), band }: { series: Series[]; height?: number; yFmt?: (v: number) => string; band?: [number, number] }) {
  const W = 560, H = height, pad = 34;
  const all = series.flatMap((s) => s.values).concat(band ?? []);
  if (!all.length) return <div className="muted">no data yet</div>;
  let lo = Math.min(...all), hi = Math.max(...all);
  if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
  const n = Math.max(...series.map((s) => s.values.length));
  const x = (i: number) => pad + (i * (W - pad - 8)) / Math.max(n - 1, 1);
  const y = (v: number) => H - 20 - ((v - lo) * (H - 30)) / (hi - lo);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart">
      {band && <rect x={pad} width={W - pad - 8} y={y(band[1])} height={Math.max(y(band[0]) - y(band[1]), 1)} className="band" />}
      {[lo, (lo + hi) / 2, hi].map((v, i) => (
        <g key={i}>
          <line x1={pad} x2={W - 8} y1={y(v)} y2={y(v)} className="grid" />
          <text x={2} y={y(v) + 4} className="axis">{yFmt(v)}</text>
        </g>
      ))}
      {lo < 0 && hi > 0 && <line x1={pad} x2={W - 8} y1={y(0)} y2={y(0)} className="zero" />}
      {series.map((s) => (
        <polyline key={s.name} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? "5 4" : undefined} points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
      ))}
      <g>
        {series.map((s, i) => (
          <g key={s.name} transform={`translate(${pad + i * 150}, ${H - 4})`}>
            <rect width={10} height={3} y={-4} fill={s.color} />
            <text x={14} className="axis">{s.name}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}
