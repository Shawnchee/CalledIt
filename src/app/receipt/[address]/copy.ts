import type { CallReceiptData } from "@/lib/solana/calledit-client";

/**
 * Shared presentation logic for the receipt page + its OG image — kept out of
 * both so the two stay in sync instead of drifting into two copies of the
 * same "how do we talk about a receipt" logic.
 */

/** Market's implied prob (bps, 0..9999) of the SIDE THIS CALL TOOK — not always YES. */
export function sideProbBps(r: Pick<CallReceiptData, "side" | "marketPct">): number {
  return r.side === "YES" ? r.marketPct : 10_000 - r.marketPct;
}

export function pctLabel(bps: number): string {
  return `${Math.round(bps / 100)}%`;
}

/** The "the market doubted it" line — the whole point of the game. */
export function marketToneLine(r: Pick<CallReceiptData, "side" | "marketPct">): string {
  const pct = sideProbBps(r) / 100;
  if (pct <= 35) return "the market doubted it";
  if (pct >= 65) return "the market saw it coming";
  return "a coinflip against the market";
}

export interface OutcomeCopy {
  stamp: string;
  detail: string;
  tone: "pending" | "correct" | "incorrect";
}

export function outcomeCopy(r: Pick<CallReceiptData, "settled" | "outcome" | "points">): OutcomeCopy {
  if (!r.settled) {
    return { stamp: "CALL LOCKED IN", detail: "Waiting on full time to settle.", tone: "pending" };
  }
  if (r.outcome === 1) {
    return { stamp: "CALLED IT", detail: `+${r.points.toLocaleString()} pts`, tone: "correct" };
  }
  return { stamp: "MISSED", detail: "The market had this one.", tone: "incorrect" };
}

/** How long before the window closed the call landed — the anti-hindsight proof, quantified. */
export function beatWindowBySec(r: Pick<CallReceiptData, "createdAt" | "windowEnd">): number {
  return Math.round((r.windowEnd - r.createdAt) / 1000);
}

export function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}
