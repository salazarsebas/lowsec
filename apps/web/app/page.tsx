"use client";
import { useEffect, useState } from "react";
import "../styles/hud.css";
import { GoodIcon } from "@/ui";
import { act, clearSession } from "@/lib/near";
import { useGame } from "@/lib/useGame";
import { GameMap } from "@/components/GameMap";
import { ContractOfDay, Leaderboard } from "@/components/Goals";
import { NpcCard } from "@/components/NpcCard";
import { Deposit } from "@/components/Deposit";
import { Actions } from "@/components/Actions";
import { Onboarding, onboardingStep } from "@/components/Onboarding";
import { Landing } from "@/components/Landing";
import { AmbushOverlay, HudTop, Ledger, PayoffReceipt, Toasts } from "@/components/Hud";
import { Report } from "@/components/Report";
import { Simulate } from "@/components/Simulate";

export default function Home() {
  const g = useGame();
  const { s, session, tab } = g;
  const [ledger, setLedger] = useState(false);
  const play = tab === "play";
  const explorer = s?.explorer ?? "https://testnet.nearblocks.io";
  const joined = !!(session && s?.me?.player);
  const step = onboardingStep(s);

  // the play screen is a fixed full-viewport scene (no page scroll); other tabs scroll normally
  useEffect(() => {
    document.documentElement.classList.toggle("scene", play);
    return () => document.documentElement.classList.remove("scene");
  }, [play]);

  // publish the dock height so the map can keep its towns out from under the HUD
  useEffect(() => {
    const el = document.querySelector(".dock");
    if (!el) return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty("--dock-h", `${Math.ceil(el.getBoundingClientRect().height) + 24}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, [play, joined, !!s]);

  return (
    <main className={play ? `game play${session ? " in" : " out"}${joined ? " joined" : ""}` : "game page"}>
      <HudTop s={s} session={session} tab={tab} setTab={g.setTab} ledger={ledger} toggleLedger={() => setLedger((x) => !x)} logout={() => (clearSession(), g.setSession(null))} />
      <Toasts toasts={g.toasts} dismiss={g.dismiss} explorer={explorer} />

      {!s && <div className="boot"><div className="boot-brand">LOW<span>SEC</span></div><div className="ui-label">Connecting to lowsec.testnet…</div><div className="boot-bar"><i /></div></div>}

      {s && play && (
        <>
          <div className="stage map-holder">
            <div className="stage-sky" aria-hidden />
            <GameMap s={s} now={g.now} blasts={g.blasts} shake={g.shake} />
          </div>
          {g.banner && <AmbushOverlay a={g.banner} />}
          {g.payoff && <PayoffReceipt p={g.payoff} />}

          {!session ? (
            <Landing s={s} joining={g.joining} join={g.join} />
          ) : s.me?.player ? (
            <div className={step !== null && step < 3 ? "dock onboarding-on" : "dock"}>
              <Onboarding s={s} />
              <Actions s={s} session={session} onResult={g.onResult} step={step} now={g.now} docking={g.docking} recordBuy={g.recordBuy} clearCost={g.clearCost} unitCost={g.unitCost} />
            </div>
          ) : (
            <div className="dock"><div className="panel registering">Registering… <button onClick={() => act(session, "register", { town: "mina" }).then(() => g.refresh())}>retry</button></div></div>
          )}

          {session && (
            /* Intel rail slot (WP3 restyles these components; rendered unchanged here) */
            <aside id="intel" className="intel">
              <ContractOfDay account={session?.accountId} />
              <Leaderboard me={session?.accountId} />
              <div className="panel">
                <h3>NPC traders <span className="muted small">(4 AI + the Guild · hover them on the map)</span></h3>
                {s.npcs.map((n) => (
                  <div key={n.id} className="npc">
                    <div><b>{n.name}</b> <a className="muted small" href={`${explorer}/address/${n.id}`} target="_blank" rel="noreferrer">{n.id}</a> · {n.balances.gold} <GoodIcon good="gold" size={12} className="gold-glyph" /></div>
                    <NpcCard n={n} explorer={explorer} compact />
                  </div>
                ))}
              </div>
              <Deposit />
              <div className="panel feed">
                <h3>Activity</h3>
                <ul>
                  {s.feed.slice(0, 16).map((f) => (
                    <li key={f.ts + f.text} className={f.type === "ambush" ? "ambush" : f.type === "council" ? "council" : f.type === "contract" ? "contract" : f.ok === false ? "fail" : ""}>
                      <span className="muted small">{new Date(f.ts).toLocaleTimeString()}</span> {f.text} {f.txHash && <a href={`${explorer}/txns/${f.txHash}`} target="_blank" rel="noreferrer">↗</a>}
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          )}
        </>
      )}
      {s && ledger && <Ledger s={s} session={session} txlog={g.txlog} onClose={() => setLedger(false)} />}

      {s && tab === "report" && <div className="page-body"><Report /></div>}
      {s && tab === "sim" && <div className="page-body"><Simulate /></div>}
      {!play && (
        <footer className="muted small">
          Lowsec · gold &amp; cargo are NEP-245 on <a href={`${explorer}/address/${s?.contract ?? "lowsec.testnet"}`} target="_blank" rel="noreferrer">{s?.contract ?? "lowsec.testnet"}</a> (testnet) · tick {s?.economy.tick} · epoch {s?.economy.epoch}
        </footer>
      )}
    </main>
  );
}
