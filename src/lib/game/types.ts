export type Side = "YES" | "NO";
export type PropStatus = "open" | "locked" | "settled";
export type Outcome = "YES" | "NO";

export interface TeamInfo {
  name: string;
  short: string; // 3-letter code, e.g. "ARG"
  flag: string; // emoji
  color: string; // brand hex for the team
}

export interface MatchInfo {
  fixtureId: number;
  competition: string;
  home: TeamInfo;
  away: TeamInfo;
}

/** A live call offered to the room, sourced from a TxLINE odds snapshot. */
export interface Prop {
  id: number;
  /** Match clock (minutes) when this was offered. */
  minute: number;
  label: string;
  detail?: string;
  /** TxLINE market this came from (provenance shown in the UI). */
  superOddsType: string;
  /**
   * Which team the YES side is about, when the prop is team-specific (e.g. a
   * "Home to score…" call). Lets the scores feed settle YES only on a goal by
   * this team. Absent for team-agnostic props (replay corners/cards/etc.).
   */
  team?: "home" | "away";
  /** Market implied probability of YES (0..1), from TxLINE Pct[]. */
  yesPct: number;
  /** ms timestamp the call window opened. */
  openedAt: number;
  /** ms timestamp the call window closes. */
  windowEndsAt: number;
  status: PropStatus;
  outcome?: Outcome;
  /** Settlement label, e.g. "⚽ GOAL — Álvarez 29'". */
  resolveLabel?: string;
  /**
   * Odds-provenance markers from the TxLINE OddsPayload this prop was built
   * from (live mode only — see propFromOdds in live-feed.ts). Absent in
   * replay: the demo timeline is scripted, not a real odds snapshot, so
   * there's nothing honest to attribute. Surfaced on the receipt page as the
   * provenance chip; never fabricated.
   */
  oddsTs?: number;
  oddsMessageId?: string;
}

export interface Call {
  id: string;
  propId: number;
  playerId: string;
  side: Side;
  /** Market prob of YES at the moment of the call (for scoring + display). */
  marketYesPct: number;
  placedAt: number;
  /** Points once settled (mirrors the on-chain formula). */
  points?: number;
  correct?: boolean;
  /** On-chain receipt signature, once the call is recorded on devnet. */
  receiptSig?: string;
  /** CallReceipt PDA address (base58) — the branded receipt page lives at /receipt/[address]. */
  receiptAddress?: string;
}

export interface Player {
  id: string;
  name: string;
  avatar: string; // emoji
  isYou: boolean;
  isBot: boolean;
  points: number;
  correctCalls: number;
  totalCalls: number;
  /** Current streak of correct calls. */
  streak: number;
}

export interface LeaderboardRow extends Player {
  rank: number;
}

export interface GameState {
  match: MatchInfo;
  minute: number;
  homeScore: number;
  awayScore: number;
  status: "pregame" | "live" | "fulltime";
  /** Most recently offered prop (the live call), if any. */
  activeProp?: Prop;
  props: Prop[];
  calls: Call[];
  players: Player[];
  leaderboard: LeaderboardRow[];
  /** Rolling feed of notable moments for the room ticker. */
  ticker: { id: string; ts: number; text: string }[];
}
