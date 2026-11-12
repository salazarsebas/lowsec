"use client";
import { useEffect, useState } from "react";

/** NEAR Intents 1Click: a REAL quote with dry:true. Nothing is executed (Lowsec runs on testnet). */
export function Deposit() {
  const [origins, setOrigins] = useState<{ id: string; label: string }[]>([]);
  const [origin, setOrigin] = useState("usdc-base");
  const [amount, setAmount] = useState("10");
  const [q, setQ] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch("/api/intents/origins").then((x) => x.json()).then(setOrigins).catch(() => {});
  }, []);
  async function quote() {
    setBusy(true);
    setQ(await fetch("/api/intents/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ origin, amount }) }).then((x) => x.json()).catch((e) => ({ error: String(e) })));
    setBusy(false);
  }
  return (
    <div className="panel deposit">
      <h3>Deposit from any chain <span className="badge mock">QUOTE ONLY</span></h3>
      <div className="row-btns">
        <input className="amt" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} />
        <select value={origin} onChange={(e) => setOrigin(e.target.value)}>{origins.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
        <button disabled={busy} onClick={quote}>{busy ? "quoting…" : "Get quote"}</button>
      </div>
      {q && (q.error ? <div className="red small">{q.error}</div> : (
        <div className="small">
          {q.amountIn} {q.from} (${Number(q.amountInUsd).toFixed(2)}) → <b>{Number(q.amountOutNear).toFixed(3)} NEAR</b> on NEAR (min {q.minAmountOutNear}), ~{q.timeEstimateSec}s
        </div>
      ))}
      <div className="muted small">Real NEAR Intents 1Click API call with <code>dry: true</code> at mainnet prices: nothing is executed and no funds move. The game itself runs on testnet.</div>
    </div>
  );
}
