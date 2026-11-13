import { secColor } from "./security";
/** EVE-convention security tag, e.g. <SecTag sec={0.3} /> renders "0.3" in the ramp colour. */
export function SecTag({ sec, className }: { sec: number; className?: string }) {
  return <span className={className ? `ui-sec ${className}` : "ui-sec"} style={{ color: secColor(sec) }}>{sec.toFixed(1)}</span>;
}
