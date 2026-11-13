"use client";
import { useEffect, useRef, useState } from "react";
import { sfx } from "@/lib/sound";

/** Animated number (Balatro-style). Tweens from the previous value to `value` with rAF over
 *  `duration` ms (ease-out), pops on change, and optionally plays rising "coin" ticks.
 *  First render shows `value` directly (no animation on mount). */
export function CountUp({ value, duration = 500, format = (n) => Math.round(n).toLocaleString("en-US"), tick = false, signed = false, className }: {
  value: number; duration?: number; format?: (n: number) => string; tick?: boolean; signed?: boolean; className?: string;
}) {
  const [shown, setShown] = useState(value);
  const [pop, setPop] = useState(0);
  const from = useRef(value);
  useEffect(() => {
    const a = from.current, b = value;
    if (a === b) return;
    let raf = 0, last = -1;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / duration), e = 1 - Math.pow(1 - k, 3);
      const v = a + (b - a) * e;
      setShown(v);
      if (tick && b > a) {
        const n = Math.floor(k * 6);
        if (n !== last) (last = n), sfx("coin", { rate: 1 + n * 0.08, volume: 0.6 });
      }
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = b;
    };
    setPop((p) => p + 1);
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      from.current = b;
    };
  }, [value, duration, tick]);
  const txt = format(shown);
  return (
    <span key={pop} className={["ui-countup", pop > 0 && "pop", className].filter(Boolean).join(" ")}>
      {signed && shown > 0 ? `+${txt}` : txt}
    </span>
  );
}
