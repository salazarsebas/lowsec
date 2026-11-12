import type { Npc } from "@/lib/types";
import { AttestationBadge } from "./Badge";

/** NPC tooltip / panel body: the AI strategy (anchored on-chain) + the latest rule-based move that follows it. */
export function NpcCard({ n, explorer, compact = false }: { n: Npc; explorer: string; compact?: boolean }) {
  const d = n.decisions[0];
  const m = n.moves?.[0];
  const move = m && (
    <div className="tt-move small">
      <span className="muted">last move{n.kind === "guild" ? "" : " (rule-based, follows strategy)"}:</span> {m.text}{" "}
      {m.txHash && <a href={`${explorer}/txns/${m.txHash}`} target="_blank" rel="noreferrer">tx ↗</a>}
    </div>
  );
  if (n.kind === "guild")
    return (
      <>
        {!compact && <div className="muted small">{n.style}</div>}
        <div className="tt-foot"><span className="badge rule" title="The Guild runs a fixed public rule: restock the scarcest town over Safe lanes. No model is called.">RULE-BASED · no AI</span></div>
        {move ?? <div className="muted small">waiting for its next move…</div>}
      </>
    );
  return (
    <>
      {!compact && <div className="muted small">{n.style}</div>}
      {d ? (
        <>
          <div className="tt-action"><span className="muted small">AI strategy:</span> {d.summary}</div>
          <div className="tt-reason">“{d.reasoning}”</div>
          <div className="tt-foot">
            <AttestationBadge d={d} />
            {d.decisionTx && <a className="small" href={`${explorer}/txns/${d.decisionTx}`} target="_blank" rel="noreferrer">on-chain decision #{d.decisionId} ↗</a>}
          </div>
        </>
      ) : <div className="muted small">reviewing its strategy…</div>}
      {move}
    </>
  );
}
