use anchor_lang::prelude::*;

#[error_code]
pub enum CalledItError {
    #[msg("Side must be 0 (NO) or 1 (YES)")]
    InvalidSide,
    #[msg("Market percentage must be between 1 and 9999 bps")]
    InvalidMarketPct,
    #[msg("Call window has already closed; too late to call")]
    WindowClosed,
    #[msg("Call has already been settled")]
    AlreadySettled,
    #[msg("Only the settlement authority can settle calls")]
    Unauthorized,
}
