pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("BeR8b7y7c4offbz2fqNj2N1Y5zoEqkY9aYgBVc7NSdM1");

#[program]
pub mod calledit {
    use super::*;

    /// One-time: create the singleton Config and set the settlement authority
    /// (run by the deployer right after deploy).
    pub fn initialize_config(ctx: Context<InitializeConfig>) -> Result<()> {
        instructions::initialize_config::handler(ctx)
    }

    /// Record a call against the live market — the anti-hindsight receipt.
    pub fn record_call(
        ctx: Context<RecordCall>,
        match_id: u64,
        prop_id: u64,
        side: u8,
        market_pct: u16,
        window_end: i64,
    ) -> Result<()> {
        instructions::record_call::handler(ctx, match_id, prop_id, side, market_pct, window_end)
    }

    /// Resolve a call (authority only); points are computed on-chain.
    pub fn settle_call(ctx: Context<SettleCall>, correct: bool) -> Result<()> {
        instructions::settle_call::handler(ctx, correct)
    }
}
