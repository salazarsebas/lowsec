"use client";
import { useEffect, useState } from "react";
import "../styles/hud.css";
import { act, clearSession } from "@/lib/near";
import { useGame } from "@/lib/useGame";
import { GameMap } from "@/components/GameMap";
import { IntelRail } from "@/components/Intel";
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

  // keep the map's towns clear of the HUD: measure the dock / intel rail / landing and pass px insets
  const [insets, setInsets] = useState({ top: 8, right: 0, bottom: 0, left: 0 });
  useEffect(() => {
    if (!play || !s) return;
    const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;
    const measure = () => {
      const W = innerWidth, H = innerHeight;
      const dock = q(".dock"), intel = q(".intel"), land = q(".landing");
      const n = {
        top: 8,
        right: intel ? Math.ceil(W - intel.getBoundingClientRect().left) + 8 : 24,
        bottom: dock ? Math.ceil(H - dock.getBoundingClientRect().top) + 8 : 24,
        left: land ? Math.ceil(land.getBoundingClientRect().right * 0.9) : 24,
      };
      document.documentElement.style.setProperty("--dock-h", `${n.bottom}px`);
      setInsets((o) => (o.top === n.top && o.right === n.right && o.bottom === n.bottom && o.left === n.left ? o : n));
    };
    measure();
    const ro = new ResizeObserver(measure);
    [".dock", ".intel", ".landing"].forEach((sel) => { const el = q(sel); if (el) ro.observe(el); });
    addEventListener("resize", measure);
    return () => (ro.disconnect(), removeEventListener("resize", measure));
  }, [play, joined, !!s, !!session, step]);

  return (
    <main className={play ? `game play${session ? " in" : " out"}${joined ? " joined" : ""}` : "game page"}>
      <HudTop s={s} session={session} tab={tab} setTab={g.setTab} ledger={ledger} toggleLedger={() => setLedger((x) => !x)} logout={() => (clearSession(), g.setSession(null))} />
      <Toasts toasts={g.toasts} dismiss={g.dismiss} explorer={explorer} />

      {!s && <div className="boot"><div className="boot-brand">LOW<span>SEC</span></div><div className="ui-label">Connecting to lowsec.testnet…</div><div className="boot-bar"><i /></div></div>}

      {s && play && (
        <>
          <div className="stage map-holder">
            <GameMap s={s} now={g.now} blasts={g.blasts} shake={g.shake} fullBleed insets={insets} burnCounter={session ? "top-left" : "bottom-right"} legend={!session || !joined ? false : true} />
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
            /* Intel rail slot (WP3) */
            <div id="intel" className="intel"><IntelRail s={s} accountId={session.accountId} explorer={explorer} /></div>
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
