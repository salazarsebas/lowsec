"use client";
import type { State } from "@/lib/types";
import { GOODS, TOWNS, TOWN_LABEL } from "@/lib/types";
import { GoodIcon, Icon } from "@/ui";

/** Re-exported so page.tsx (WP2) can keep importing from this file until it switches to IntelRail. */
export { ContractOfDay, Leaderboard } from "./Intel";

/** 3-step hint: buy cheap → pick a lane → sell where it's scarce. Ticks itself off as you play. */
export function Onboarding({ s }: { s: State }) {
  const me = s.me;
  if (!me?.player) return null;
  const p = me.player;
  const cargo = GOODS.reduce((a, g) => a + (me.balances[g] ?? 0), 0);
  const step = p.haul ? 2 : cargo > 0 ? (p.hauls > 0 ? 2 : 1) : p.hauls > 0 ? 3 : 0;
  if (step === 3 && p.hauls > 1) return null;
  const home = GOODS[p.town];
  const steps = [
    { t: "Buy cheap", d: <>{TOWN_LABEL[TOWNS[p.town]]} makes <GoodIcon good={home} size={12} /> {home}. It&apos;s cheapest here.</> },
    { t: "Pick a lane", d: "Safe is slow and costs a bigger toll. Lowsec is 3× faster, but raiders lurk." },
    { t: "Sell where it's scarce", d: "Towns that don't make a good pay more for it. Profit = sell − buy − toll." },
  ];
  return (
    <div className="panel onboarding">
      {steps.map((x, i) => (
        <div key={i} className={i < step ? "step done" : i === step ? "step now" : "step"}>
          <span className="num">{i < step ? <Icon name="done" size={14} strokeWidth={2.5} /> : i + 1}</span>
          <div><b>{x.t}</b><div className="small muted">{x.d}</div></div>
        </div>
      ))}
    </div>
  );
}
