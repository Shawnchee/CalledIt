/**
 * TxLINE raw → clean mappers — pure, unit-testable, and the ONLY place the
 * app's odds/scores field-name and scaling assumptions live (mirrors the
 * pattern of txline-agent/src/lib/txline/schema.ts). Reconciled against real
 * captured devnet payloads (see GROUND-TRUTH.md); see mapping.test.ts for
 * assertions against the actual sample JSON.
 *
 * Both mappers return `null` for a record they can't honestly resolve — the
 * server-side route normalisers (src/app/api/txline/{stream,scores}/route.ts)
 * treat `null` as "drop this frame", which is exactly the right behaviour
 * for keep-alives, non-JSON, and records that don't carry the data we need.
 */
import type {
  MatchEventType,
  OddsPayload,
  RawFixture,
  RawOdds,
  RawParticipantScore,
  RawScore,
  ScoreEvent,
} from "./types";

// ---------------------------------------------------------------------------
// StablePrice detection
// ---------------------------------------------------------------------------

/**
 * MessageId suffix that marks a StablePrice (demargined) record, e.g.
 * "1837412721:00003:000038-10021-stab" (verified live).
 */
export const STABLE_PRICE_SUFFIX = "-stab";

export function isStablePrice(messageId: string | undefined | null): boolean {
  return typeof messageId === "string" && messageId.endsWith(STABLE_PRICE_SUFFIX);
}

// ---------------------------------------------------------------------------
// small guarded readers — never throw on a missing/wrong-typed field
// ---------------------------------------------------------------------------

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/**
 * A single upstream `data:` frame (or a snapshot response body) may be ONE
 * record or a JSON array of records — normalise to an array either way.
 * Snapshots (non-SSE) are always arrays; SSE frames can be either.
 */
export function toRecordArray(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.filter(
      (x): x is Record<string, unknown> => !!x && typeof x === "object",
    );
  }
  if (data && typeof data === "object") return [data as Record<string, unknown>];
  return [];
}

// ---------------------------------------------------------------------------
// Odds
// ---------------------------------------------------------------------------

/**
 * Map one raw odds record to the clean OddsPayload. Returns null when the
 * record isn't a resolvable price record (no fixture id, or no aligned
 * PriceNames/Prices/Pct arrays).
 */
export function mapOdds(raw: RawOdds): OddsPayload | null {
  if (!raw || typeof raw !== "object") return null;

  const fixtureId = num(raw.FixtureId, NaN);
  if (!Number.isFinite(fixtureId)) return null;

  const priceNames = Array.isArray(raw.PriceNames) ? raw.PriceNames.map(String) : [];
  const rawPrices = Array.isArray(raw.Prices) ? raw.Prices : [];
  const rawPct = Array.isArray(raw.Pct) ? raw.Pct : [];

  if (priceNames.length === 0 || rawPrices.length === 0 || rawPct.length === 0) {
    return null;
  }

  // Prices are decimal odds × 1000 (integers) on the wire — ÷1000 for true decimal.
  const Prices = rawPrices.map((p) => num(p) / 1000);
  // Pct is a string[] of PERCENTAGES summing to ~100 on the wire — parse + ÷100 for a fraction.
  const Pct = rawPct.map((p) => num(p) / 100);

  return {
    FixtureId: fixtureId,
    Ts: num(raw.Ts, Date.now()),
    Bookmaker: str(raw.Bookmaker) ?? "",
    SuperOddsType: str(raw.SuperOddsType) ?? "",
    InRunning: Boolean(raw.InRunning),
    PriceNames: priceNames,
    Prices,
    Pct,
    MessageId: str(raw.MessageId),
    MarketPeriod: raw.MarketPeriod === null ? null : str(raw.MarketPeriod),
  };
}

/**
 * Map an odds frame that may be ONE record or an ARRAY of records (both
 * shapes occur on the real stream) to a single OddsPayload — preferring the
 * first in-play (InRunning) mappable record, falling back to the first
 * mappable record otherwise. Returns null if nothing in the frame maps.
 */
export function mapOddsFrame(data: unknown): OddsPayload | null {
  const mapped = toRecordArray(data)
    .map((r) => mapOdds(r as RawOdds))
    .filter((x): x is OddsPayload => x != null);
  if (mapped.length === 0) return null;
  return mapped.find((o) => o.InRunning) ?? mapped[0];
}

// ---------------------------------------------------------------------------
// Scores
// ---------------------------------------------------------------------------

function deriveMinute(raw: RawScore): number {
  const seconds = raw.Clock?.Seconds;
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return 0;
  return Math.max(0, Math.floor(seconds / 60));
}

function deriveType(raw: RawScore): MatchEventType {
  const action = (str(raw.Action) ?? "").toLowerCase();
  if (raw.StatusId === 100 || action === "game_finalised") return "FULL_TIME";
  switch (action) {
    case "goal":
      return "GOAL";
    case "kickoff":
      return "KICKOFF";
    case "halftime_finalised":
      return "HALF_TIME";
    case "yellow_card":
      return "YELLOW_CARD";
    case "red_card":
      return "RED_CARD";
    case "corner":
      return "CORNER";
    case "penalty":
      return "PENALTY";
    default:
      return "OTHER";
  }
}

/** `Participant === 1 ? (Participant1IsHome?"home":"away") : (Participant1IsHome?"away":"home")`. */
function deriveTeam(raw: RawScore): "home" | "away" | undefined {
  const p = raw.Participant;
  if (p !== 1 && p !== 2) return undefined;
  const p1Home = raw.Participant1IsHome;
  if (typeof p1Home !== "boolean") return undefined;
  const isParticipant1 = p === 1;
  return isParticipant1 === p1Home ? "home" : "away";
}

function totalGoals(side: RawParticipantScore | undefined): number {
  return num(side?.Total?.Goals, 0);
}

/**
 * Map one raw scores/events record to the clean ScoreEvent. Returns null
 * when the record carries no `Score` payload at all (possession, comment,
 * lineups — and even some real event kinds like `kickoff`/`free_kick` lack
 * `Score`). That's a deliberate choice, not an oversight: ScoreEvent.home/
 * awayScore are consumed unconditionally by LiveGameController.onScore
 * (`engine.setScore(event.homeScore, event.awayScore)`), so fabricating a
 * 0-0 for a record with no real score data would incorrectly reset an
 * in-progress scoreboard. Dropping the frame is the honest behaviour;
 * guard every nested access so this NEVER throws either way.
 */
export function mapScoreEvent(raw: RawScore): ScoreEvent | null {
  if (!raw || typeof raw !== "object") return null;

  const fixtureId = num(raw.FixtureId, NaN);
  if (!Number.isFinite(fixtureId)) return null;

  const score = raw.Score;
  if (!score || (!score.Participant1 && !score.Participant2)) return null;

  const p1IsHome = raw.Participant1IsHome !== false; // default: Participant1 is home unless explicitly false
  const homeSide = p1IsHome ? score.Participant1 : score.Participant2;
  const awaySide = p1IsHome ? score.Participant2 : score.Participant1;

  return {
    FixtureId: fixtureId,
    Ts: num(raw.Ts, Date.now()),
    minute: deriveMinute(raw),
    action: str(raw.Action) ?? "",
    type: deriveType(raw),
    team: deriveTeam(raw),
    homeScore: totalGoals(homeSide),
    awayScore: totalGoals(awaySide),
  };
}

/** Event types that decide a call — prefer these when a frame batches several records. */
const SETTLING_EVENT_TYPES = new Set<MatchEventType>(["GOAL", "FULL_TIME", "HALF_TIME"]);

/**
 * Map a scores frame that may be ONE record or an ARRAY of records to a
 * single ScoreEvent. A single-record frame maps straight through. For an
 * ARRAY frame, prefer a settling event (GOAL/FULL_TIME/HALF_TIME) over the
 * first mappable one: several non-decisive kinds (corner, action_amend, ...)
 * also carry `Score`, so naive "first mappable" could silently drop a goal
 * that arrived batched in the same frame. Falls back to the first mappable
 * record; returns null if nothing maps (e.g. an all-possession/comment batch).
 */
export function mapScoreFrame(data: unknown): ScoreEvent | null {
  const records = toRecordArray(data);
  if (records.length === 0) return null;
  if (records.length === 1) return mapScoreEvent(records[0] as RawScore);

  const mapped = records
    .map((r) => mapScoreEvent(r as RawScore))
    .filter((x): x is ScoreEvent => x != null);
  if (mapped.length === 0) return null;
  return mapped.find((e) => SETTLING_EVENT_TYPES.has(e.type)) ?? mapped[0];
}

// ---------------------------------------------------------------------------
// Fixtures (optional convenience mapper)
// ---------------------------------------------------------------------------

export interface MappedFixture {
  fixtureId: number;
  home: string;
  away: string;
  /** Kickoff, epoch ms. */
  kickoff: number;
  competition: string;
  /**
   * Raw orientation flag: part1/Participant1 is the home side iff this is
   * true. Carried through (not just folded into home/away) because the odds
   * feed has NO Participant1IsHome of its own — the live loop needs this to
   * know which of part1/part2 is the home price. Defaults true when the raw
   * field is absent.
   */
  participant1IsHome: boolean;
  /** Raw GameState (e.g. 1 when in-play); null/absent for scheduled fixtures. */
  gameState: number | string | null;
}

/** home = Participant1IsHome ? Participant1 : Participant2; kickoff = StartTime; competition = Competition. */
export function mapFixture(raw: RawFixture): MappedFixture | null {
  if (!raw || typeof raw !== "object") return null;
  const fixtureId = num(raw.FixtureId, NaN);
  if (!Number.isFinite(fixtureId)) return null;

  const p1IsHome = raw.Participant1IsHome !== false;
  const home = str(p1IsHome ? raw.Participant1 : raw.Participant2);
  const away = str(p1IsHome ? raw.Participant2 : raw.Participant1);
  if (!home || !away) return null;

  return {
    fixtureId,
    home,
    away,
    kickoff: num(raw.StartTime, 0),
    competition: str(raw.Competition) ?? "",
    participant1IsHome: p1IsHome,
    gameState: raw.GameState ?? null,
  };
}
