/**
 * TxLINE wire types — the live data CalledIt is built on.
 *
 * Odds arrive on the SSE stream `GET <oddsStreamUrl()>` (see config.ts;
 * devnet by default) — Bearer JWT + `X-Api-Token`, optional `fixtureId`,
 * `Last-Event-ID` resume. Scores/events arrive on the scores SSE stream and
 * settle the calls.
 *
 * Two layers live here:
 *  - RAW* — the wire shapes exactly as devnet sends them (see
 *    GROUND-TRUTH.md, captured 2026-07-12). Tolerant: most fields are
 *    optional because not every record carries every field (e.g. a
 *    possession/comment scores record has no `Score`/`Clock`).
 *  - The CLEAN app-facing types (OddsPayload, ScoreEvent, FeedEvent,
 *    TxlineFeed) — what the rest of the app consumes AFTER
 *    src/lib/txline/mapping.ts normalises a raw record. These are the types
 *    imported widely across the app; only their *fields* changed to match
 *    reality, not their names.
 *
 * Free / World-Cup tier samples odds every ~60s, which is exactly why
 * CalledIt's mechanic is "call the next N minutes" rather than per-tick.
 */

// ---------------------------------------------------------------------------
// RAW wire shapes (devnet ground truth, 2026-07-12)
// ---------------------------------------------------------------------------

/** One fixture record from GET /api/fixtures/snapshot. */
export interface RawFixture {
  Ts?: number;
  /** Kickoff, epoch ms. */
  StartTime?: number;
  Competition?: string;
  CompetitionId?: number;
  FixtureGroupId?: number;
  Participant1Id?: number;
  Participant1?: string;
  Participant2Id?: number;
  Participant2?: string;
  FixtureId: number;
  /** home = Participant1IsHome ? Participant1 : Participant2. */
  Participant1IsHome?: boolean;
  /** Present (e.g. 1) when in-play/active; absent otherwise. */
  GameState?: number | string | null;
  [key: string]: unknown;
}

/**
 * One StablePrice-demargined odds record (GET /api/odds/snapshot/{id},
 * GET /api/odds/stream frames). Real `SuperOddsType` observed on the free
 * tier: "1X2_PARTICIPANT_RESULT", "ASIANHANDICAP_PARTICIPANT_GOALS" — NOT
 * the invented "NEXT_GOAL"/"MATCH_ODDS" this file used to declare.
 */
export interface RawOdds {
  FixtureId: number;
  /** StablePrice records end with "-stab" — see isStablePrice(). */
  MessageId?: string;
  /** Epoch ms. */
  Ts?: number;
  Bookmaker?: string;
  BookmakerId?: number;
  /** e.g. "1X2_PARTICIPANT_RESULT". */
  SuperOddsType?: string;
  GameState?: number | string | null;
  /** In-play flag. */
  InRunning?: boolean;
  MarketParameters?: string | null;
  MarketPeriod?: string | null;
  /** e.g. ["part1","draw","part2"] — 1X2 order home/draw/away. NOT "Home"/"Away". */
  PriceNames?: string[];
  /** Decimal odds × 1000 (integers), aligned with PriceNames. */
  Prices?: number[];
  /** STRING percentages summing to ~100, aligned with PriceNames. */
  Pct?: string[];
  [key: string]: unknown;
}

/** Per-period goal/card/corner tally inside RawScore.Score.ParticipantN. */
export interface RawScorePeriod {
  Goals?: number;
  YellowCards?: number;
  RedCards?: number;
  Corners?: number;
  [key: string]: unknown;
}

export interface RawParticipantScore {
  H1?: RawScorePeriod;
  HT?: RawScorePeriod;
  H2?: RawScorePeriod;
  ET1?: RawScorePeriod;
  ET2?: RawScorePeriod;
  ETTotal?: RawScorePeriod;
  Total?: RawScorePeriod;
  [key: string]: unknown;
}

/**
 * One scores/events record (GET /api/scores/snapshot/{id},
 * GET /api/scores/stream frames). Many fields are only present for certain
 * `Action` kinds — `Score`/`Clock` are ABSENT on possession/comment/lineups
 * (and even on some real-event kinds like `kickoff`/`free_kick`) — treat
 * everything but FixtureId/Action as possibly missing and guard every
 * nested access.
 */
export interface RawScore {
  FixtureId: number;
  Participant1IsHome?: boolean;
  Participant1Id?: number;
  Participant2Id?: number;
  /** Event kind, e.g. "goal", "kickoff", "corner", "game_finalised". */
  Action?: string;
  Id?: number;
  /** Epoch ms. */
  Ts?: number;
  /** Ordering key — later records can supersede earlier ones. */
  Seq?: number;
  /** 1 pre, 3 HT, 7 KO, 9 in-play, 100 finished, ... */
  StatusId?: number;
  Clock?: { Running?: boolean; Seconds?: number };
  Score?: {
    Participant1?: RawParticipantScore;
    Participant2?: RawParticipantScore;
  };
  Data?: Record<string, unknown>;
  Stats?: Record<string, unknown>;
  /** Which side (1 or 2) the event belongs to. */
  Participant?: number;
  Possession?: number;
  Kickoff?: { Team?: number };
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// CLEAN app-facing types (post src/lib/txline/mapping.ts)
// ---------------------------------------------------------------------------

/** A single odds snapshot for one fixture + market from one bookmaker, mapped from RawOdds. */
export interface OddsPayload {
  FixtureId: number;
  /** Snapshot timestamp (unix ms). */
  Ts: number;
  Bookmaker: string;
  /** Market type — the free tier's is "1X2_PARTICIPANT_RESULT", not "NEXT_GOAL"/"MATCH_ODDS". */
  SuperOddsType: string;
  /** In-play flag — true once the match has kicked off. */
  InRunning: boolean;
  /** Outcome labels, aligned with Prices/Pct — real values are "part1"/"draw"/"part2". */
  PriceNames: string[];
  /** TRUE decimal odds (raw integer Prices ÷ 1000), aligned with PriceNames. */
  Prices: number[];
  /** Implied probabilities as FRACTIONS 0..1 (raw string percentages ÷ 100), aligned with PriceNames. */
  Pct: number[];
  MessageId?: string;
  MarketPeriod?: string | null;
}

export type MatchEventType =
  | "KICKOFF"
  | "GOAL"
  | "YELLOW_CARD"
  | "RED_CARD"
  | "CORNER"
  | "PENALTY"
  | "HALF_TIME"
  | "FULL_TIME"
  /** Any Action that doesn't map to one of the specific kinds above. */
  | "OTHER";

/** A scores/events snapshot used to settle calls, mapped from RawScore. */
export interface ScoreEvent {
  FixtureId: number;
  Ts: number;
  /** Match clock in minutes, derived from Clock.Seconds / 60. */
  minute: number;
  /** Raw Action passthrough, e.g. "goal", "halftime_finalised". */
  action: string;
  /** Derived from Action / StatusId — see mapping.ts. */
  type: MatchEventType;
  team?: "home" | "away";
  homeScore: number;
  awayScore: number;
  /** Human label, e.g. "Álvarez 29'" — not present on the real feed today. */
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
