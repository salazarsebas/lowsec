"use client";
import type { State } from "@/lib/types";
import { GOODS, TOWNS, TOWN_LABEL } from "@/lib/types";
import { GoodIcon, Icon } from "@/ui";

/** Onboarding step derived from player state (same rule as the original Goals.tsx Onboarding):
 *  0 buy · 1 pick a lane · 2 sell (on the road or carrying cargo after a haul) · 3 loop done.
 *  Returns null once the tracker is retired (after the 2nd haul). */
export function onboardingStep(s: State | null): number | null {
  const me = s?.me;
  if (!me?.player) return null;
  const p = me.player;
  const cargo = GOODS.reduce((a, g) => a + (me.balances[g] ?? 0), 0);
  const step = p.haul ? 2 : cargo > 0 ? (p.hauls > 0 ? 2 : 1) : p.hauls > 0 ? 3 : 0;
  if (step === 3 && p.hauls > 1) return null;
  return step;
}

/** EVE-Frontier-style 3-step tracker: done steps tick off, the active one is lit, the rest dim. */
export function Onboarding({ s }: { s: State }) {
  const step = onboardingStep(s);
  if (step === null || !s.me?.player) return null;
  const p = s.me.player;
  const home = GOODS[p.town];
  const best = bestSale(s, p.town);
  const steps = [
    { t: <>Buy <GoodIcon good={home} size={13} /> {home} at {TOWN_LABEL[TOWNS[p.town]]}</>, d: <>{TOWN_LABEL[TOWNS[p.town]]} makes {home}, so it&apos;s cheapest here. Hit <b>Buy</b>.</> },
    { t: "Choose a lane", d: <>Safe is slow with a big toll. <b className="lowsec-txt">Lowsec</b> is 3× faster, but raiders lurk. Then <b>Depart</b>.</> },
    { t: <>Sell where it&apos;s scarce</>, d: p.haul ? "Convoy in transit. Arrival settles on-chain." : <>Towns that don&apos;t make a good pay more{best ? <> ({TOWN_LABEL[TOWNS[best.town]]} pays {best.bid} for {home})</> : null}. Hit <b>Sell all</b>.</> },
  ];
  return (
    <div className="tracker" data-step={step}>
      <span className="tracker-tag ui-label">{step >= 3 ? "Loop complete" : `Objective ${step + 1}/3`}</span>
      {steps.map((x, i) => (
        <div key={i} className={i < step ? "tstep done" : i === step ? "tstep now" : "tstep"}>
          <span className="num">{i < step ? <Icon name="done" size={13} strokeWidth={2.5} /> : i + 1}</span>
          <div className="tbody"><b>{x.t}</b>{i === step && <div className="tdesc">{x.d}</div>}</div>
        </div>
      ))}
    </div>
  );
}

/** Best other town to sell the good made in `from`. */
export function bestSale(s: State, from: number) {
  let best: { town: number; bid: number } | null = null;
  s.economy.towns.forEach((t, i) => {
    if (i !== from && (!best || t.bid[from] > best.bid)) best = { town: i, bid: t.bid[from] };
  });
  return best as { town: number; bid: number } | null;
}
