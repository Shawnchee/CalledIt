/**
 * TxLINE wire types — the live data CalledIt is built on.
 *
 * Odds arrive on the SSE stream `GET https://txline.txodds.com/api/odds/stream`
 * (Bearer JWT + `X-Api-Token`, optional `fixtureId`, `Last-Event-ID` resume).
 * Scores/events arrive on the scores SSE stream and settle the calls.
 *
 * Free / World-Cup tier samples odds every ~60s, which is exactly why CalledIt's
 * mechanic is "call the next N minutes" rather than per-tick.
 */

/** A single odds snapshot for one fixture + market from one bookmaker. */
export interface OddsPayload {
  FixtureId: number;
  /** Snapshot timestamp (unix ms). */
  Ts: number;
  Bookmaker: string;
  /** Market type, e.g. "NEXT_GOAL", "MATCH_ODDS", "TOTAL_GOALS", "CARDS". */
  SuperOddsType: string;
  /** In-play flag — true once the match has kicked off. */
  InRunning: boolean;
  /** Outcome labels, aligned with Prices/Pct, e.g. ["Home","Draw","Away"]. */
  PriceNames: string[];
  /** Decimal odds, aligned with PriceNames. */
  Prices: number[];
  /** Implied probabilities (0..1), aligned with PriceNames. */
  Pct: number[];
}

export type MatchEventType =
  | "KICKOFF"
  | "GOAL"
  | "YELLOW_CARD"
  | "RED_CARD"
  | "CORNER"
  | "PENALTY"
  | "HALF_TIME"
  | "FULL_TIME";

/** A scores/events snapshot used to settle calls. */
export interface ScoreEvent {
  FixtureId: number;
  Ts: number;
  /** Match clock in minutes. */
  minute: number;
  type: MatchEventType;
  team?: "home" | "away";
  homeScore: number;
  awayScore: number;
  /** Human label, e.g. "Álvarez 29'". */
  label?: string;
}

/** Normalised stream event the app consumes from any TxlineFeed. */
export type FeedEvent =
  | { kind: "odds"; payload: OddsPayload }
  | { kind: "score"; event: ScoreEvent }
  | { kind: "clock"; minute: number; ts: number };

/** A source of live match data — implemented by LiveTxlineFeed and ReplayFeed. */
export interface TxlineFeed {
  subscribe(handler: (ev: FeedEvent) => void): () => void;
  start(): void;
  stop(): void;
}
