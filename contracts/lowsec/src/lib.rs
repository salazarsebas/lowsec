//! Lowsec — a mini EVE Frontier on NEAR.
//!
//! Haul cargo between 3 towns. The Lowsec lane is fast but players and AI haulers can stake
//! gold to raid it; destroyed cargo is BURNED (the economy's main item sink). An AI Economic
//! Council adjusts every gold faucet by one public rule, bounded on-chain to ±10% per epoch.
//! Gold and cargo are NEP-245 tokens in this single contract. Every NPC decision can be
//! anchored on-chain as a hash of its NEAR AI Cloud TEE attestation.
//!
//! Gameplay methods attach no deposit, so they can be called with function-call access keys
//! (sub-accounts with allowance) and relayed as NEP-366 meta-transactions.
use near_sdk::serde_json::json;
use near_sdk::store::{LookupMap, LookupSet, Vector};
use near_sdk::{env, near, require, AccountId, Allowance, NearToken, PanicOnDefault, Promise, PublicKey};
use std::collections::BTreeMap;

pub mod events;
pub mod mt;
pub mod rules;

use rules::*;

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Haul {
    pub id: u64,
    pub from: u8,
    pub to: u8,
    pub route: u8,
    pub good: u8,
    pub qty: u64,
    pub depart_tick: u64,
    pub arrive_tick: u64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Player {
    pub town: u8,
    pub haul: Option<Haul>,
    pub joined_tick: u64,
    pub hauls: u64,
    pub ambushed: u64,
    pub raids_won: u64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Raid {
    pub raider: AccountId,
    pub lane: u8,
    pub stake: u128,
    pub expires_tick: u64,
}

/// Cumulative and per-epoch ledger, EVE "Monthly Economic Report" style.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, Default)]
pub struct Ledger {
    pub minted_npc_buy_orders: u128,
    pub minted_starter_grants: u128,
    pub burned_npc_sell_orders: u128,
    pub burned_tolls: u128,
    pub burned_raid_fees: u128,
    pub cargo_burned_units: u64,
    pub hauls: u64,
    pub lowsec_hauls: u64,
    pub ambushes: u64,
    pub raids: u64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct EpochRecord {
    pub epoch: u64,
    pub supply_start: u128,
    pub supply_end: u128,
    pub players_start: u64,
    pub players_end: u64,
    pub inflation_bps: i64,
    pub faucet_bps: u64,
    pub ledger: Ledger,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Decision {
    pub id: u64,
    pub agent: AccountId,
    /// e.g. "haul", "raid", "council"
    pub kind: String,
    /// sha256 (hex) of the decision payload (prompt + response + chosen action)
    pub payload_hash: String,
    /// sha256 (hex) of the NEAR AI Cloud signature + attestation report bundle
    pub attestation_hash: String,
    pub model: String,
    /// "provider_tee" when the response signature is bound to a TEE model, "mock" in mock mode
    pub signature_kind: String,
    pub block_height: u64,
    pub timestamp_ms: u64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Lowsec {
    pub owner: AccountId,
    pub council: AccountId,
    pub params: Params,
    pub genesis_ms: u64,
    // NEP-245
    balances: LookupMap<String, u128>,
    supply: BTreeMap<String, u128>,
    // game
    players: LookupMap<AccountId, Player>,
    pub player_count: u64,
    /// stock[town][good]
    pub stock: [[i64; 3]; 3],
    pub stock_tick: u64,
    raids: Vec<Raid>,
    next_haul_id: u64,
    agents: LookupSet<AccountId>,
    // economy accounting
    pub total: Ledger,
    pub epoch: u64,
    epoch_supply_start: u128,
    epoch_players_start: u64,
    epoch_ledger: Ledger,
    epochs: Vector<EpochRecord>,
    last_council_epoch: Option<u64>,
    decisions: Vector<Decision>,
}

#[near(serializers = [json])]
pub struct TownView {
    pub town: String,
    pub stock: [i64; 3],
    pub ask: [u128; 3],
    pub bid: [u128; 3],
}

#[near(serializers = [json])]
pub struct Economy {
    pub tick: u64,
    pub epoch: u64,
    pub gold_supply: u128,
    pub item_supply: [u128; 3],
    pub players: u64,
    pub faucet_bps: u64,
    pub council: AccountId,
    pub council_rule: String,
    pub rule_next_faucet_bps: Option<u64>,
    pub towns: Vec<TownView>,
    pub raids: Vec<Raid>,
    pub total: Ledger,
    pub current_epoch: Ledger,
    pub epoch_supply_start: u128,
    pub decisions: u64,
}

/// Methods a player's in-browser function-call key may call (all zero-deposit).
pub const PLAYER_METHODS: &str = "register,buy,sell,start_haul,arrive,raid";
/// NEAR given to a new player sub-account for its own storage (gas is paid by the relayer via NEP-366).
pub const PLAYER_FUNDING: NearToken = NearToken::from_millinear(10);

pub const COUNCIL_RULE: &str = "faucet_next = clamp(faucet × (1 − gain × (inflation − target)), ±10%/epoch, [70%, 110%])";

#[near]
impl Lowsec {
    #[init]
    pub fn new(owner: AccountId, council: AccountId, params: Option<Params>) -> Self {
        let params = params.unwrap_or_default();
        require!(params.council_max_step_bps <= 1_000, "council step must be <= 10%");
        let mut stock = [[0i64; 3]; 3];
        for (t, row) in stock.iter_mut().enumerate() {
            for (g, s) in row.iter_mut().enumerate() {
                *s = goal_stock(&params, t == g);
            }
        }
        Self {
            owner,
            council,
            params,
            genesis_ms: env::block_timestamp_ms(),
            balances: LookupMap::new(b"b"),
            supply: BTreeMap::new(),
            players: LookupMap::new(b"p"),
            player_count: 0,
            stock,
            stock_tick: 0,
            raids: vec![],
            next_haul_id: 0,
            agents: LookupSet::new(b"a"),
            total: Ledger::default(),
            epoch: 0,
            epoch_supply_start: 0,
            epoch_players_start: 0,
            epoch_ledger: Ledger::default(),
            epochs: Vector::new(b"e"),
            last_council_epoch: None,
            decisions: Vector::new(b"d"),
        }
    }

    // ---------------------------------------------------------------- onboarding

    /// Social-style login without a wallet: creates `<name>.<this contract>` holding only a
    /// function-call key (generated in the player's browser) limited to game methods.
    /// #[private]: callable only by this account itself, i.e. by the onboarding server through a
    /// function-call key on the contract account that is restricted to this one method.
    #[private]
    pub fn create_player(&mut self, name: String, public_key: PublicKey) -> Promise {
        require!(env::predecessor_account_id() == env::current_account_id(), "only the contract account");
        require!(!name.is_empty() && name.len() <= 32 && name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_'), "name: 1-32 chars [a-z0-9_-]");
        let account: AccountId = format!("{name}.{}", env::current_account_id()).parse().unwrap_or_else(|_| env::panic_str("invalid name"));
        events::game("player_account_created", json!({ "account_id": account }));
        Promise::new(account)
            .create_account()
            .transfer(PLAYER_FUNDING)
            .add_access_key_allowance(public_key, Allowance::limited(NearToken::from_millinear(250)).unwrap(), env::current_account_id(), PLAYER_METHODS)
    }

    // ---------------------------------------------------------------- players

    /// Join the game: receive the starter grant (scaled by the Council's faucet multiplier).
    pub fn register(&mut self, town: Option<String>) -> Player {
        self.touch();
        let who = env::predecessor_account_id();
        require!(!self.players.contains_key(&who), "already registered");
        let town = town.map(|t| town_index(&t).unwrap_or_else(|| env::panic_str("unknown town"))).unwrap_or(0);
        let p = Player { town, haul: None, joined_tick: self.now_tick(), hauls: 0, ambushed: 0, raids_won: 0 };
        self.players.insert(who.clone(), p.clone());
        self.player_count += 1;
        let grant = self.params.new_player_grant as u128 * self.params.faucet_bps as u128 / 10_000;
        self.mint(GOLD, &who, grant, "starter_grant");
        self.total.minted_starter_grants += grant;
        self.epoch_ledger.minted_starter_grants += grant;
        events::game("player_joined", json!({ "account_id": who, "town": TOWNS[town as usize], "grant": grant.to_string() }));
        p
    }

    /// Buy cargo from the town's NPC sell orders. Gold paid is BURNED (sink).
    pub fn buy(&mut self, good: String, qty: u64) -> u128 {
        self.touch();
        let who = env::predecessor_account_id();
        let p = self.player(&who);
        require!(p.haul.is_none(), "you are travelling");
        require!(qty > 0 && qty <= self.params.cargo_cap, "qty must be 1..=cargo_cap");
        let g = good_index(&good).unwrap_or_else(|| env::panic_str("unknown good"));
        let s = self.stock[p.town as usize][g];
        require!((qty as i64) < s, "town is out of stock");
        let cost = buy_cost(&self.params, g, s, qty);
        self.burn(GOLD, &who, cost, "npc_sell_order");
        self.stock[p.town as usize][g] = s - qty as i64;
        self.mint(&good, &who, qty as u128, "bought");
        self.total.burned_npc_sell_orders += cost;
        self.epoch_ledger.burned_npc_sell_orders += cost;
        cost
    }

    /// Sell cargo to the town's NPC buy orders. Gold paid is MINTED (faucet, scaled by the Council).
    pub fn sell(&mut self, good: String, qty: u64) -> u128 {
        self.touch();
        let who = env::predecessor_account_id();
        let p = self.player(&who);
        require!(p.haul.is_none(), "you are travelling");
        require!(qty > 0, "qty must be > 0");
        let g = good_index(&good).unwrap_or_else(|| env::panic_str("unknown good"));
        let s = self.stock[p.town as usize][g];
        let pay = sell_payout(&self.params, g, s, qty, self.params.faucet_bps);
        self.burn(&good, &who, qty as u128, "sold");
        let cap = (self.params.target_stock * self.params.max_stock_factor) as i64;
        self.stock[p.town as usize][g] = (s + qty as i64).min(cap);
        self.mint(GOLD, &who, pay, "npc_buy_order");
        self.total.minted_npc_buy_orders += pay;
        self.epoch_ledger.minted_npc_buy_orders += pay;
        pay
    }

    /// Start a haul to another town. route: "safe" | "lowsec". qty 0 = travel empty.
    /// The toll is burned; the cargo is escrowed in the contract until arrival.
    pub fn start_haul(&mut self, to: String, route: String, good: Option<String>, qty: u64) -> Haul {
        self.touch();
        let who = env::predecessor_account_id();
        let mut p = self.player(&who);
        require!(p.haul.is_none(), "already travelling");
        let to = town_index(&to).unwrap_or_else(|| env::panic_str("unknown town"));
        require!(to != p.town, "already there");
        let route = match route.as_str() {
            "safe" => SAFE,
            "lowsec" => LOWSEC,
            _ => env::panic_str("route must be safe or lowsec"),
        };
        require!(qty <= self.params.cargo_cap, "over cargo cap");
        let g = match (&good, qty) {
            (_, 0) => 0usize,
            (Some(g), _) => good_index(g).unwrap_or_else(|| env::panic_str("unknown good")),
            (None, _) => env::panic_str("good required when qty > 0"),
        };
        let toll = self.params.toll_gold[route as usize] as u128;
        self.burn(GOLD, &who, toll, "toll");
        self.total.burned_tolls += toll;
        self.epoch_ledger.burned_tolls += toll;
        let me = env::current_account_id();
        if qty > 0 {
            self.internal_transfer(&who, &me, GOODS[g], qty as u128, Some("haul_escrow"));
            self.total.hauls += 1;
            self.epoch_ledger.hauls += 1;
            if route == LOWSEC {
                self.total.lowsec_hauls += 1;
                self.epoch_ledger.lowsec_hauls += 1;
            }
        }
        let now = self.now_tick();
        let h = Haul { id: self.next_haul_id, from: p.town, to, route, good: g as u8, qty, depart_tick: now, arrive_tick: now + self.params.travel_ticks[route as usize] };
        self.next_haul_id += 1;
        p.haul = Some(h.clone());
        self.players.insert(who.clone(), p);
        events::game("haul_started", json!({ "account_id": who, "haul": h }));
        h
    }

    /// Resolve a haul once it has arrived. Anyone may call it (keepers / NPCs), so a player
    /// cannot sit on a bad roll. Lowsec hauls can be ambushed: part of the cargo is BURNED,
    /// part is looted by the raider whose stake triggered the ambush.
    pub fn arrive(&mut self, account_id: Option<AccountId>) -> near_sdk::serde_json::Value {
        self.touch();
        let who = account_id.unwrap_or_else(env::predecessor_account_id);
        let mut p = self.player(&who);
        let h = p.haul.clone().unwrap_or_else(|| env::panic_str("not travelling"));
        let now = self.now_tick();
        require!(now >= h.arrive_tick, format!("still travelling: arrives at tick {}, now {}", h.arrive_tick, now));
        let me = env::current_account_id();
        let good = GOODS[h.good as usize];
        let mut result = json!({ "account_id": who, "haul_id": h.id, "town": TOWNS[h.to as usize], "ambushed": false, "delivered": h.qty });
        p.town = h.to;
        p.haul = None;
        if h.qty > 0 {
            p.hauls += 1;
            let mut delivered = h.qty;
            if h.route == LOWSEC {
                let lane = lane_index(h.from, h.to);
                let active: Vec<usize> = self.raids.iter().enumerate().filter(|(_, r)| r.lane == lane && r.expires_tick > now).map(|(i, _)| i).collect();
                let chance = ambush_chance_bps(&self.params, LOWSEC, active.len() as u64);
                let roll = Self::roll(h.id, &who);
                if roll < chance {
                    let raid_idx = active.into_iter().find(|i| self.raids[*i].raider != who);
                    let (burned, looted, kept) = ambush_split(&self.params, h.qty, raid_idx.is_some());
                    self.burn(good, &me, burned as u128, "ambush_destroyed");
                    let mut raider_id: Option<AccountId> = None;
                    if let Some(i) = raid_idx {
                        let raid = self.raids.remove(i);
                        self.internal_transfer(&me, &raid.raider, good, looted as u128, Some("ambush_loot"));
                        self.internal_transfer(&me, &raid.raider, GOLD, raid.stake, Some("raid_stake_returned"));
                        if let Some(mut rp) = self.players.get(&raid.raider).cloned() {
                            rp.raids_won += 1;
                            self.players.insert(raid.raider.clone(), rp);
                        }
                        raider_id = Some(raid.raider);
                    }
                    p.ambushed += 1;
                    self.total.ambushes += 1;
                    self.epoch_ledger.ambushes += 1;
                    self.total.cargo_burned_units += burned;
                    self.epoch_ledger.cargo_burned_units += burned;
                    delivered = kept;
                    result = json!({ "account_id": who, "haul_id": h.id, "town": TOWNS[h.to as usize], "ambushed": true, "roll": roll, "chance_bps": chance, "burned": burned, "looted": looted, "delivered": kept, "raider": raider_id });
                    events::game("ambush", result.clone());
                }
            }
            self.internal_transfer(&me, &who, good, delivered as u128, Some("haul_delivered"));
        }
        self.players.insert(who.clone(), p);
        events::game("haul_arrived", result.clone());
        result
    }

    /// Stake gold to raid a Lowsec lane ("mina-forja" | "forja-puerto" | "mina-puerto").
    /// The fee is BURNED; the stake is escrowed and returned on a successful ambush or on expiry.
    pub fn raid(&mut self, lane: String, stake: near_sdk::json_types::U128) -> Raid {
        self.touch();
        let who = env::predecessor_account_id();
        self.player(&who);
        let lane = match lane.as_str() {
            "mina-forja" | "forja-mina" => 0u8,
            "forja-puerto" | "puerto-forja" => 1,
            "mina-puerto" | "puerto-mina" => 2,
            _ => env::panic_str("unknown lane"),
        };
        let stake = stake.0;
        require!(stake >= self.params.raid_min_stake as u128, "stake below minimum");
        require!(!self.raids.iter().any(|r| r.raider == who), "you already have an active raid");
        require!(self.raids.len() < 30, "too many active raids");
        let fee = raid_fee(&self.params, stake);
        self.burn(GOLD, &who, fee, "raid_fee");
        self.total.burned_raid_fees += fee;
        self.epoch_ledger.burned_raid_fees += fee;
        let me = env::current_account_id();
        self.internal_transfer(&who, &me, GOLD, stake, Some("raid_stake"));
        let r = Raid { raider: who, lane, stake, expires_tick: self.now_tick() + self.params.raid_ttl_ticks };
        self.raids.push(r.clone());
        self.total.raids += 1;
        self.epoch_ledger.raids += 1;
        events::game("raid_posted", json!({ "raid": r }));
        r
    }

    // ---------------------------------------------------------------- council

    /// Called by the AI Economic Council once per epoch. The contract enforces the bound
    /// (±council_max_step_bps, at most 10%) and the [min, max] range — no dev patch needed,
    /// and a compromised council key cannot crash or pump the economy in one step.
    pub fn council_update(&mut self, faucet_bps: u64, rationale_hash: String, decision_id: Option<u64>) -> u64 {
        self.touch();
        require!(env::predecessor_account_id() == self.council, "only the council");
        require!(self.epoch > 0, "first epoch has not closed yet");
        require!(self.last_council_epoch.map(|e| e < self.epoch).unwrap_or(true), "council already acted this epoch");
        let prev = self.params.faucet_bps;
        require!(within_bound(prev, faucet_bps, self.params.council_max_step_bps), "change exceeds the per-epoch bound");
        require!(faucet_bps >= self.params.council_min_faucet_bps && faucet_bps <= self.params.council_max_faucet_bps, "faucet out of range");
        let rule = self.rule_next_faucet_bps();
        self.params.faucet_bps = faucet_bps;
        self.last_council_epoch = Some(self.epoch);
        events::game("council_update", json!({ "epoch": self.epoch, "prev_faucet_bps": prev, "faucet_bps": faucet_bps, "rule_says": rule, "follows_rule": rule == Some(faucet_bps), "rationale_hash": rationale_hash, "decision_id": decision_id }));
        faucet_bps
    }

    // ---------------------------------------------------------------- AI attestations

    /// Anchor an NPC/Council decision: hashes of the payload and of the NEAR AI TEE attestation.
    pub fn record_decision(&mut self, kind: String, payload_hash: String, attestation_hash: String, model: String, signature_kind: String) -> u64 {
        let who = env::predecessor_account_id();
        require!(self.agents.contains(&who) || who == self.council, "only registered AI agents");
        require!(payload_hash.len() <= 128 && attestation_hash.len() <= 128 && model.len() <= 128 && kind.len() <= 32 && signature_kind.len() <= 32, "field too long");
        let id = self.decisions.len() as u64;
        let d = Decision { id, agent: who, kind, payload_hash, attestation_hash, model, signature_kind, block_height: env::block_height(), timestamp_ms: env::block_timestamp_ms() };
        events::game("decision_recorded", json!({ "decision": d }));
        self.decisions.push(d);
        id
    }

    // ---------------------------------------------------------------- admin (owner)

    pub fn add_agent(&mut self, account_id: AccountId) {
        self.assert_owner();
        self.agents.insert(account_id);
    }

    pub fn remove_agent(&mut self, account_id: AccountId) {
        self.assert_owner();
        self.agents.remove(&account_id);
    }

    pub fn set_council(&mut self, account_id: AccountId) {
        self.assert_owner();
        self.council = account_id;
    }

    /// Anyone can poke the clock (closes epochs, expires raids, restocks towns).
    pub fn tick(&mut self) -> u64 {
        self.touch();
        self.epoch
    }

    // ---------------------------------------------------------------- views

    pub fn get_player(&self, account_id: AccountId) -> Option<Player> {
        self.players.get(&account_id).cloned()
    }

    pub fn is_agent(&self, account_id: AccountId) -> bool {
        self.agents.contains(&account_id)
    }

    pub fn get_params(&self) -> Params {
        self.params.clone()
    }

    pub fn current_tick(&self) -> u64 {
        self.now_tick()
    }

    /// What the public rule says the faucet should be, from the last closed epoch.
    pub fn rule_next_faucet_bps(&self) -> Option<u64> {
        if self.epochs.is_empty() {
            return None;
        }
        let last = self.epochs.get(self.epochs.len() - 1).unwrap();
        Some(council_rule(&self.params, self.params.faucet_bps, last.inflation_bps))
    }

    pub fn economy(&self) -> Economy {
        let p = &self.params;
        let towns = (0..3)
            .map(|t| TownView {
                town: TOWNS[t].to_string(),
                stock: self.stock[t],
                ask: [0, 1, 2].map(|g| ask_price(p, g, self.stock[t][g])),
                bid: [0, 1, 2].map(|g| bid_price(p, g, self.stock[t][g], p.faucet_bps)),
            })
            .collect();
        Economy {
            tick: self.now_tick(),
            epoch: self.epoch,
            gold_supply: self.supply.get(GOLD).copied().unwrap_or(0),
            item_supply: [0, 1, 2].map(|g| self.supply.get(GOODS[g]).copied().unwrap_or(0)),
            players: self.player_count,
            faucet_bps: p.faucet_bps,
            council: self.council.clone(),
            council_rule: COUNCIL_RULE.to_string(),
            rule_next_faucet_bps: self.rule_next_faucet_bps(),
            towns,
            raids: self.raids.clone(),
            total: self.total.clone(),
            current_epoch: self.epoch_ledger.clone(),
            epoch_supply_start: self.epoch_supply_start,
            decisions: self.decisions.len() as u64,
        }
    }

    pub fn epochs(&self, from: Option<u64>, limit: Option<u64>) -> Vec<EpochRecord> {
        let from = from.unwrap_or(0);
        let limit = limit.unwrap_or(50).min(200);
        (from..(from + limit).min(self.epochs.len() as u64)).map(|i| self.epochs.get(i as u32).unwrap().clone()).collect()
    }

    pub fn decisions(&self, from: Option<u64>, limit: Option<u64>) -> Vec<Decision> {
        let n = self.decisions.len() as u64;
        let limit = limit.unwrap_or(50).min(200);
        let from = from.unwrap_or(n.saturating_sub(limit));
        (from..(from + limit).min(n)).map(|i| self.decisions.get(i as u32).unwrap().clone()).collect()
    }

    pub fn get_decision(&self, id: u64) -> Option<Decision> {
        self.decisions.get(id as u32).cloned()
    }
}

impl Lowsec {
    fn assert_owner(&self) {
        require!(env::predecessor_account_id() == self.owner, "only the owner");
    }

    fn player(&self, who: &AccountId) -> Player {
        self.players.get(who).cloned().unwrap_or_else(|| env::panic_str("not registered: call register first"))
    }

    pub(crate) fn now_tick(&self) -> u64 {
        let elapsed_s = env::block_timestamp_ms().saturating_sub(self.genesis_ms) / 1000;
        elapsed_s / self.params.tick_seconds.max(1)
    }

    /// Deterministic per-haul roll in [0, 10000) from the block's random seed.
    /// Limitation (documented): validators can bias env::random_seed; fine for a testnet game.
    fn roll(haul_id: u64, who: &AccountId) -> u64 {
        let mut data = env::random_seed();
        data.extend_from_slice(&haul_id.to_le_bytes());
        data.extend_from_slice(who.as_bytes());
        let h = env::sha256(&data);
        u64::from_le_bytes(h[0..8].try_into().unwrap()) % 10_000
    }

    /// Lazy clock: restock towns, expire raids, close epochs.
    fn touch(&mut self) {
        let now = self.now_tick();
        // towns: mean reversion toward goal, one step per elapsed tick (bounded work)
        let steps = now.saturating_sub(self.stock_tick).min(200);
        for _ in 0..steps {
            for t in 0..3 {
                for g in 0..3 {
                    self.stock[t][g] = revert_stock(&self.params, self.stock[t][g], goal_stock(&self.params, t == g));
                }
            }
        }
        self.stock_tick = now;
        // raids: return expired stakes
        let me = env::current_account_id();
        let (expired, active): (Vec<Raid>, Vec<Raid>) = std::mem::take(&mut self.raids).into_iter().partition(|r| r.expires_tick <= now);
        self.raids = active;
        for r in expired {
            self.internal_transfer(&me, &r.raider, GOLD, r.stake, Some("raid_expired"));
        }
        // epochs
        let e = now / self.params.epoch_ticks.max(1);
        if e > self.epoch {
            let supply_end = self.supply.get(GOLD).copied().unwrap_or(0);
            let rec = EpochRecord {
                epoch: self.epoch,
                supply_start: self.epoch_supply_start,
                supply_end,
                players_start: self.epoch_players_start,
                players_end: self.player_count,
                inflation_bps: inflation_bps(self.epoch_supply_start, supply_end),
                faucet_bps: self.params.faucet_bps,
                ledger: std::mem::take(&mut self.epoch_ledger),
            };
            events::game("epoch_closed", json!({ "record": rec }));
            self.epochs.push(rec);
            self.epoch = e;
            self.epoch_supply_start = supply_end;
            self.epoch_players_start = self.player_count;
        }
    }
}

#[cfg(test)]
mod tests;
