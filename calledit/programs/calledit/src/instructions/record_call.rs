use anchor_lang::prelude::*;

use crate::constants::{BPS_DENOMINATOR, CALL_SEED, OUTCOME_UNSETTLED, SIDE_NO, SIDE_YES};
use crate::error::CalledItError;
use crate::state::CallReceipt;

#[derive(Accounts)]
#[instruction(match_id: u64, prop_id: u64)]
pub struct RecordCall<'info> {
    #[account(
        init,
        payer = player,
        space = 8 + CallReceipt::INIT_SPACE,
        seeds = [CALL_SEED, player.key().as_ref(), &match_id.to_le_bytes(), &prop_id.to_le_bytes()],
        bump
    )]
    pub call: Account<'info, CallReceipt>,

    #[account(mut)]
    pub player: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<RecordCall>,
    match_id: u64,
    prop_id: u64,
    side: u8,
    market_pct: u16,
    window_end: i64,
) -> Result<()> {
    require!(side == SIDE_NO || side == SIDE_YES, CalledItError::InvalidSide);
    require!(
        market_pct >= 1 && market_pct <= BPS_DENOMINATOR - 1,
        CalledItError::InvalidMarketPct
    );

    // The on-chain block time is the proof: the call must land before the window
    // closes, so it can never be a hindsight boast.
    let now = Clock::get()?.unix_timestamp;
    require!(now < window_end, CalledItError::WindowClosed);

    let call = &mut ctx.accounts.call;
    call.player = ctx.accounts.player.key();
    call.match_id = match_id;
    call.prop_id = prop_id;
    call.side = side;
    call.market_pct = market_pct;
    call.created_at = now;
    call.window_end = window_end;
    call.settled = false;
    call.outcome = OUTCOME_UNSETTLED;
    call.points = 0;
    call.bump = ctx.bumps.call;

    msg!(
        "call recorded: player={} match={} prop={} side={} market_bps={} at={}",
        call.player,
        match_id,
        prop_id,
        side,
        market_pct,
        now
    );
    Ok(())
}
