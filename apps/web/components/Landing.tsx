"use client";
import { useState } from "react";
import type { State } from "@/lib/types";
import { CountUp, Icon, type IconName } from "@/ui";

const LOOP: { icon: IconName; t: string; d: string }[] = [
  { icon: "ore", t: "Buy", d: "cheap at the source" },
  { icon: "route", t: "Haul", d: "safe or lowsec" },
  { icon: "ambush", t: "Risk", d: "raiders camp lanes" },
  { icon: "gold", t: "Sell", d: "where it's scarce" },
  { icon: "burn", t: "Burn", d: "lost cargo is gone" },
];
const STEPS = ["Creating your pilot account", "Registering (gasless meta-tx)", "Docking at Mina"];

/** Landing hero over the live map: pitch, animated core loop, live economy stats and the login.
 *  e2e contract: `.login input` + `.login button.primary`. */
export function Landing({ s, joining, join }: { s: State; joining: string; join: (name: string) => void }) {
  const [name, setName] = useState("");
  const at = STEPS.indexOf(joining);
  return (
    <section className="landing">
      <div className="ld-kicker ui-label"><span className="dot" /> Live on NEAR testnet · a mini EVE Frontier</div>
      <h1 className="ld-title">Haul cargo through <em>hostile space.</em></h1>
      <p className="ld-pitch">Buy cheap, pick a lane, sell where it&apos;s scarce. <b>Lowsec</b> is 3× faster, but raiders camp it, and every crate they hit is <b>burned forever</b>. AI traders compete with you, and an AI Council steers the economy.</p>

      <ol className="ld-loop" aria-label="Core loop">
        {LOOP.map((x, i) => (
          <li key={x.t} style={{ ["--i" as any]: i }} className={x.t === "Risk" || x.t === "Burn" ? "hot" : ""}>
            <span className="ll-ico"><Icon name={x.icon} size={18} /></span>
            <b>{x.t}</b><small>{x.d}</small>
          </li>
        ))}
        <span className="ld-pulse" aria-hidden />
      </ol>

      <div className="panel login">
        <label className="ui-label" htmlFor="callsign">Pilot callsign</label>
        <div className="login-row">
          <input id="callsign" placeholder="your name" autoComplete="off" spellCheck={false} value={name} disabled={!!joining}
            onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))} onKeyDown={(e) => e.key === "Enter" && name && !joining && join(name)} />
          <button className="primary" disabled={!name || !!joining} onClick={() => join(name)}>{joining ? "Launching…" : <>Launch <Icon name="next" size={14} strokeWidth={2.5} /></>}</button>
        </div>
        {joining ? (
          <ol className="join-steps">
            {STEPS.map((t, i) => <li key={t} className={i < at ? "done" : i === at ? "now" : ""}><span>{i < at ? <Icon name="done" size={12} strokeWidth={3} /> : i === at ? <i className="spin" /> : null}</span>{t}</li>)}
          </ol>
        ) : (
          <div className="login-fine">No wallet · no seed phrase · no gas. Your account <code>name.{s.contract}</code> is created for you. First Lowsec run takes ~15s.</div>
        )}
      </div>

      <div className="ld-stats">
        <div><span className="ui-label">Cargo burned</span><b className="num loss"><CountUp value={s.economy.total.cargo_burned_units ?? 0} /></b></div>
        <div><span className="ui-label">Ambushes</span><b className="num"><CountUp value={s.economy.total.ambushes ?? 0} /></b></div>
        <div><span className="ui-label">Pilots</span><b className="num"><CountUp value={s.economy.players} /></b></div>
        <div><span className="ui-label">Gold supply</span><b className="num gold"><CountUp value={s.economy.gold_supply} /></b></div>
      </div>
    </section>
  );
}
