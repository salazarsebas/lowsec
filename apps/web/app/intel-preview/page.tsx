"use client";
/** Preview for the WP3 intel column. WP2 will mount <IntelRail> in page.tsx; this route
 *  lets us screenshot the finished rail at 1280×720 and 1920×1080 against live testnet state. */
import { useEffect, useState } from "react";
import type { State } from "@/lib/types";
import { IntelRail } from "@/components/Intel";

const ACCOUNT = "hauler-1.lowsec.testnet";

export default function IntelPreview() {
  const [s, setS] = useState<State | null>(null);
  useEffect(() => {
    const load = () =>
      fetch(`/api/state?account=${ACCOUNT}`)
        .then((r) => r.json())
        .then((d) => d?.economy && setS(d))
        .catch(() => {});
    load();
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, []);
  if (!s) return <main className="panel">Connecting to lowsec.testnet…</main>;
  return (
    <div className="intel-preview">
      <div className="intel-preview-map">
        <div className="label">Star map · preview</div>
      </div>
      <IntelRail s={s} accountId={ACCOUNT} explorer={s.explorer} />
    </div>
  );
}
