"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { State } from "@/lib/types";
import { GOODS, GOOD_ICON, TOWNS, TOWN_LABEL } from "@/lib/types";
import { act, clearSession, loadSession, signup, type Session } from "@/lib/near";
import { GameMap } from "@/components/GameMap";
import { Actions } from "@/components/Actions";
import { Report } from "@/components/Report";
import { Simulate } from "@/components/Simulate";
import { AttestationBadge } from "@/components/Badge";

type Tab = "play" | "report" | "sim";

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [s, setS] = useState<State | null>(null);
  const [tab, setTab] = useState<Tab>("play");
  const [name, setName] = useState("");
  const [joining, setJoining] = useState("");
  const [toast, setToast] = useState<{ msg: string; ok: boolean; tx?: string } | null>(null);
  const [now, setNow] = useState(Date.now());
  const arriving = useRef(false);

  useEffect(() => {
    setSession(loadSession());
    const u = new URLSearchParams(location.search).get("tab");
    if (u === "report" || u === "sim") setTab(u);
  }, []);
  const refresh = useCallback(async () => {
    const q = session ? `?account=${session.accountId}` : "";
    const r = await fetch(`/api/state${q}`).then((x) => x.json()).catch(() => null);
    if (r?.economy) setS(r);
  }, [session]);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 2500);
    const n = setInterval(() => setNow(Date.now()), 250);
    return () => (clearInterval(t), clearInterval(n));
  }, [refresh]);

  // auto-arrive: resolve our haul as soon as the convoy reaches the destination
  useEffect(() => {
    const h = s?.me?.player?.haul;
    if (!session || !h || arriving.current || (s?.economy.tick ?? 0) < h.arrive_tick) return;
    arriving.current = true;
    act(session, "arrive", {}).then((r) => {
      const v = r.value;
      if (v?.ambushed) setToast({ msg: `☠ AMBUSHED! ${v.burned} burned, ${v.looted} looted${v.raider ? ` by ${String(v.raider).split(".")[0]}` : " by pirates"} — ${v.delivered} delivered`, ok: false, tx: r.txHash });
      else if (r.ok) setToast({ msg: `Arrived in ${TOWN_LABEL[v?.town] ?? "town"} with ${v?.delivered ?? ""} cargo`, ok: true, tx: r.txHash });
      refresh();
    }).finally(() => setTimeout(() => (arriving.current = false), 3000));
  }, [s, session, refresh]);

  async function join() {
    setJoining("Creating your account…");
    try {
      const sess = await signup(name);
      setJoining("Registering (gasless meta-tx)…");
      const r = await act(sess, "register", { town: "mina" }, "joined Lowsec");
      if (!r.ok && !/already registered/.test(r.error ?? "")) throw new Error(r.error);
      setSession(sess);
      setToast({ msg: `Welcome ${sess.accountId} — no wallet, no gas`, ok: true, tx: r.txHash });
    } catch (e: any) {
      setToast({ msg: String(e?.message ?? e), ok: false });
    } finally {
      setJoining("");
    }
  }

  const explorer = s?.explorer ?? "https://testnet.nearblocks.io";
  const onResult = (msg: string, ok: boolean, tx?: string) => (setToast({ msg, ok, tx }), refresh());

  return (
    <main>
      <header>
        <div className="brand">LOW<span>SEC</span></div>
        <nav>
          {(["play", "report", "sim"] as Tab[]).map((t) => (
            <button key={t} className={tab === t ? "tab sel" : "tab"} onClick={() => setTab(t)}>{{ play: "Play", report: "Economic Report", sim: "Fast-forward" }[t]}</button>
          ))}
        </nav>
        <div className="hdr-right">
          {s && <span className={s.ai.mode === "tee" ? "badge tee" : "badge mock"} title={s.ai.model}>{s.ai.mode === "tee" ? `NPC brains: NEAR AI TEE (${s.ai.model})` : "NPC brains: MOCK (no NEAR AI key)"}</span>}
          {session && s?.me && (
            <span className="me">
              <a href={`${explorer}/address/${session.accountId}`} target="_blank" rel="noreferrer">{session.accountId}</a> · <b>{s.me.balances.gold ?? 0}</b> {GOOD_ICON.gold}
              <button className="link" onClick={() => (clearSession(), setSession(null))}>log out</button>
            </span>
          )}
        </div>
      </header>

      {toast && (
        <div className={toast.ok ? "toast ok" : "toast bad"} onClick={() => setToast(null)}>
          {toast.msg} {toast.tx && <a href={`${explorer}/txns/${toast.tx}`} target="_blank" rel="noreferrer">tx ↗</a>}
        </div>
      )}

      {!s && <div className="panel">Connecting to {"lowsec.testnet"}…</div>}

      {s && tab === "play" && (
        <div className="layout">
          <section className="left">
            <GameMap s={s} now={now} />
            {!session ? (
              <div className="panel login">
                <h2>Haul cargo. Dodge raiders. Don&apos;t crash the economy.</h2>
                <p className="muted">Type a name and play. No wallet, no seed phrase, no gas — your account <code>name.{s.contract}</code> is created for you and every move is a gasless meta-transaction.</p>
                <div className="row-btns">
                  <input placeholder="your name" value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))} onKeyDown={(e) => e.key === "Enter" && name && join()} />
                  <button className="primary" disabled={!name || !!joining} onClick={join}>{joining || "Play"}</button>
                </div>
              </div>
            ) : s.me?.player ? (
              <Actions s={s} session={session} onResult={onResult} />
            ) : (
              <div className="panel">Registering… <button onClick={() => act(session, "register", { town: "mina" }).then(() => refresh())}>retry</button></div>
            )}
          </section>
          <aside className="right">
            {s.me?.player && (
              <div className="panel">
                <h3>Your hold</h3>
                <div className="hold">{["gold", ...GOODS].map((g) => <span key={g}>{GOOD_ICON[g]} {g} <b>{s.me!.balances[g] ?? 0}</b></span>)}</div>
                <div className="muted small">in {TOWN_LABEL[TOWNS[s.me.player.town]]} · {s.me.player.hauls} hauls · ambushed {s.me.player.ambushed}× · raids won {s.me.player.raids_won}</div>
                <div className="muted small">NEP-245 tokens on <a href={`${explorer}/address/${s.contract}`} target="_blank" rel="noreferrer">{s.contract}</a></div>
              </div>
            )}
            <div className="panel">
              <h3>AI haulers <span className="muted small">(hover them on the map)</span></h3>
              {s.npcs.map((n) => {
                const d = n.decisions[0];
                return (
                  <div key={n.id} className="npc">
                    <div><b>{n.name}</b> <a className="muted small" href={`${explorer}/address/${n.id}`} target="_blank" rel="noreferrer">{n.id}</a> · {n.balances.gold}{GOOD_ICON.gold}</div>
                    {d ? (
                      <>
                        <div className="tt-action">→ {d.summary}</div>
                        <div className="tt-reason">“{d.reasoning}”</div>
                        <div className="tt-foot">
                          <AttestationBadge d={d} />
                          {d.decisionTx && <a className="small" href={`${explorer}/txns/${d.decisionTx}`} target="_blank" rel="noreferrer">on-chain decision #{d.decisionId} ↗</a>}
                        </div>
                      </>
                    ) : <div className="muted small">waiting for its next decision…</div>}
                  </div>
                );
              })}
            </div>
            <div className="panel feed">
              <h3>Activity</h3>
              <ul>
                {s.feed.slice(0, 16).map((f) => (
                  <li key={f.ts + f.text} className={f.type === "ambush" ? "ambush" : f.type === "council" ? "council" : f.ok === false ? "fail" : ""}>
                    <span className="muted small">{new Date(f.ts).toLocaleTimeString()}</span> {f.text} {f.txHash && <a href={`${explorer}/txns/${f.txHash}`} target="_blank" rel="noreferrer">↗</a>}
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      )}
      {s && tab === "report" && <Report />}
      {s && tab === "sim" && <Simulate />}
      <footer className="muted small">
        Lowsec · gold &amp; cargo are NEP-245 on <a href={`${explorer}/address/${s?.contract ?? "lowsec.testnet"}`} target="_blank" rel="noreferrer">{s?.contract ?? "lowsec.testnet"}</a> (testnet) · tick {s?.economy.tick} · epoch {s?.economy.epoch}
      </footer>
    </main>
  );
}
