"use client";
import { useEffect, useState } from "react";
import type { State } from "@/lib/types";
import { GOODS, TOWNS, TOWN_LABEL } from "@/lib/types";
import { GoodIcon, Icon } from "@/ui";

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

export function ContractOfDay({ account }: { account?: string }) {
  const [c, setC] = useState<any>(null);
  useEffect(() => {
    const load = () => fetch(`/api/contract-of-the-day${account ? `?account=${account}` : ""}`).then((x) => x.json()).then(setC).catch(() => {});
    load();
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, [account]);
  if (!c) return null;
  const pct = Math.min(100, Math.round((c.mine / c.qty) * 100));
  return (
    <div className="panel cotd">
      <h3><Icon name="contract" size={15} /> Contract of the day <span className="muted small">{c.date} UTC</span></h3>
      <div>Deliver <b>{c.qty} <GoodIcon good={c.good} /> {c.good}</b> to <b>{TOWN_LABEL[c.to]}</b></div>
      {account && (
        <div className="bar"><div style={{ width: `${pct}%` }} /><span>{c.mine}/{c.qty}{pct >= 100 ? <><Icon name="star" size={11} /> done</> : ""}</span></div>
      )}
      <div className="muted small">{c.done.length} pilot(s) completed it · reward: {c.reward}</div>
    </div>
  );
}

export function Leaderboard({ me }: { me?: string }) {
  const [l, setL] = useState<any>(null);
  useEffect(() => {
    const load = () => fetch("/api/leaderboard").then((x) => x.json()).then(setL).catch(() => {});
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);
  if (!l?.richest) return null;
  return (
    <div className="panel board">
      <h3><Icon name="leaderboard" size={15} /> Richest pilots <span className="muted small">epoch {l.epoch}</span></h3>
      <ol>
        {l.richest.slice(0, 6).map((r: any) => (
          <li key={r.account} className={r.account === me ? "me" : ""}>
            <span>{r.contractDone ? <Icon name="star" size={11} className="gold-glyph" /> : null}{r.name}</span>
            <span><b>{r.gold}</b>◎ {r.gainThisEpoch !== 0 && <small className={r.gainThisEpoch > 0 ? "green" : "red"}>{r.gainThisEpoch > 0 ? "+" : ""}{r.gainThisEpoch} this epoch</small>}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
