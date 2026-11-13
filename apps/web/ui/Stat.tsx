import type { ReactNode } from "react";
import { CountUp } from "./CountUp";

/** Label over a big mono number. Numeric values count up on change. */
export function Stat({ label, value, tone, size = "md", unit, tick, className }: {
  label: ReactNode; value: number | ReactNode; tone?: "gold" | "profit" | "loss"; size?: "md" | "lg"; unit?: ReactNode; tick?: boolean; className?: string;
}) {
  return (
    <div className={["ui-stat", size === "lg" && "lg", className].filter(Boolean).join(" ")}>
      <span className="ui-label">{label}</span>
      <span className={tone ? `v ${tone}` : "v"}>{typeof value === "number" ? <CountUp value={value} tick={tick} /> : value}{unit && <> {unit}</>}</span>
    </div>
  );
}
