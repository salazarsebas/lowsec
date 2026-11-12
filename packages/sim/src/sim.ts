/**
 * Deterministic headless simulation of the Lowsec economy.
 * Same seed + params => identical output. Used by the CLI (`pnpm sim --weeks 4`),
 * the server's "fast-forward" button and tests.
 */
import { DEFAULT_PARAMS, DEFAULT_POPULATION, GOODS, HOME_GOOD, TOWNS, type Good, type Params, type Population, type Route, type Town } from "./params.js";
import { Rng } from "./rng.js";
import { goalStock, revertStock, ambushChanceBps, ambushSplit, askPrice, bidPrice, buyCost, raidFee, sellPayout } from "./pricing.js";
import { councilStep, inflationBps, perCapitaInflationBps, type CouncilDecision } from "./council.js";
import { emptyPeriod, gini, type PeriodMetrics } from "./metrics.js";

export type AgentKind = "safe" | "risky" | "raider" | "ai_hauler";

export interface Haul {
  from: Town;
  to: Town;
  route: Route;
  good: Good;
  qty: number;
  arriveTick: number;
}

export interface Agent {
  id: string;
  kind: AgentKind;
  gold: number;
  town: Town;
  inventory: Record<Good, number>;
  haul: Haul | null;
  busyUntil: number;
}

export interface Raid {
  raider: string;
  lane: number;
  stake: number;
  expiresTick: number;
}

export interface SimEvent {
  tick: number;
  type: "haul" | "arrive" | "ambush" | "raid" | "council";
  text: string;
}

export interface SimOptions {
  weeks: number;
  seed: number;
  council: boolean;
  params?: Partial<Params>;
  population?: Partial<Population>;
  keepEvents?: number; // keep last N events
}

export interface SimResult {
  options: SimOptions;
  weekly: PeriodMetrics[];
  daily: PeriodMetrics[];
  council: CouncilDecision[];
  events: SimEvent[];
  final: { supply: number; faucetBps: number; players: number; gini: number };
}

/** Lane index for an unordered town pair: 0 mina-forja, 1 forja-puerto, 2 mina-puerto. */
export function laneIndex(a: Town, b: Town): number {
  const k = [a, b].sort().join("-");
  return { "forja-mina": 0, "forja-puerto": 1, "mina-puerto": 2 }[k] ?? -1;
}

export class World {
  p: Params;
  pop: Population;
  rng: Rng;
  tick = 0;
  stock: Record<Town, Record<Good, number>>;
  agents: Agent[] = [];
  raids: Raid[] = [];
  faucetBps: number;
  councilOn: boolean;
  day: PeriodMetrics;
  week: PeriodMetrics;
  daily: PeriodMetrics[] = [];
  weekly: PeriodMetrics[] = [];
  decisions: CouncilDecision[] = [];
  events: SimEvent[] = [];
  keepEvents: number;
  /** Lowsec hauls per lane during the current day (public info, reset daily, decays). */
  laneTraffic = [0, 0, 0];
  /** smoothed inflation signal the Council reacts to */
  signalBps = 0;
  private nextId = 0;
  private playersJoinedToday = 0;

  constructor(opts: SimOptions) {
    this.p = { ...DEFAULT_PARAMS, ...(opts.params ?? {}) };
    this.pop = { ...DEFAULT_POPULATION, ...(opts.population ?? {}) };
    this.rng = new Rng(opts.seed);
    this.councilOn = opts.council;
    this.keepEvents = opts.keepEvents ?? 200;
    this.faucetBps = this.p.faucetBps;
    this.stock = {} as Record<Town, Record<Good, number>>;
    for (const t of TOWNS) {
      this.stock[t] = {} as Record<Good, number>;
      for (const g of GOODS) this.stock[t][g] = goalStock(this.p, g === HOME_GOOD[t]);
    }
    this.day = emptyPeriod(0, 0, 0, this.faucetBps);
    this.week = emptyPeriod(0, 0, 0, this.faucetBps);
    for (let i = 0; i < this.pop.aiHaulers; i++) this.join("ai_hauler");
    for (let i = 0; i < this.pop.initialPlayers; i++) this.join(this.pickKind());
    // Opening grants are genesis supply, not inflation: start the books after them.
    const genesis = this.supply();
    this.day = emptyPeriod(0, genesis, this.agents.length, this.faucetBps);
    this.week = emptyPeriod(0, genesis, this.agents.length, this.faucetBps);
  }

  supply(): number {
    return this.agents.reduce((a, x) => a + x.gold, 0) + this.raids.reduce((a, r) => a + r.stake, 0);
  }

  private log(type: SimEvent["type"], text: string) {
    this.events.push({ tick: this.tick, type, text });
    if (this.events.length > this.keepEvents) this.events.shift();
  }

  private pickKind(): AgentKind {
    const r = this.rng.int(10_000);
    const m = this.pop.mixBps;
    if (r < m.safe) return "safe";
    if (r < m.safe + m.risky) return "risky";
    return "raider";
  }

  private join(kind: AgentKind) {
    const id = kind === "ai_hauler" ? `hauler-${this.agents.filter((a) => a.kind === "ai_hauler").length + 1}` : `p${this.nextId++}`;
    const town = TOWNS[this.rng.int(TOWNS.length)];
    const grant = this.p.councilScalesGrant ? Math.floor((this.p.newPlayerGrant * this.faucetBps) / 10_000) : this.p.newPlayerGrant;
    this.agents.push({ id, kind, gold: grant, town, inventory: { ore: 0, parts: 0, fuel: 0 }, haul: null, busyUntil: 0 });
    this.mint("new_player_grant", grant);
  }

  private mint(src: "npc_buy_orders" | "new_player_grant", amt: number) {
    this.day.minted[src] += amt;
    this.week.minted[src] += amt;
  }
  private burn(src: "npc_sell_orders" | "tolls" | "raid_fees", amt: number) {
    this.day.burned[src] += amt;
    this.week.burned[src] += amt;
  }
  private count(k: "hauls" | "lowsecHauls" | "ambushes" | "raids" | "cargoBurnedUnits" | "cargoBurnedGoldValue", n = 1) {
    this.day[k] += n;
    this.week[k] += n;
  }

  inTransit(to: Town, g: Good): number {
    let q = 0;
    for (const a of this.agents) if (a.haul && a.haul.to === to && a.haul.good === g) q += a.haul.qty;
    return q;
  }

  activeRaids(lane: number): Raid[] {
    return this.raids.filter((r) => r.lane === lane && r.expiresTick > this.tick);
  }

  /** Sell everything carried at the current town. */
  private sellAll(a: Agent) {
    for (const g of GOODS) {
      const q = a.inventory[g];
      if (q <= 0) continue;
      const pay = sellPayout(this.p, g, this.stock[a.town][g], q, this.faucetBps);
      a.inventory[g] = 0;
      a.gold += pay;
      this.stock[a.town][g] = Math.min(this.stock[a.town][g] + q, this.p.targetStock * this.p.maxStockFactor);
      this.mint("npc_buy_orders", pay);
    }
  }

  /** Expected profit per tick of a trade option, used by every trader (risk attitude varies). */
  private bestTrade(a: Agent): { good: Good; to: Town; route: Route; qty: number; ev: number } | null {
    let best: { good: Good; to: Town; route: Route; qty: number; ev: number } | null = null;
    const budget = Math.floor(a.gold * 0.8);
    for (const g of GOODS) {
      const s = this.stock[a.town][g];
      const ask = askPrice(this.p, g, s);
      let qty = Math.min(this.p.cargoCap, Math.floor(budget / Math.max(ask, 1)), Math.max(s - 1, 0));
      while (qty > 0 && buyCost(this.p, g, s, qty) > budget) qty--;
      if (qty <= 0) continue;
      const cost = buyCost(this.p, g, s, qty);
      for (const to of TOWNS) {
        if (to === a.town) continue;
        // traders see cargo already en route to `to` (public haul log) and price it in
        const revenue = sellPayout(this.p, g, this.stock[to][g] + this.inTransit(to, g), qty, this.faucetBps);
        for (const route of ["safe", "lowsec"] as Route[]) {
          if (a.kind === "safe" && route === "lowsec") continue;
          const lane = laneIndex(a.town, to);
          const pAmb = ambushChanceBps(this.p, route, this.activeRaids(lane).length) / 10_000;
          const lossShare = this.p.ambushLossBps / 10_000;
          const risk = a.kind === "risky" ? 0.7 : a.kind === "ai_hauler" ? 1.0 : 1.3; // risk weight
          const ev = revenue * (1 - pAmb * lossShare * risk) - cost - this.p.tollGold[route];
          const perTick = ev / this.p.travelTicks[route];
          if (ev > 0 && (!best || perTick > best.ev)) best = { good: g, to, route, qty, ev: perTick };
        }
      }
    }
    return best;
  }

  private act(a: Agent) {
    this.sellAll(a);
    // Raiders stake on the busiest Lowsec lane when they can afford it.
    // Raiders camp the busiest Lowsec lane (public haul log) if it is not already camped.
    if (a.kind === "raider" && a.gold >= this.p.raidMinStake * 2 && !this.raids.some((r) => r.raider === a.id)) {
      const traffic = [0, 1, 2].map((l) => this.laneTraffic[l]);
      const lane = traffic.indexOf(Math.max(...traffic));
      if (traffic[lane] >= 3 && this.activeRaids(lane).length < 2 && this.rng.chanceBps(5_000)) {
        const stake = this.p.raidMinStake;
        const fee = raidFee(this.p, stake);
        a.gold -= stake + fee;
        this.burn("raid_fees", fee);
        this.raids.push({ raider: a.id, lane, stake, expiresTick: this.tick + this.p.raidTtlTicks });
        this.count("raids");
        this.log("raid", `${a.id} staked ${stake} gold to raid lowsec lane ${lane}`);
        a.busyUntil = this.tick + 2;
        return;
      }
    }
    const t = this.bestTrade(a);
    if (!t) {
      // nothing profitable here: occasionally relocate empty via the safe lane
      if (a.gold > this.p.tollGold.safe && this.rng.chanceBps(this.p.relocateBps)) {
        const to = TOWNS.filter((x) => x !== a.town)[this.rng.int(2)];
        a.gold -= this.p.tollGold.safe;
        this.burn("tolls", this.p.tollGold.safe);
        a.haul = { from: a.town, to, route: "safe", good: "ore", qty: 0, arriveTick: this.tick + this.p.travelTicks.safe };
        a.busyUntil = a.haul.arriveTick;
      }
      return;
    }
    const s = this.stock[a.town][t.good];
    const cost = buyCost(this.p, t.good, s, t.qty);
    a.gold -= cost + this.p.tollGold[t.route];
    this.burn("npc_sell_orders", cost);
    this.burn("tolls", this.p.tollGold[t.route]);
    this.stock[a.town][t.good] = s - t.qty;
    a.haul = { from: a.town, to: t.to, route: t.route, good: t.good, qty: t.qty, arriveTick: this.tick + this.p.travelTicks[t.route] };
    a.busyUntil = a.haul.arriveTick;
    this.count("hauls");
    if (t.route === "lowsec") {
      this.count("lowsecHauls");
      this.laneTraffic[laneIndex(a.town, t.to)]++;
    }
    if (a.kind === "ai_hauler") this.log("haul", `${a.id} hauls ${t.qty} ${t.good} ${a.town}→${t.to} via ${t.route}`);
  }

  private arrive(a: Agent) {
    const h = a.haul!;
    a.haul = null;
    a.town = h.to;
    if (h.qty === 0) return;
    if (h.route === "lowsec") {
      const lane = laneIndex(h.from, h.to);
      const raids = this.activeRaids(lane);
      if (this.rng.chanceBps(ambushChanceBps(this.p, "lowsec", raids.length))) {
        const raid = raids.find((r) => r.raider !== a.id) ?? null;
        const split = ambushSplit(this.p, h.qty, raid !== null);
        this.count("ambushes");
        this.count("cargoBurnedUnits", split.burned);
        this.count("cargoBurnedGoldValue", split.burned * askPrice(this.p, h.good, this.p.targetStock));
        if (raid) {
          const raider = this.agents.find((x) => x.id === raid.raider)!;
          raider.inventory[h.good] += split.looted;
          raider.gold += raid.stake; // stake returned on a successful raid
          this.raids.splice(this.raids.indexOf(raid), 1);
        }
        this.log("ambush", `${a.id} ambushed on lane ${lane}${raid ? ` by ${raid.raider}` : " by NPC pirates"}: ${split.burned} ${h.good} burned, ${split.looted} looted`);
        a.inventory[h.good] += split.kept;
        return;
      }
    }
    a.inventory[h.good] += h.qty;
  }

  private townsTick() {
    for (const t of TOWNS)
      for (const g of GOODS) {
        this.stock[t][g] = revertStock(this.p, this.stock[t][g], goalStock(this.p, g === HOME_GOOD[t]));
      }
  }

  private expireRaids() {
    for (const r of [...this.raids]) {
      if (r.expiresTick <= this.tick) {
        const raider = this.agents.find((x) => x.id === r.raider)!;
        raider.gold += r.stake;
        this.raids.splice(this.raids.indexOf(r), 1);
      }
    }
  }

  priceIndex(): number {
    let s = 0;
    let n = 0;
    for (const t of TOWNS) for (const g of GOODS) { s += askPrice(this.p, g, this.stock[t][g]) / this.p.basePrice[g]; n++; }
    return s / n;
  }

  private closePeriod(m: PeriodMetrics) {
    m.supplyEnd = this.supply();
    m.players = this.agents.length;
    m.inflationBps = inflationBps(m.supplyStart, m.supplyEnd);
    m.perCapitaInflationBps = perCapitaInflationBps(m.supplyStart, m.playersStart, m.supplyEnd, m.players);
    const minted = m.minted.npc_buy_orders + m.minted.new_player_grant;
    const burned = m.burned.npc_sell_orders + m.burned.tolls + m.burned.raid_fees;
    m.sinkFaucetRatio = minted ? burned / minted : 0;
    m.gini = gini(this.agents.map((a) => a.gold));
    m.faucetBps = this.faucetBps;
    m.priceIndex = this.priceIndex();
  }

  step() {
    // new players arrive spread over the day
    const dayNo = Math.floor(this.tick / this.p.epochTicks);
    const perDay = dayNo < this.pop.surgeDays ? this.pop.surgePerDay : this.pop.newPlayersPerDay;
    const tickInDay = this.tick % this.p.epochTicks;
    const due = Math.floor(((tickInDay + 1) * perDay) / this.p.epochTicks);
    while (this.playersJoinedToday < due) { this.join(this.pickKind()); this.playersJoinedToday++; }

    this.expireRaids();
    const order = this.rng.shuffle([...this.agents]);
    for (const a of order) if (a.haul && a.haul.arriveTick <= this.tick) this.arrive(a);
    for (const a of order) if (!a.haul && a.busyUntil <= this.tick) this.act(a);
    this.townsTick();
    this.day.ticks++;
    this.week.ticks++;
    this.tick++;

    if (this.tick % this.p.epochTicks === 0) {
      this.closePeriod(this.day);
      this.daily.push(this.day);
      // Council acts on the day that just closed (skip day 0: opening grants are not inflation).
      if (this.councilOn) {
        this.signalBps = this.day.period === 0 ? this.day.inflationBps : Math.trunc((this.day.inflationBps * this.p.councilSmoothingBps + this.signalBps * (10_000 - this.p.councilSmoothingBps)) / 10_000);
        const d = councilStep(this.p, this.day.period, this.faucetBps, this.signalBps);
        this.decisions.push(d);
        if (d.nextFaucetBps !== this.faucetBps)
          this.log("council", `Council epoch ${d.epoch}: inflation ${(d.inflationBps / 100).toFixed(2)}% vs target ${(d.targetBps / 100).toFixed(2)}% → faucets ${(d.prevFaucetBps / 100).toFixed(1)}% → ${(d.nextFaucetBps / 100).toFixed(1)}%`);
        this.faucetBps = d.nextFaucetBps;
      }
      this.playersJoinedToday = 0;
      this.laneTraffic = this.laneTraffic.map((x) => Math.floor(x / 2));
      this.day = emptyPeriod(this.day.period + 1, this.supply(), this.agents.length, this.faucetBps);
    }
    if (this.tick % this.p.ticksPerWeek === 0) {
      this.closePeriod(this.week);
      this.weekly.push(this.week);
      this.week = emptyPeriod(this.week.period + 1, this.supply(), this.agents.length, this.faucetBps);
    }
  }
}

export function runSim(opts: SimOptions): SimResult {
  const w = new World(opts);
  const total = opts.weeks * w.p.ticksPerWeek;
  for (let i = 0; i < total; i++) w.step();
  return {
    options: opts,
    weekly: w.weekly,
    daily: w.daily,
    council: w.decisions,
    events: w.events,
    final: { supply: w.supply(), faucetBps: w.faucetBps, players: w.agents.length, gini: gini(w.agents.map((a) => a.gold)) },
  };
}
