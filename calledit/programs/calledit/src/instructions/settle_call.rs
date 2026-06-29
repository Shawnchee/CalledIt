use anchor_lang::prelude::*;

use crate::constants::{
    BPS_DENOMINATOR, CONFIG_SEED, OUTCOME_CORRECT, OUTCOME_INCORRECT, POINTS_BASE, POINTS_MAX,
    SIDE_YES,
};
use crate::error::CalledItError;
use crate::state::{CallReceipt, Config};

#[derive(Accounts)]
pub struct SettleCall<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ CalledItError::Unauthorized
    )]
    pub config: Account<'info, Config>,

    #[account(mut, constraint = !call.settled @ CalledItError::AlreadySettled)]
    pub call: Account<'info, CallReceipt>,

    /// Must equal config.authority (enforced by has_one above).
    pub authority: Signer<'info>,
}

pub fn handler(ctx: Context<SettleCall>, correct: bool) -> Result<()> {
    let call = &mut ctx.accounts.call;

    if correct {
        // The settlement authority only attests the binary outcome (objective,
        // from the TxLINE feed). Points are computed deterministically here so the
        // authority can't inflate scores: pay the market's fair odds for the side
        // taken — calling what the market doubted pays more.
        let prob_of_side_bps: u64 = if call.side == SIDE_YES {
            call.market_pct as u64
        } else {
            (BPS_DENOMINATOR - call.market_pct) as u64
        };
        // prob_of_side_bps is in [1, 9999] by record_call validation, so this
        // never divides by zero.
        let raw = POINTS_BASE / prob_of_side_bps;
        call.points = core::cmp::min(raw as u32, POINTS_MAX);
        call.outcome = OUTCOME_CORRECT;
    } else {
        call.points = 0;
        call.outcome = OUTCOME_INCORRECT;
    }
    call.settled = true;

    msg!(
        "call settled: correct={} points={} outcome={}",
        correct,
        call.points,
        call.outcome
    );
    Ok(())
}
