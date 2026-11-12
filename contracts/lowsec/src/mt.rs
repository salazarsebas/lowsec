//! Minimal NEP-245 multi-token core: gold + cargo items live in ONE contract.
//! Implemented: mt_transfer, mt_batch_transfer, mt_transfer_call, mt_batch_transfer_call (+ resolve),
//! mt_balance_of, mt_batch_balance_of, mt_supply, mt_batch_supply, mt_token. Approvals are not supported.
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::{assert_one_yocto, ext_contract, near, require, AccountId, Gas, PromiseOrValue};

#[near(serializers = [json])]
pub struct Token {
    pub token_id: String,
    pub owner_id: Option<AccountId>,
}

#[ext_contract(ext_mt_receiver)]
pub trait MultiTokenReceiver {
    fn mt_on_transfer(
        &mut self,
        sender_id: AccountId,
        previous_owner_ids: Vec<AccountId>,
        token_ids: Vec<String>,
        amounts: Vec<U128>,
        msg: String,
    ) -> PromiseOrValue<Vec<U128>>;
}

#[ext_contract(ext_self)]
pub trait MtResolver {
    fn mt_resolve_transfer(&mut self, sender_id: AccountId, receiver_id: AccountId, token_ids: Vec<String>, amounts: Vec<U128>) -> Vec<U128>;
}

const GAS_FOR_RESOLVE: Gas = Gas::from_tgas(10);
const GAS_FOR_CALL: Gas = Gas::from_tgas(30);

pub fn is_token(id: &str) -> bool {
    id == rules::GOLD || rules::good_index(id).is_some()
}

impl Lowsec {
    pub(crate) fn key(token: &str, account: &AccountId) -> String {
        format!("{token}:{account}")
    }
    pub(crate) fn bal(&self, token: &str, account: &AccountId) -> u128 {
        self.balances.get(&Self::key(token, account)).copied().unwrap_or(0)
    }
    fn set_bal(&mut self, token: &str, account: &AccountId, v: u128) {
        let k = Self::key(token, account);
        if v == 0 {
            self.balances.remove(&k);
        } else {
            self.balances.insert(k, v);
        }
    }
    pub(crate) fn mint(&mut self, token: &str, to: &AccountId, amount: u128, memo: &str) {
        if amount == 0 {
            return;
        }
        let b = self.bal(token, to);
        self.set_bal(token, to, b + amount);
        *self.supply.entry(token.to_string()).or_insert(0) += amount;
        events::mt_mint(to, token, amount, memo);
    }
    pub(crate) fn burn(&mut self, token: &str, from: &AccountId, amount: u128, memo: &str) {
        if amount == 0 {
            return;
        }
        let b = self.bal(token, from);
        require!(b >= amount, format!("not enough {token}: have {b}, need {amount}"));
        self.set_bal(token, from, b - amount);
        *self.supply.entry(token.to_string()).or_insert(0) -= amount;
        events::mt_burn(from, token, amount, memo);
    }
    pub(crate) fn internal_transfer(&mut self, from: &AccountId, to: &AccountId, token: &str, amount: u128, memo: Option<&str>) {
        require!(is_token(token), "unknown token");
        require!(from != to, "sender and receiver must differ");
        if amount == 0 {
            return;
        }
        let b = self.bal(token, from);
        require!(b >= amount, format!("not enough {token}: have {b}, need {amount}"));
        self.set_bal(token, from, b - amount);
        let r = self.bal(token, to);
        self.set_bal(token, to, r + amount);
        events::mt_transfer(from, to, &[token.to_string()], &[amount], memo);
    }
}

#[near]
impl Lowsec {
    #[payable]
    pub fn mt_transfer(&mut self, receiver_id: AccountId, token_id: String, amount: U128, approval: Option<(AccountId, u64)>, memo: Option<String>) {
        assert_one_yocto();
        require!(approval.is_none(), "approvals not supported");
        let sender = env::predecessor_account_id();
        self.internal_transfer(&sender, &receiver_id, &token_id, amount.0, memo.as_deref());
    }

    #[payable]
    pub fn mt_batch_transfer(&mut self, receiver_id: AccountId, token_ids: Vec<String>, amounts: Vec<U128>, approvals: Option<Vec<Option<(AccountId, u64)>>>, memo: Option<String>) {
        assert_one_yocto();
        require!(approvals.is_none(), "approvals not supported");
        require!(token_ids.len() == amounts.len(), "length mismatch");
        let sender = env::predecessor_account_id();
        for (t, a) in token_ids.iter().zip(amounts.iter()) {
            self.internal_transfer(&sender, &receiver_id, t, a.0, memo.as_deref());
        }
    }

    #[payable]
    pub fn mt_transfer_call(&mut self, receiver_id: AccountId, token_id: String, amount: U128, approval: Option<(AccountId, u64)>, memo: Option<String>, msg: String) -> PromiseOrValue<Vec<U128>> {
        self.mt_batch_transfer_call(receiver_id, vec![token_id], vec![amount], approval.map(|a| vec![Some(a)]), memo, msg)
    }

    #[payable]
    pub fn mt_batch_transfer_call(&mut self, receiver_id: AccountId, token_ids: Vec<String>, amounts: Vec<U128>, approvals: Option<Vec<Option<(AccountId, u64)>>>, memo: Option<String>, msg: String) -> PromiseOrValue<Vec<U128>> {
        assert_one_yocto();
        require!(approvals.is_none(), "approvals not supported");
        require!(token_ids.len() == amounts.len(), "length mismatch");
        let sender = env::predecessor_account_id();
        for (t, a) in token_ids.iter().zip(amounts.iter()) {
            self.internal_transfer(&sender, &receiver_id, t, a.0, memo.as_deref());
        }
        ext_mt_receiver::ext(receiver_id.clone())
            .with_static_gas(GAS_FOR_CALL)
            .mt_on_transfer(sender.clone(), vec![sender.clone(); token_ids.len()], token_ids.clone(), amounts.clone(), msg)
            .then(ext_self::ext(env::current_account_id()).with_static_gas(GAS_FOR_RESOLVE).mt_resolve_transfer(sender, receiver_id, token_ids, amounts))
            .into()
    }

    /// Refunds whatever the receiver reports as unused. Returns the amounts actually transferred.
    #[private]
    pub fn mt_resolve_transfer(&mut self, sender_id: AccountId, receiver_id: AccountId, token_ids: Vec<String>, amounts: Vec<U128>) -> Vec<U128> {
        let unused: Vec<U128> = match env::promise_result_checked(0, 4096) {
            Ok(v) => near_sdk::serde_json::from_slice::<Vec<U128>>(&v).unwrap_or_else(|_| amounts.clone()),
            Err(_) => amounts.clone(),
        };
        let mut out = vec![];
        for (i, t) in token_ids.iter().enumerate() {
            let sent = amounts[i].0;
            let refund = unused.get(i).map(|u| u.0).unwrap_or(sent).min(sent).min(self.bal(t, &receiver_id));
            if refund > 0 {
                self.internal_transfer(&receiver_id, &sender_id, t, refund, Some("refund"));
            }
            out.push(U128(sent - refund));
        }
        out
    }

    pub fn mt_balance_of(&self, account_id: AccountId, token_id: String) -> U128 {
        U128(self.bal(&token_id, &account_id))
    }

    pub fn mt_batch_balance_of(&self, account_id: AccountId, token_ids: Vec<String>) -> Vec<U128> {
        token_ids.iter().map(|t| U128(self.bal(t, &account_id))).collect()
    }

    pub fn mt_supply(&self, token_id: String) -> Option<U128> {
        if !is_token(&token_id) {
            return None;
        }
        Some(U128(self.supply.get(&token_id).copied().unwrap_or(0)))
    }

    pub fn mt_batch_supply(&self, token_ids: Vec<String>) -> Vec<Option<U128>> {
        token_ids.into_iter().map(|t| self.mt_supply(t)).collect()
    }

    pub fn mt_token(&self, token_ids: Vec<String>) -> Vec<Option<Token>> {
        token_ids.into_iter().map(|t| if is_token(&t) { Some(Token { token_id: t, owner_id: None }) } else { None }).collect()
    }
}
