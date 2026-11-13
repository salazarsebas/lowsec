/** FTL-style segmented bar (cargo hold): `filled` cream blocks, then `burned` red flashing blocks, of `total`. */
export function SegBar({ total, filled, burned = 0, className }: { total: number; filled: number; burned?: number; className?: string }) {
  return (
    <div className={className ? `ui-segbar ${className}` : "ui-segbar"} role="meter" aria-valuemin={0} aria-valuemax={total} aria-valuenow={filled}>
      {Array.from({ length: total }, (_, i) => <i key={i} className={i < filled ? "on" : i < filled + burned ? "burn" : undefined} />)}
    </div>
  );
}

/** Thin progress bar, value 0..1, colour defaults to --ink (pass e.g. "var(--signal)"). */
export function Progress({ value, color, className }: { value: number; color?: string; className?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={className ? `ui-progress ${className}` : "ui-progress"} style={color ? ({ ["--c" as any]: color }) : undefined}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}
