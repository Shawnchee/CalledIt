use anchor_lang::prelude::*;

/// Singleton config. Stores the settlement (oracle) authority that is allowed
/// to resolve calls. Created once, right after deploy, by the deployer.
#[account]
#[derive(InitSpace)]
pub struct Config {
    pub authority: Pubkey,
    pub bump: u8,
}

/// One per (player, match, prop). This is the anti-hindsight proof: it is
/// created BEFORE the call window closes and stamped with the on-chain block
/// time, so "I called it" becomes provable instead of a group-chat boast.
#[account]
#[derive(InitSpace)]
pub struct CallReceipt {
    /// Wallet that made the call.
    pub player: Pubkey,
    /// TxLINE fixture id.
    pub match_id: u64,
    /// Prop id within the match (the specific call, e.g. "ARG to score next 10m").
    pub prop_id: u64,
    /// 0 = NO, 1 = YES (see constants).
    pub side: u8,
    /// Market's implied probability of the YES outcome, in basis points (1..=9999).
    pub market_pct: u16,
    /// Block time the call was recorded — the proof you called it *before* it happened.
    pub created_at: i64,
    /// Deadline the call had to beat (window close). created_at < window_end is enforced.
    pub window_end: i64,
    pub settled: bool,
    /// 0 = unsettled, 1 = correct, 2 = incorrect (see constants).
    pub outcome: u8,
    /// Market-weighted points, computed deterministically on settlement.
    pub points: u32,
    pub bump: u8,
}
