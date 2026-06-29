use anchor_lang::prelude::*;

/// PDA seed prefixes.
pub const CONFIG_SEED: &[u8] = b"config";
pub const CALL_SEED: &[u8] = b"call";

/// Call sides.
pub const SIDE_NO: u8 = 0;
pub const SIDE_YES: u8 = 1;

/// Outcomes.
pub const OUTCOME_UNSETTLED: u8 = 0;
pub const OUTCOME_CORRECT: u8 = 1;
pub const OUTCOME_INCORRECT: u8 = 2;

/// Basis-points denominator (100% = 10_000 bps).
pub const BPS_DENOMINATOR: u16 = 10_000;

/// Market-weighted scoring. A correct call pays the market's *fair odds* for the
/// side you took: points = POINTS_BASE / prob_of_side_bps, capped at POINTS_MAX.
/// Calling what the market doubted (low prob) pays more; locks pay little.
pub const POINTS_BASE: u64 = 1_000_000;
pub const POINTS_MAX: u32 = 10_000;

/// Exposed to the IDL so the frontend can reuse the value.
#[constant]
pub const SCORING_POINTS_BASE: u64 = POINTS_BASE;
