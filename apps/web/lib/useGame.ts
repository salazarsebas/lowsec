"use client";
/** Game session + update loop, moved out of app/page.tsx WITHOUT changing behaviour:
 *  - polls /api/state every 2.5s and runs a 250ms `now` clock for animation
 *  - auto-arrive: calls act("arrive") once the chain tick reaches our haul's arrive_tick
 *  - ambush detection: our own (from the arrive result) and other pilots' (from the feed) → explode()
 *  Additions for the HUD are purely presentational: a toast queue (auto-dismiss), a structured
 *  ambush/arrival payload for the cinematic + receipt, and a client-side cost basis (estimate) per good. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { State } from "@/lib/types";
import { GOODS, TOWN_LABEL, TOWNS } from "@/lib/types";
import { act, loadSession, signup, type Session } from "@/lib/near";
import { pointOn, type Blast } from "@/components/GameMap";
import { boom, chime } from "@/lib/sound";

export type Tab = "play" | "report" | "sim";
export interface Toast { id: number; msg: string; ok: boolean; tx?: string; kind?: "buy" | "sell" | "haul" | "raid" | "arrive" | "ambush" | "join" | "info" }
export interface AmbushInfo { who: string; good: string; burned: number; looted: number; delivered: number; qty: number; valueLost: number; tx?: string }
export interface Payoff { town: string; good: string | null; delivered: number; price: number; value: number; cost: number | null; toll: number; dockFee: number; profit: number | null; tx?: string }
export interface TxLog { ts: number; label: string; ok: boolean; tx?: string }
type CostBasis = Record<string, { qty: number; gold: number }>;

const TOAST_MS = 4500;
const BANNER_MS = 2500; // full-screen ambush alert auto-dismisses (click also dismisses)

export function useGame() {
  const [session, setSession] = useState<Session | null>(null);
  const [s, setS] = useState<State | null>(null);
  const [tab, setTab] = useState<Tab>("play");
  const [joining, setJoining] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [now, setNow] = useState(Date.now());
  const arriving = useRef(false);
  const [docking, setDocking] = useState(false);
  const [blasts, setBlasts] = useState<Blast[]>([]);
  const [shake, setShake] = useState(false);
  const [banner, setBanner] = useState<AmbushInfo | null>(null);
  const [payoff, setPayoff] = useState<Payoff | null>(null);
  const [txlog, setTxlog] = useState<TxLog[]>([]);
  const lastHaul = useRef<Record<string, any>>({});
  const seenFeed = useRef<number>(0);
  const cost = useRef<CostBasis>({});
  const bootTs = useRef<number>(Date.now());
  const handled = useRef<Set<string>>(new Set()); // own arrive/ambush txs already shown

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback((msg: string, ok: boolean, tx?: string, kind?: Toast["kind"]) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [{ id, msg, ok, tx, kind }, ...t].slice(0, 3));
    setTxlog((l) => [{ ts: Date.now(), label: msg, ok, tx }, ...l].slice(0, 40));
    setTimeout(() => dismiss(id), TOAST_MS);
  }, [dismiss]);

  // cost basis (client-side estimate, per account, survives reloads)
  const costKey = session ? `lowsec.cost.${session.accountId}` : "";
  useEffect(() => {
    if (!costKey) return;
    try { cost.current = JSON.parse(localStorage.getItem(costKey) ?? "{}"); } catch { cost.current = {}; }
  }, [costKey]);
  const saveCost = () => { try { costKey && localStorage.setItem(costKey, JSON.stringify(cost.current)); } catch {} };
  const recordBuy = useCallback((good: string, qty: number, gold: number) => {
    const c = cost.current[good] ?? { qty: 0, gold: 0 };
    cost.current[good] = { qty: c.qty + qty, gold: c.gold + gold };
    saveCost();
  }, [costKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const clearCost = useCallback((good: string) => { delete cost.current[good]; saveCost(); }, [costKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const unitCost = useCallback((good: string) => {
    const c = cost.current[good];
    return c && c.qty > 0 ? c.gold / c.qty : null;
  }, []);

  const explode = useCallback((h: any, text: string, big: boolean) => {
    const pt = h ? pointOn(h.from, h.to, h.route, 0.9) : { x: 450, y: 240 };
    const id = Date.now() + Math.random();
    setBlasts((b) => [...b, { id, x: pt.x, y: pt.y, text, big }]);
    setTimeout(() => setBlasts((b) => b.filter((x) => x.id !== id)), 2600);
    if (big) {
      setShake(true);
      setTimeout(() => setShake(false), 650);
    }
    boom();
  }, []);

  useEffect(() => {
    setSession(loadSession());
    const u = new URLSearchParams(location.search).get("tab");
    if (u === "report" || u === "sim") setTab(u);
  }, []);
  const refresh = useCallback(async () => {
    const q = session ? `?account=${session.accountId}` : "";
    const r = await fetch(`/api/state${q}`).then((x) => x.json()).catch(() => null);
    if (!r?.economy) return;
    // remember every convoy's last haul so an ambush in the feed can explode at the right spot
    r.npcs.forEach((n: any) => n.player?.haul && (lastHaul.current[n.name] = n.player.haul));
    // other pilots' ambushes from the activity feed (our own is handled by auto-arrive)
    const fresh = (r.feed as any[]).filter((f) => f.ts > seenFeed.current);
    if (seenFeed.current > 0)
      fresh.filter((f) => f.type === "ambush" && f.actor !== session?.accountId.split(".")[0]).forEach((f) => {
        const m = /(\d+)\s*\w*\s*burned/.exec(f.text);
        explode(lastHaul.current[f.actor], `${f.actor} AMBUSHED${m ? ` · ${m[1]} BURNED` : ""}`, false);
      });
    // our OWN arrival, recovered from the feed: when testnet RPC is flaky the relayer can land the arrive tx
    // but hand the client an error (e.g. a retry that panics "not travelling"), so the auto-arrive result never
    // shows. The server logs the real outcome in the feed; replay it once per tx (same banner/toast as live).
    const myName = session?.accountId.split(".")[0];
    // (only entries >5 s old and newer than this page load, so the live auto-arrive path wins when it works)
    const st = Number(r.serverTime) || Date.now();
    if (myName)
      (r.feed as any[]).filter((f) => f.actor === myName && f.ok && f.txHash && (f.type === "ambush" || f.type === "arrive") && f.ts > bootTs.current && st - f.ts > 5000 && !handled.current.has(f.txHash)).reverse().forEach((f) => {
        handled.current.add(f.txHash);
        const h = lastHaul.current.__me;
        if (f.type === "ambush") {
          const m = /(\d+) burned, (\d+) looted by (\S+)/.exec(f.text);
          const burned = m ? Number(m[1]) : 0, looted = m ? Number(m[2]) : 0, who = m ? m[3] : "pirates";
          const good = h?.good != null ? GOODS[h.good] : "cargo";
          if (h) explode(h, `−${burned} ${good.toUpperCase()} BURNED`, true);
          const qty = h?.qty ?? burned + looted;
          setBanner({ who, good, burned, looted, delivered: Math.max(0, qty - burned - looted), qty, valueLost: 0, tx: f.txHash });
          setTimeout(() => setBanner((b) => (b && b.tx === f.txHash ? null : b)), BANNER_MS);
          toast(`AMBUSHED! ${burned} burned (mt_burn), ${looted} looted by ${who} — ${Math.max(0, qty - burned - looted)} delivered`, false, f.txHash, "ambush");
        } else {
          chime();
          toast(`Arrived: ${f.text.replace(`${myName} arrived`, "").trim()}`, true, f.txHash, "arrive");
        }
      });
    if (r.feed[0]) seenFeed.current = Math.max(seenFeed.current, r.feed[0].ts);
    if (r.me?.player?.haul) lastHaul.current.__me = r.me.player.haul;
    setS(r);
  }, [session, explode, toast]);
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
    setDocking(true);
    const good = h.good != null && h.qty > 0 ? GOODS[h.good] : null;
    const price = good ? s!.economy.towns[h.to]?.bid[h.good] ?? 0 : 0;
    const uc = good ? unitCost(good) : null;
    const toll = s!.params.toll_gold[h.route] ?? 0;
    act(session, "arrive", {}).then((r) => {
      const v = r.value;
      if (r.txHash) {
        if (handled.current.has(r.txHash)) return refresh(); // already replayed from the feed
        handled.current.add(r.txHash);
      }
      if (v?.ambushed) {
        const who = v.raider ? String(v.raider).split(".")[0] : "pirates";
        explode(h, `−${v.burned} ${GOODS[h.good].toUpperCase()} BURNED`, true);
        setBanner({ who, good: GOODS[h.good], burned: Number(v.burned) || 0, looted: Number(v.looted) || 0, delivered: Number(v.delivered) || 0, qty: h.qty, valueLost: (Number(v.burned || 0) + Number(v.looted || 0)) * price, tx: r.txHash });
        setTimeout(() => setBanner((b) => (b && b.tx === r.txHash ? null : b)), BANNER_MS);
        toast(`AMBUSHED! ${v.burned} burned (mt_burn), ${v.looted} looted by ${who} — ${v.delivered} delivered`, false, r.txHash, "ambush");
      } else if (r.ok) {
        chime();
        const delivered = Number(v?.delivered ?? h.qty) || 0;
        const dockFee = Number(v?.dock_fee) || 0;
        const value = delivered * price;
        const c = uc != null ? Math.round(uc * h.qty) : null;
        setPayoff({ town: TOWN_LABEL[v?.town] ?? TOWN_LABEL[TOWNS[h.to]], good, delivered, price, value, cost: c, toll, dockFee, profit: good && c != null ? value - c - toll - dockFee : null, tx: r.txHash });
        setTimeout(() => setPayoff(null), 6500);
        toast(`Arrived in ${TOWN_LABEL[v?.town] ?? "town"} with ${v?.delivered ?? ""} cargo${Number(v?.dock_fee) > 0 ? ` · docking fee ${v.dock_fee}◎ burned` : ""}`, true, r.txHash, "arrive");
      }
      refresh();
    }).finally(() => setTimeout(() => ((arriving.current = false), setDocking(false)), 3000));
  }, [s, session, refresh, explode, toast, unitCost]);

  const join = useCallback(async (name: string) => {
    setJoining("Creating your pilot account");
    try {
      const sess = await signup(name);
      setJoining("Registering (gasless meta-tx)");
      const r = await act(sess, "register", { town: "mina" }, "joined Lowsec");
      if (!r.ok && !/already registered/.test(r.error ?? "")) throw new Error(r.error);
      setJoining("Docking at Mina");
      setSession(sess);
      toast(`Welcome ${sess.accountId.split(".")[0]} — no wallet, no gas`, true, r.txHash, "join");
    } catch (e: any) {
      toast(String(e?.message ?? e), false, undefined, "info");
    } finally {
      setJoining("");
    }
  }, [toast]);

  const onResult = useCallback((msg: string, ok: boolean, tx?: string, kind?: Toast["kind"]) => (toast(msg, ok, tx, kind), refresh()), [toast, refresh]);

  return { session, setSession, s, tab, setTab, joining, join, toasts, dismiss, onResult, now, docking, blasts, shake, banner, dismissBanner: () => setBanner(null), payoff, setPayoff, txlog, refresh, recordBuy, clearCost, unitCost };
}
export type Game = ReturnType<typeof useGame>;
