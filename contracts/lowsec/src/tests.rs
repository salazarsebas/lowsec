use super::*;
use near_sdk::json_types::U128;
use near_sdk::serde_json::Value;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{testing_env, NearToken};

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}

fn ctx(who: &str, ts_s: u64) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(acc("lowsec.testnet"))
        .predecessor_account_id(acc(who))
        .signer_account_id(acc(who))
        .block_timestamp(ts_s * 1_000_000_000)
        .random_seed([7u8; 32]);
    testing_env!(b.build());
}

fn ctx_yocto(who: &str, ts_s: u64) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(acc("lowsec.testnet")).predecessor_account_id(acc(who)).block_timestamp(ts_s * 1_000_000_000).attached_deposit(NearToken::from_yoctonear(1));
    testing_env!(b.build());
}

fn game(params: Option<Params>) -> Lowsec {
    ctx("owner.testnet", 0);
    Lowsec::new(acc("owner.testnet"), acc("council.testnet"), params)
}

fn gold(c: &Lowsec, who: &str) -> u128 {
    c.mt_balance_of(acc(who), "gold".into()).0
}

#[test]
fn parity_with_typescript_sim() {
    let v: Value = near_sdk::serde_json::from_str(include_str!("../tests/vectors.json")).unwrap();
    let p = Params::default();
    for x in v["price"].as_array().unwrap() {
        let g = good_index(x["good"].as_str().unwrap()).unwrap();
        let s = x["stock"].as_i64().unwrap();
        let f = x["faucet"].as_u64().unwrap();
        assert_eq!(ask_price(&p, g, s) as u64, x["ask"].as_u64().unwrap(), "ask {x}");
        assert_eq!(bid_price(&p, g, s, f) as u64, x["bid"].as_u64().unwrap(), "bid {x}");
        assert_eq!(buy_cost(&p, g, s.max(10), 10) as u64, x["buy10"].as_u64().unwrap(), "buy {x}");
        assert_eq!(sell_payout(&p, g, s, 10, f) as u64, x["sell10"].as_u64().unwrap(), "sell {x}");
    }
    for x in v["ambush"].as_array().unwrap() {
        assert_eq!(ambush_chance_bps(&p, LOWSEC, x["raids"].as_u64().unwrap()), x["bps"].as_u64().unwrap());
    }
    for x in v["split"].as_array().unwrap() {
        let (b, l, k) = ambush_split(&p, x["qty"].as_u64().unwrap(), x["raider"].as_bool().unwrap());
        assert_eq!((b, l, k), (x["burned"].as_u64().unwrap(), x["looted"].as_u64().unwrap(), x["kept"].as_u64().unwrap()));
    }
    for x in v["fees"].as_array().unwrap() {
        assert_eq!(raid_fee(&p, x["stake"].as_u64().unwrap() as u128) as u64, x["fee"].as_u64().unwrap());
    }
    for x in v["revert"].as_array().unwrap() {
        let g = goal_stock(&p, x["home"].as_bool().unwrap());
        assert_eq!(revert_stock(&p, x["stock"].as_i64().unwrap(), g), x["next"].as_i64().unwrap());
    }
    for x in v["council"].as_array().unwrap() {
        let i = inflation_bps(x["supplyStart"].as_u64().unwrap() as u128, x["supplyEnd"].as_u64().unwrap() as u128);
        assert_eq!(i, x["inflationBps"].as_i64().unwrap());
        assert_eq!(council_rule(&p, x["faucet"].as_u64().unwrap(), i), x["next"].as_u64().unwrap());
    }
    // params are identical to the TS defaults
    let tp = &v["params"];
    assert_eq!(tp["targetStock"].as_u64().unwrap(), p.target_stock);
    assert_eq!(tp["reversionBps"].as_u64().unwrap(), p.reversion_bps);
    assert_eq!(tp["councilMinFaucetBps"].as_u64().unwrap(), p.council_min_faucet_bps);
    assert_eq!(tp["tollGold"]["lowsec"].as_u64().unwrap(), p.toll_gold[1]);
}

#[test]
fn register_grants_gold_as_nep245() {
    let mut c = game(None);
    ctx("alice.testnet", 1);
    c.register(None);
    assert_eq!(gold(&c, "alice.testnet"), 500);
    assert_eq!(c.mt_supply("gold".into()), Some(U128(500)));
    assert_eq!(c.mt_supply("nope".into()), None);
}

#[test]
#[should_panic(expected = "already registered")]
fn cannot_register_twice() {
    let mut c = game(None);
    ctx("alice.testnet", 1);
    c.register(None);
    c.register(None);
}

#[test]
fn buy_burns_gold_and_sell_mints_it() {
    let mut c = game(None);
    ctx("alice.testnet", 1);
    c.register(Some("mina".into()));
    let cost = c.buy("ore".into(), 10);
    assert_eq!(cost, 10 * ask_price(&c.params, 0, 800 - 5)); // ore is cheap in Mina (stock 2x target)
    assert_eq!(gold(&c, "alice.testnet"), 500 - cost);
    assert_eq!(c.mt_balance_of(acc("alice.testnet"), "ore".into()).0, 10);
    assert_eq!(c.mt_supply("gold".into()).unwrap().0, 500 - cost);
    let pay = c.sell("ore".into(), 10);
    assert!(pay < cost, "same-town round trip must lose money (spread)");
    assert_eq!(c.total.burned_npc_sell_orders, cost);
    assert_eq!(c.total.minted_npc_buy_orders, pay);
}

#[test]
fn safe_haul_delivers_everything() {
    let mut c = game(None);
    ctx("alice.testnet", 1);
    c.register(Some("mina".into()));
    c.buy("ore".into(), 20);
    let h = c.start_haul("forja".into(), "safe".into(), Some("ore".into()), 20);
    assert_eq!(c.mt_balance_of(acc("alice.testnet"), "ore".into()).0, 0);
    assert_eq!(c.mt_balance_of(acc("lowsec.testnet"), "ore".into()).0, 20); // escrow
    ctx("alice.testnet", 1 + c.params.tick_seconds * h.arrive_tick + 1);
    let r = c.arrive(None);
    assert_eq!(r["ambushed"], false);
    assert_eq!(c.mt_balance_of(acc("alice.testnet"), "ore".into()).0, 20);
    assert_eq!(c.get_player(acc("alice.testnet")).unwrap().town, 1);
    let pay = c.sell("ore".into(), 20);
    assert!(pay > 0);
}

#[test]
#[should_panic(expected = "still travelling")]
fn cannot_arrive_early() {
    let mut c = game(None);
    ctx("alice.testnet", 1);
    c.register(Some("mina".into()));
    c.start_haul("forja".into(), "safe".into(), None, 0);
    c.arrive(None);
}

#[test]
fn lowsec_ambush_burns_cargo_and_pays_the_raider() {
    let p = Params { ambush_base_bps: 10_000, ambush_max_bps: 10_000, ..Default::default() };
    let mut c = game(Some(p));
    ctx("raider.testnet", 1);
    c.register(Some("forja".into()));
    let fee = raid_fee(&c.params, 100);
    c.raid("mina-forja".into(), U128(100));
    assert_eq!(gold(&c, "raider.testnet"), 500 - 100 - fee);
    assert_eq!(gold(&c, "lowsec.testnet"), 100); // stake escrow
    ctx("alice.testnet", 1);
    c.register(Some("mina".into()));
    c.buy("ore".into(), 20);
    let ore_supply_before = c.mt_supply("ore".into()).unwrap().0;
    let h = c.start_haul("forja".into(), "lowsec".into(), Some("ore".into()), 20);
    ctx("anyone.testnet", 1 + c.params.tick_seconds * h.arrive_tick + 1);
    let r = c.arrive(Some(acc("alice.testnet")));
    assert_eq!(r["ambushed"], true);
    let (burned, looted, kept) = ambush_split(&c.params, 20, true);
    assert_eq!((burned, looted, kept), (6, 4, 10));
    assert_eq!(c.mt_balance_of(acc("alice.testnet"), "ore".into()).0, kept as u128);
    assert_eq!(c.mt_balance_of(acc("raider.testnet"), "ore".into()).0, looted as u128);
    assert_eq!(c.mt_supply("ore".into()).unwrap().0, ore_supply_before - burned as u128, "destroyed cargo is burned");
    assert_eq!(gold(&c, "raider.testnet"), 500 - fee, "stake returned");
    assert_eq!(c.total.cargo_burned_units, 6);
    assert!(c.economy().raids.is_empty());
}

#[test]
fn raid_stake_returned_on_expiry() {
    let mut c = game(None);
    ctx("raider.testnet", 1);
    c.register(None);
    c.raid("mina-puerto".into(), U128(150));
    let fee = raid_fee(&c.params, 150);
    ctx("raider.testnet", 1 + c.params.tick_seconds * (c.params.raid_ttl_ticks + 1));
    c.tick();
    assert_eq!(gold(&c, "raider.testnet"), 500 - fee);
    assert_eq!(c.total.burned_raid_fees, fee);
}

#[test]
fn council_update_is_bounded_on_chain() {
    let mut c = game(None);
    ctx("alice.testnet", 1);
    c.register(None);
    let epoch_s = c.params.tick_seconds * c.params.epoch_ticks;
    ctx("council.testnet", epoch_s + 1);
    assert_eq!(c.council_update(9_000, "h".into(), None), 9_000);
    assert_eq!(c.params.faucet_bps, 9_000);
    // next epoch, a later new player's grant is scaled
    ctx("bob.testnet", 2 * epoch_s + 1);
    c.register(None);
    assert_eq!(gold(&c, "bob.testnet"), 450);
}

#[test]
#[should_panic(expected = "exceeds the per-epoch bound")]
fn council_cannot_move_more_than_10_percent() {
    let mut c = game(None);
    ctx("council.testnet", c.params.tick_seconds * c.params.epoch_ticks + 1);
    c.council_update(8_900, "h".into(), None);
}

#[test]
#[should_panic(expected = "only the council")]
fn only_council_can_update() {
    let mut c = game(None);
    ctx("mallory.testnet", c.params.tick_seconds * c.params.epoch_ticks + 1);
    c.council_update(10_000, "h".into(), None);
}

#[test]
#[should_panic(expected = "already acted this epoch")]
fn council_once_per_epoch() {
    let mut c = game(None);
    ctx("council.testnet", c.params.tick_seconds * c.params.epoch_ticks + 1);
    c.council_update(9_500, "h".into(), None);
    c.council_update(9_000, "h".into(), None);
}

#[test]
fn epochs_close_and_rule_is_public() {
    let mut c = game(None);
    ctx("alice.testnet", 1);
    c.register(None);
    let epoch_s = c.params.tick_seconds * c.params.epoch_ticks;
    ctx("bob.testnet", epoch_s + 1);
    c.register(None); // closes epoch 0 (0 -> 500) before registering
    ctx("carol.testnet", 2 * epoch_s + 1);
    c.register(None); // closes epoch 1: 500 -> 1000 = +100%
    let e = c.epochs(None, None);
    assert_eq!(e.len(), 2);
    assert_eq!(e[1].inflation_bps, 10_000);
    assert_eq!(c.rule_next_faucet_bps(), Some(9_000)); // way above target -> -10%
}

#[test]
fn decisions_are_anchored_only_by_agents() {
    let mut c = game(None);
    ctx("owner.testnet", 1);
    c.add_agent(acc("hauler-1.lowsec.testnet"));
    ctx("hauler-1.lowsec.testnet", 2);
    let id = c.record_decision("haul".into(), "ab".repeat(32), "cd".repeat(32), "z-ai/glm-5.3-flash".into(), "provider_tee".into());
    assert_eq!(id, 0);
    assert_eq!(c.get_decision(0).unwrap().signature_kind, "provider_tee");
    assert_eq!(c.economy().decisions, 1);
}

#[test]
#[should_panic(expected = "only registered AI agents")]
fn random_accounts_cannot_record_decisions() {
    let mut c = game(None);
    ctx("mallory.testnet", 1);
    c.record_decision("haul".into(), "x".into(), "y".into(), "m".into(), "provider_tee".into());
}

#[test]
fn nep245_transfer_requires_one_yocto_and_moves_tokens() {
    let mut c = game(None);
    ctx("alice.testnet", 1);
    c.register(None);
    ctx_yocto("alice.testnet", 2);
    c.mt_transfer(acc("bob.testnet"), "gold".into(), U128(120), None, None);
    assert_eq!(gold(&c, "alice.testnet"), 380);
    assert_eq!(gold(&c, "bob.testnet"), 120);
    assert_eq!(c.mt_batch_balance_of(acc("bob.testnet"), vec!["gold".into(), "ore".into()]), vec![U128(120), U128(0)]);
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn nep245_transfer_without_yocto_fails() {
    let mut c = game(None);
    ctx("alice.testnet", 1);
    c.register(None);
    c.mt_transfer(acc("bob.testnet"), "gold".into(), U128(1), None, None);
}

#[test]
fn towns_restock_over_time() {
    let mut c = game(None);
    ctx("alice.testnet", 1);
    c.register(Some("mina".into()));
    c.buy("ore".into(), 25);
    let after = c.stock[0][0];
    ctx("alice.testnet", 1 + c.params.tick_seconds * 10);
    c.tick();
    assert!(c.stock[0][0] > after);
}

#[test]
fn create_player_is_private_and_validates_names() {
    let mut c = game(None);
    ctx("lowsec.testnet", 1);
    let pk: near_sdk::PublicKey = "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp".parse().unwrap();
    let _ = c.create_player("alice".into(), pk);
}

#[test]
#[should_panic(expected = "name: 1-32 chars")]
fn create_player_rejects_bad_names() {
    let mut c = game(None);
    ctx("lowsec.testnet", 1);
    let pk: near_sdk::PublicKey = "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp".parse().unwrap();
    let _ = c.create_player("Bad.Name".into(), pk);
}

#[test]
#[should_panic(expected = "only the contract account")]
fn create_player_cannot_be_called_by_others() {
    let mut c = game(None);
    ctx("mallory.testnet", 1);
    let pk: near_sdk::PublicKey = "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp".parse().unwrap();
    let _ = c.create_player("alice".into(), pk);
}
