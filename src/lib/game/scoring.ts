import type { Side } from "./types";

/**
 * Scoring — a 1:1 mirror of the on-chain `settle_call` formula in the calledit
 * program (programs/calledit/src/constants.rs + instructions/settle_call.rs).
 * Your payout is the market's *fair odds* for the side you took: calling what
 * the market doubted pays more, locks pay little.
 */
export const POINTS_BASE = 1_000_000;
export const POINTS_MAX = 10_000;
export const BPS = 10_000;

/** Implied YES prob (0..1) -> basis points, clamped to [1, 9999] like the program. */
export function yesPctToBps(yesPct: number): number {
  const bps = Math.round(yesPct * BPS);
  return Math.min(BPS - 1, Math.max(1, bps));
}

/** Market prob of the side you took, in bps. */
export function probOfSideBps(side: Side, yesPct: number): number {
  const yesBps = yesPctToBps(yesPct);
  return side === "YES" ? yesBps : BPS - yesBps;
}

/** Points for a call. 0 if incorrect; otherwise POINTS_BASE/prob, capped. Matches on-chain. */
export function pointsFor(side: Side, yesPct: number, correct: boolean): number {
  if (!correct) return 0;
  return Math.min(Math.floor(POINTS_BASE / probOfSideBps(side, yesPct)), POINTS_MAX);
}

/** Decimal-odds-style multiple for display, e.g. 4.5×. */
export function payoutMultiple(side: Side, yesPct: number): number {
  return BPS / probOfSideBps(side, yesPct);
}

/** Points a correct call *would* earn — for the "+X" preview on the buttons. */
export function potentialPoints(side: Side, yesPct: number): number {
  return pointsFor(side, yesPct, true);
}

export function formatPct(yesPct: number): string {
  return `${Math.round(yesPct * 100)}%`;
}
