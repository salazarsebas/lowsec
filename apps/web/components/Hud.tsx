"use client";
import { useEffect, useState } from "react";
import type { State } from "@/lib/types";
import { GOODS, TOWNS, TOWN_LABEL } from "@/lib/types";
import { CountUp, GoodIcon, Icon, Pill, SegBar, SoundToggle } from "@/ui";
import { sfx } from "@/lib/sound";
import type { Session } from "@/lib/near";
import type { AmbushInfo, Payoff, Tab, Toast, TxLog } from "@/lib/useGame";

const TABS: Record<Tab, string> = { play: "Play", report: "Economic Report", sim: "Fast-forward" };

/** AI status chip. Wording is kept honest: MOCK whenever decisions come from the local policy;
 *  it never says "verified" (per-decision verification lives on AttestationBadge). Neutral, not loud. */
export function AiChip({ s }: { s: State }) {
  if (s.ai.mode === "tee" && s.ai.health?.lastOk === false)
    return <Pill tone="rule" icon="ai" className="ai-chip" title={`NEAR AI key set, but the last call failed, so NPCs fell back to the labelled MOCK policy: ${s.ai.health.lastError ?? ""}`}>NPC AI: MOCK fallback</Pill>;
  return s.ai.mode === "tee"
    ? <Pill tone="tee" icon="tee" className="ai-chip" title={s.ai.model}>NPC AI: NEAR AI TEE</Pill>
    : <Pill tone="rule" icon="ai" className="ai-chip" title="No NEAR AI key: NPC decisions come from a local rule policy">NPC AI: MOCK</Pill>;
}

export function HudTop({ s, session, tab, setTab, ledger, toggleLedger, logout }: {
  s: State | null; session: Session | null; tab: Tab; setTab: (t: Tab) => void; ledger: boolean; toggleLedger: () => void; logout: () => void;
}) {
  const me = s?.me;
  const cargo = me ? GOODS.reduce((a, g) => a + (me.balances[g] ?? 0), 0) : 0;
  return (
    <header className="hud-top">
      <div className="brand">LOW<span>SEC</span></div>
      <nav>
        {(Object.keys(TABS) as Tab[]).map((t) => (
          <button key={t} className={tab === t ? "tab sel" : "tab"} onClick={() => (sfx("click"), setTab(t))}>{TABS[t]}</button>
        ))}
      </nav>
      <div className="hdr-right">
        {s && <AiChip s={s} />}
        {session && me?.player && (
          <div className="hold-chip" title={`Docked in ${TOWN_LABEL[TOWNS[me.player.town]]} · ${me.player.hauls} hauls · ambushed ${me.player.ambushed}× · raids won ${me.player.raids_won}`}>
            <span className="ui-label">Cargo</span>
            <SegBar total={Math.min(25, s!.params.cargo_cap)} filled={Math.round((cargo / s!.params.cargo_cap) * Math.min(25, s!.params.cargo_cap))} className="hold-bar" />
            <span className="hold-goods">
              {GOODS.map((g) => <span key={g} className={(me.balances[g] ?? 0) > 0 ? "on" : ""}><GoodIcon good={g} size={13} /><CountUp value={me.balances[g] ?? 0} duration={350} /></span>)}
            </span>
          </div>
        )}
        {session && me && (
          <div className="wallet" title="Gold (NEP-245 token)">
            <GoodIcon good="gold" size={18} className="gold-glyph" />
            <CountUp value={me.balances.gold ?? 0} tick className="gold-v" />
          </div>
        )}
        <button className={ledger ? "ui-btn ghost ledger-btn on" : "ui-btn ghost ledger-btn"} onClick={toggleLedger} title="On-chain ledger: accounts, contract, transactions">
          <Icon name="feed" size={14} /> Ledger
        </button>
        <SoundToggle />
        {session && <button className="link logout" onClick={logout} title="Log out">Exit</button>}
      </div>
    </header>
  );
}

/** Self-dismissing toasts (4.5s, click to dismiss). Newest first. Tx link is a small icon. */
export function Toasts({ toasts, dismiss, explorer }: { toasts: Toast[]; dismiss: (id: number) => void; explorer: string }) {
  const icon = (t: Toast) => (t.kind === "ambush" ? "ambush" : !t.ok ? "lowsec" : t.kind === "buy" || t.kind === "sell" ? "gold" : t.kind === "haul" ? "launch" : t.kind === "raid" ? "raid" : "done") as any;
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={t.ok ? "toast ok" : "toast bad"} onClick={() => dismiss(t.id)}>
          <Icon name={icon(t)} size={15} className={t.ok ? "green" : "red"} />
          <span className="tmsg">{t.msg}</span>
          {t.tx && <a href={`${explorer}/txns/${t.tx}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="View transaction"><Icon name="tx" size={12} /></a>}
          <i className="tlife" />
        </div>
      ))}
    </div>
  );
}

/** LEDGER drawer: all raw chain detail lives here, out of the main HUD. */
export function Ledger({ s, session, txlog, onClose }: { s: State; session: Session | null; txlog: TxLog[]; onClose: () => void }) {
  const ex = s.explorer ?? "https://testnet.nearblocks.io";
  const chain = s.feed.filter((f) => f.txHash).slice(0, 24);
  return (
    <div className="ledger panel">
      <div className="ui-panel-header">
        <h3>Ledger</h3><span className="sub">NEAR testnet</span>
        <span className="right"><button className="ui-btn ghost sm" onClick={onClose} aria-label="Close ledger"><Icon name="close" size={14} /></button></span>
      </div>
      <dl className="ui-kv ledger-kv">
        {session && <><dt>Pilot</dt><dd><a href={`${ex}/address/${session.accountId}`} target="_blank" rel="noreferrer">{session.accountId}</a></dd></>}
        <dt>Contract</dt><dd><a href={`${ex}/address/${s.contract}`} target="_blank" rel="noreferrer">{s.contract}</a></dd>
        <dt>Tokens</dt><dd>gold + cargo · NEP-245</dd>
        <dt>Gas</dt><dd>relayed meta-tx (NEP-366)</dd>
        <dt>Tick / epoch</dt><dd>{s.economy.tick} / {s.economy.epoch}</dd>
      </dl>
      {txlog.length > 0 && (
        <>
          <div className="ui-label ledger-h">Your transactions</div>
          <ul className="ledger-list">
            {txlog.map((t) => (
              <li key={t.ts + t.label} className={t.ok ? "" : "bad"}>
                <span className="lt num">{new Date(t.ts).toLocaleTimeString("en-GB")}</span><span className="lm">{t.label}</span>
                {t.tx && <a href={`${ex}/txns/${t.tx}`} target="_blank" rel="noreferrer" title={t.tx}><Icon name="tx" size={12} /></a>}
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="ui-label ledger-h">Chain activity</div>
      <ul className="ledger-list">
        {chain.map((f) => (
          <li key={f.ts + f.text} className={f.type === "ambush" ? "bad" : ""}>
            <span className="lt num">{new Date(f.ts).toLocaleTimeString("en-GB")}</span><span className="lm">{f.text}</span>
            <a href={`${ex}/txns/${f.txHash}`} target="_blank" rel="noreferrer" title={f.txHash}><Icon name="tx" size={12} /></a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 0 on mount, then `v` after `ms` (so CountUp animates up from zero). */
function useLater(v: number, ms: number) {
  const [x, setX] = useState(0);
  useEffect(() => { const t = setTimeout(() => setX(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return x;
}

/** Full-screen ambush moment: red vignette + stencil alert + loss numbers. Click-through. */
export function AmbushOverlay({ a, onDismiss }: { a: AmbushInfo; onDismiss?: () => void }) {
  const burned = useLater(a.burned, 450), looted = useLater(a.looted, 600), delivered = useLater(a.delivered, 750);
  return (
    <div className="ambush-banner" role="alert" onClick={onDismiss} title="Click to dismiss">
      <div className="ab-vignette" />
      <div className="ab-core">
        <div className="ab-rule" />
        <div className="ab-kicker"><Icon name="ambush" size={18} strokeWidth={2} /> Raider contact · {a.who}</div>
        <div className="ab-title">Convoy intercepted</div>
        <div className="ab-nums">
          <div className="ab-n burn"><span className="ui-label">Burned forever</span><b>−<CountUp value={burned} duration={700} /></b><em>{a.good}</em></div>
          <div className="ab-n loot"><span className="ui-label">Looted by {a.who}</span><b>−<CountUp value={looted} duration={700} /></b><em>{a.good}</em></div>
          <div className="ab-n ok"><span className="ui-label">Delivered</span><b><CountUp value={delivered} duration={700} /></b><em>of {a.qty}</em></div>
        </div>
        {a.valueLost > 0 && <div className="ab-sub">≈ {a.valueLost}◎ of cargo gone · burn is a real sink (mt_burn)</div>}
        <div className="ab-rule" />
      </div>
    </div>
  );
}

/** Arrival payoff receipt (Balatro-style): lines then a big counted-up profit. Click-through. */
export function PayoffReceipt({ p }: { p: Payoff }) {
  const [show, setShow] = useState(0);
  useEffect(() => {
    const ts = [250, 550, 850, 1150].map((ms, i) => setTimeout(() => (setShow(i + 1), sfx("click", { rate: 1 + i * 0.12, volume: 0.6 })), ms));
    return () => ts.forEach(clearTimeout);
  }, []);
  const rows: [string, string, string?][] = p.good
    ? [
        [`${p.delivered} ${p.good} @ ${p.price}`, `${p.value}`],
        ...(p.cost != null ? [["Cargo cost (est.)", `−${p.cost}`] as [string, string]] : []),
        ["Lane toll", `−${p.toll}`],
        ...(p.dockFee > 0 ? [["Docking fee (burned)", `−${p.dockFee}`] as [string, string]] : []),
      ]
    : [["Empty hold", "0"], ["Lane toll", `−${p.toll}`]];
  return (
    <div className="payoff panel" role="status">
      <div className="po-head"><Icon name="done" size={16} strokeWidth={2.5} /> Arrived · {p.town}</div>
      <div className="po-rows">
        {rows.map(([k, v], i) => <div key={k} className={show > i ? "po-row on" : "po-row"}><span>{k}</span><b className="num">{v}</b></div>)}
      </div>
      {p.good && (
        <div className={show >= 4 ? "po-total on" : "po-total"}>
          <span className="ui-label">{p.profit != null ? "Run profit" : "Cargo value here"}</span>
          <b className={(p.profit ?? p.value) >= 0 ? "pos" : "neg"}><CountUp value={show >= 4 ? p.profit ?? p.value : 0} duration={700} tick signed /><GoodIcon good="gold" size={22} /></b>
          <span className="po-hint">Hit <b>Sell all</b> to cash in at {p.town}</span>
        </div>
      )}
    </div>
  );
}
