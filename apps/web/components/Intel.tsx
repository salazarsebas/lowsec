"use client";
import { feedText } from "@/lib/errors";
import { useEffect, useState } from "react";
import type { FeedItem, Player, State } from "@/lib/types";
import { GOODS, NPC_COLORS, TOWN_LABEL, TOWNS } from "@/lib/types";
import { CountUp, GoodIcon, Icon, Panel, Progress, SegBar, Tooltip } from "@/ui";
import { Deposit } from "./Deposit";
import { NpcCard } from "./NpcCard";

/** WP3 intel rail. WP2 can replace the inline <aside> in page.tsx with:
 *  <IntelRail s={s} accountId={session?.accountId} explorer={explorer} /> */
export function IntelRail({ s, accountId, explorer }: { s: State; accountId?: string; explorer: string }) {
  return (
    <aside className="right intel-rail">
      {s.me?.player && (
        <HoldCard
          balances={s.me.balances}
          cap={s.params.cargo_cap}
          contract={s.contract}
          explorer={explorer}
          player={s.me.player}
        />
      )}
      <ContractOfDay account={accountId} />
      <Leaderboard me={accountId} />
      <NpcList npcs={s.npcs} explorer={explorer} />
      <Deposit />
      <Feed items={s.feed} explorer={explorer} />
    </aside>
  );
}

export function HoldCard({
  balances, cap, contract, explorer, player,
}: {
  balances: Record<string, number>;
  cap: number;
  contract: string;
  explorer: string;
  player?: Player | null;
}) {
  const cargo = GOODS.reduce((a, g) => a + (balances[g] ?? 0), 0);
  return (
    <Panel className="hold-card" title="Your hold" sub={`${cargo}/${cap}`} icon={<Icon name="cargo" size={14} />} right={<GoodIcon good="gold" className="gold-glyph" size={14} />}>
      <div className="hold">
        <span>
          <GoodIcon good="gold" className="gold-glyph" /> gold <b><CountUp value={balances.gold ?? 0} /></b>
        </span>
        {GOODS.map((g) => (
          <span key={g}>
            <GoodIcon good={g} /> {g} <b><CountUp value={balances[g] ?? 0} /></b>
          </span>
        ))}
      </div>
      <SegBar total={cap} filled={Math.min(cap, cargo)} />
      {player && (
        <div className="muted small hold-meta">
          in {TOWN_LABEL[TOWNS[player.town]]} · {player.hauls} hauls · ambushed {player.ambushed}× · raids won {player.raids_won}
        </div>
      )}
      <div className="muted small">
        NEP-245 tokens on <a href={`${explorer}/address/${contract}`} target="_blank" rel="noreferrer">{contract}</a>
      </div>
    </Panel>
  );
}

export function NpcList({ npcs, explorer }: { npcs: State["npcs"]; explorer: string }) {
  return (
    <Panel className="npc-list" title="NPC traders" sub="4 AI + the Guild · hover them on the map">
      {npcs.map((n, i) => (
        <div key={n.id} className="npc">
          <NpcCard n={n} explorer={explorer} compact accent={NPC_COLORS[i % NPC_COLORS.length]} />
        </div>
      ))}
    </Panel>
  );
}

const FEED_ICON = {
  ambush: "ambush",
  raid: "raid",
  council: "council",
  contract: "contract",
  haul: "route",
  arrive: "launch",
  strategy: "ai",
  sell: "profit",
  buy: "cargo",
} as const;

export function Feed({ items, explorer }: { items: FeedItem[]; explorer: string }) {
  return (
    <Panel className="feed" title="Activity" icon={<Icon name="feed" size={14} />}>
      <ul>
        {items.slice(0, 16).map((f) => {
          const icon = f.ok === false ? "close" : (FEED_ICON[f.type as keyof typeof FEED_ICON] ?? "feed");
          return (
            <li
              key={f.ts + f.text}
              className={f.type === "ambush" ? "ambush" : f.type === "council" ? "council" : f.type === "contract" ? "contract" : f.ok === false ? "fail" : f.type}
            >
              <Icon name={icon} size={11} />
              <span className="muted small">{new Date(f.ts).toLocaleTimeString()}</span>
              <span className="feed-text">{feedText(f)}</span>
              {f.txHash && (
                <a href={`${explorer}/txns/${f.txHash}`} target="_blank" rel="noreferrer">↗</a>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
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
  const pct = Math.min(1, c.qty ? c.mine / c.qty : 0);
  const done = pct >= 1;
  return (
    <Panel
      className="cotd"
      title="Contract of the day"
      sub={`${c.date} UTC`}
      icon={<Icon name="contract" size={14} />}
      right={done ? <span className="cotd-done"><Icon name="star" size={11} className="gold-glyph" /> done</span> : undefined}
    >
      <div className="cotd-brief">
        Deliver <b>{c.qty} <GoodIcon good={c.good} size={13} /> {c.good}</b> to <b>{TOWN_LABEL[c.to] ?? c.to}</b>
      </div>
      {account && (
        <div className="cotd-progress">
          <Progress value={pct} color={done ? "var(--profit)" : "var(--signal)"} />
          <span className="muted small">{done ? (c.mine > c.qty ? `done · ${c.mine} delivered` : "done") : `${c.mine}/${c.qty}`}</span>
        </div>
      )}
      <div className="muted small">{c.done.length} pilot(s) completed it · reward: {c.reward}</div>
    </Panel>
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
    <Panel className="board" title="Richest pilots" sub={`epoch ${l.epoch}`} icon={<Icon name="leaderboard" size={14} />}>
      <ol>
        {l.richest.slice(0, 6).map((r: any, i: number) => (
          <li key={r.account} className={r.account === me ? "me" : ""}>
            <span className={`rank r${i + 1}`}>{String(i + 1).padStart(2, "0")}</span>
            <span className="pilot">
              {r.contractDone ? (
                <Tooltip content="Completed today's contract" placement="below">
                  <Icon name="star" size={11} className="gold-glyph" />
                </Tooltip>
              ) : null}
              {r.name}
            </span>
            <span className="board-gold">
              <b><CountUp value={r.gold} /></b>
              {r.gainThisEpoch !== 0 && (
                <small className={r.gainThisEpoch > 0 ? "green" : "red"}>
                  {r.gainThisEpoch > 0 ? "+" : ""}{r.gainThisEpoch}
                </small>
              )}
            </span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
