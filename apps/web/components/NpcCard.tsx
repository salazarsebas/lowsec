"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Npc } from "@/lib/types";
import { NPC_COLORS } from "@/lib/types";
import { CountUp, Icon, Tooltip } from "@/ui";
import { AttestationBadge } from "./Badge";

/** Stable accent so a compact card matches the map chevron even without an index. */
export function npcAccent(n: { id: string; name: string; kind?: string }, index?: number) {
  if (typeof index === "number") return NPC_COLORS[index % NPC_COLORS.length];
  const known = ["Kestrel", "Vex", "Moss", "Ryo", "The Guild"];
  const i = known.findIndex((x) => n.name === x || n.name.startsWith(x));
  if (i >= 0) return NPC_COLORS[i];
  if (n.kind === "guild") return NPC_COLORS[4];
  let h = 0;
  for (const c of n.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return NPC_COLORS[h % 4];
}

function strategyTag(summary?: string) {
  if (!summary) return "";
  const i = summary.indexOf(":");
  return (i > 0 ? summary.slice(0, i) : summary).trim();
}

function useGoldDelta(gold: number) {
  const prev = useRef(gold);
  const [delta, setDelta] = useState(0);
  useEffect(() => {
    const d = gold - prev.current;
    if (d !== 0) setDelta(d);
    prev.current = gold;
  }, [gold]);
  return delta;
}

function QuoteFlyout({ text, rect }: { text: string; rect: DOMRect }) {
  return createPortal(
    <div
      className="npc-quote-fly"
      style={{ top: Math.max(8, rect.top), right: Math.max(8, window.innerWidth - rect.left + 8) }}
      role="tooltip"
    >
      “{text}”
    </div>,
    document.body,
  );
}

function LastMove({ n, explorer }: { n: Npc; explorer: string }) {
  const m = n.moves?.[0];
  if (!m) return <div className="muted small">waiting for its next move…</div>;
  return (
    <div className="tt-move small">
      <span className="muted">last move{n.kind === "guild" ? "" : " (rule-based, follows strategy)"}:</span> {m.text}{" "}
      {m.txHash && (
        <a href={`${explorer}/txns/${m.txHash}`} target="_blank" rel="noreferrer">
          tx ↗
        </a>
      )}
    </div>
  );
}

function Details({ n, explorer }: { n: Npc; explorer: string }) {
  const d = n.decisions[0];
  return (
    <div className="npc-details">
      {n.style && <div className="muted small npc-style">{n.style}</div>}
      {n.kind !== "guild" && d?.reasoning && <div className="tt-reason">“{d.reasoning}”</div>}
      <div className="npc-links">
        <a className="muted small" href={`${explorer}/address/${n.id}`} target="_blank" rel="noreferrer">
          {n.id} <Icon name="tx" size={10} />
        </a>
        {d?.decisionTx && (
          <a className="small" href={`${explorer}/txns/${d.decisionTx}`} target="_blank" rel="noreferrer">
            on-chain decision #{d.decisionId} ↗
          </a>
        )}
      </div>
      <LastMove n={n} explorer={explorer} />
    </div>
  );
}

/** NPC tooltip / panel body: the AI strategy (anchored on-chain) + the latest rule-based move that follows it. */
export function NpcCard({ n, explorer, compact = false, accent }: { n: Npc; explorer: string; compact?: boolean; accent?: string }) {
  const d = n.decisions[0];
  const color = accent ?? npcAccent(n);
  const gold = n.balances.gold ?? 0;
  const delta = useGoldDelta(gold);
  const [open, setOpen] = useState(false);
  const [fly, setFly] = useState<DOMRect | null>(null);
  const rowRef = useRef<HTMLButtonElement>(null);
  const tag = n.kind === "guild" ? "MARKET MAKER" : strategyTag(d?.summary);
  const quote = n.kind !== "guild" ? d?.reasoning : undefined;
  const badge =
    n.kind === "guild" ? (
      <span className="badge rule" title="The Guild runs a fixed public rule: restock the scarcest town over Safe lanes. No model is called.">
        RULE-BASED · no AI
      </span>
    ) : d ? (
      <AttestationBadge d={d} />
    ) : null;

  if (!compact) {
    return (
      <div className="npc-tt">
        {tag && (
          <Tooltip title={n.style} content={d?.summary ?? n.style} placement="below">
            <span className="npc-tag">{tag}</span>
          </Tooltip>
        )}
        {n.kind === "guild" ? (
          <div className="tt-foot">{badge}</div>
        ) : d ? (
          <>
            <div className="tt-action">
              <span className="muted small">AI strategy:</span> {d.summary}
            </div>
            <div className="tt-reason">“{d.reasoning}”</div>
            <div className="tt-foot">
              {badge}
              {d.decisionTx && (
                <a className="small" href={`${explorer}/txns/${d.decisionTx}`} target="_blank" rel="noreferrer">
                  on-chain decision #{d.decisionId} ↗
                </a>
              )}
            </div>
          </>
        ) : (
          <div className="muted small">reviewing its strategy…</div>
        )}
        <LastMove n={n} explorer={explorer} />
      </div>
    );
  }

  const showFly = !open && fly && quote;

  return (
    <>
      <button
        type="button"
        ref={rowRef}
        className={open ? "npc-row open" : "npc-row"}
        style={{ ["--npc" as string]: color }}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setFly(rowRef.current?.getBoundingClientRect() ?? null)}
        onMouseLeave={() => setFly(null)}
      >
        <span className="npc-portrait" aria-hidden>
          {n.name.slice(0, 1)}
        </span>
        <span className="npc-meta">
          <b className="npc-name">{n.name}</b>
          <span className="npc-sub">
            {tag && <span className="npc-tag">{tag}</span>}
            {badge}
            {!d && n.kind !== "guild" && <span className="muted small">reviewing its strategy…</span>}
          </span>
        </span>
        <span className="npc-gold">
          <CountUp value={gold} className="gold" />
          {delta !== 0 && (
            <span className={delta > 0 ? "ui-delta up" : "ui-delta down"}>
              {delta > 0 ? "+" : ""}
              {delta}
            </span>
          )}
        </span>
        <Icon name="next" size={11} className="npc-chevron" />
      </button>
      {showFly && <QuoteFlyout text={quote} rect={fly} />}
      {open && <Details n={n} explorer={explorer} />}
    </>
  );
}
