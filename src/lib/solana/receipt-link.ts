import type { Call, MatchInfo, Prop } from "@/lib/game/types";

/**
 * Build the branded `/receipt/[address]` URL for a call that has already
 * minted an on-chain receipt, carrying whatever human context is on hand
 * (match/prop labels, odds provenance) as query params.
 *
 * The receipt page's PRIMARY facts — side, market %, timestamp, settled,
 * points — always come straight off the chain via `fetchReceipt`. These
 * params only enrich the "human line" and the odds-provenance chip; the page
 * degrades gracefully (generic "Fixture #… · Prop #…" copy, no chip) when
 * they're absent, e.g. someone opens a bare `/receipt/<address>` link.
 */
export function receiptHref(call: Call, prop?: Prop, match?: MatchInfo): string | undefined {
  if (!call.receiptAddress) return undefined;
  const params = new URLSearchParams();
  if (match) params.set("match", `${match.home.short} vs ${match.away.short}`);
  if (prop?.label) params.set("prop", prop.label);
  if (prop?.oddsTs != null) params.set("ts", String(prop.oddsTs));
  if (prop?.oddsMessageId) params.set("mid", prop.oddsMessageId);
  const qs = params.toString();
  return `/receipt/${call.receiptAddress}${qs ? `?${qs}` : ""}`;
}
