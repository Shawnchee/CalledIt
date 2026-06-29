use anchor_lang::prelude::*;

use crate::constants::CONFIG_SEED;
use crate::error::CalledItError;
use crate::state::Config;

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Config::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,

    #[account(mut)]
    pub authority: Signer<'info>,

    /// This program — used to resolve its program-data address.
    #[account(constraint = program.programdata_address()? == Some(program_data.key()) @ CalledItError::Unauthorized)]
    pub program: Program<'info, crate::program::Calledit>,

    /// Only the program's upgrade authority may bootstrap config. Without this,
    /// anyone could front-run the deployer and seize the settlement authority.
    #[account(constraint = program_data.upgrade_authority_address == Some(authority.key()) @ CalledItError::Unauthorized)]
    pub program_data: Account<'info, ProgramData>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeConfig>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.authority = ctx.accounts.authority.key();
    config.bump = ctx.bumps.config;
    Ok(())
}
