import type { MatchInfo, Side } from "./types";

/**
 * Deterministic replay of a World Cup match for the demo (matches end before
 * judging, so the video carries the experience). The same shape a LiveTxlineFeed
 * produces from real TxLINE odds — here it's scripted so the demo is repeatable
 * and the narrative lands. Solo play vs the market works on its own, so a room
 * of 1 is still fun.
 */

export interface BotPersona {
  id: string;
  name: string;
  avatar: string;
  /** Flavor shown in the crew list. */
  style: string;
}

export interface BotCall {
  botId: string;
  side: Side;
  /** Seconds from match start the bot taps in (within the window). */
  at: number;
}

export interface ScriptRound {
  propId: number;
  /** Seconds from start the call opens. */
  offerAt: number;
  windowSec: number;
  /** Seconds from start the call resolves. */
  resolveAt: number;
  /** Match clock (minutes) shown on the card. */
  minute: number;
  label: string;
  detail?: string;
  /** TxLINE market this call is sourced from (provenance in the UI). */
  superOddsType: string;
  /** Market implied probability of YES (0..1) — from TxLINE Pct[]. */
  yesPct: number;
  outcome: Side;
  resolveLabel: string;
  /** Scoreline after this round resolves (only set on rounds that change the score). */
  scoreAfter?: { home: number; away: number };
  botCalls: BotCall[];
}

export interface MatchScript {
  match: MatchInfo;
  bots: BotPersona[];
  durationSec: number;
  rounds: ScriptRound[];
}

export const MATCH: MatchInfo = {
  fixtureId: 1042026,
  competition: "World Cup 2026 · Final",
  home: { name: "Argentina", short: "ARG", flag: "🇦🇷", color: "#6CACE4" },
  away: { name: "Brazil", short: "BRA", flag: "🇧🇷", color: "#F7D417" },
};

export const BOTS: BotPersona[] = [
  { id: "max", name: "Maxi", avatar: "🦊", style: "reads the game — calls the longshots" },
  { id: "priya", name: "Priya", avatar: "🐯", style: "chalk merchant — plays it safe" },
  { id: "sam", name: "Sam", avatar: "🦅", style: "balanced, picks her spots" },
  { id: "deano", name: "Deano", avatar: "🐢", style: '"I said that!" — every single time' },
];

export const SCRIPT: MatchScript = {
  match: MATCH,
  bots: BOTS,
  durationSec: 182,
  rounds: [
    {
      propId: 1,
      offerAt: 6,
      windowSec: 12,
      resolveAt: 24,
      minute: 12,
      label: "Brazil to win a corner in the next 5 minutes?",
      detail: "Brazil building early pressure down the right.",
      superOddsType: "NEXT_CORNER",
      yesPct: 0.63,
      outcome: "YES",
      resolveLabel: "🚩 Corner — Brazil, 15'",
      botCalls: [
        { botId: "max", side: "YES", at: 9 },
        { botId: "priya", side: "YES", at: 11 },
        { botId: "sam", side: "YES", at: 14 },
        { botId: "deano", side: "NO", at: 16 },
      ],
    },
    {
      propId: 2,
      offerAt: 30,
      windowSec: 14,
      resolveAt: 50,
      minute: 24,
      label: "Argentina to score in the next 10 minutes?",
      detail: "Market doubts it — Brazil have been the better side.",
      superOddsType: "NEXT_GOAL",
      yesPct: 0.27,
      outcome: "YES",
      resolveLabel: "⚽ GOAL — Álvarez, 29' · ARG 1-0",
      scoreAfter: { home: 1, away: 0 },
      botCalls: [
        { botId: "max", side: "YES", at: 34 },
        { botId: "priya", side: "NO", at: 36 },
        { botId: "deano", side: "NO", at: 41 },
        { botId: "sam", side: "YES", at: 43 },
      ],
    },
    {
      propId: 3,
      offerAt: 56,
      windowSec: 12,
      resolveAt: 76,
      minute: 38,
      label: "Another goal before half-time?",
      detail: "End-to-end now, but the clock's ticking.",
      superOddsType: "TOTAL_GOALS",
      yesPct: 0.5,
      outcome: "NO",
      resolveLabel: "⏸️ Half-time — no more goals",
      botCalls: [
        { botId: "max", side: "NO", at: 59 },
        { botId: "priya", side: "NO", at: 61 },
        { botId: "deano", side: "YES", at: 60 },
        { botId: "sam", side: "YES", at: 66 },
      ],
    },
    {
      propId: 4,
      offerAt: 84,
      windowSec: 14,
      resolveAt: 106,
      minute: 57,
      label: "Brazil to equalise this half?",
      detail: "Brazil throwing bodies forward after the restart.",
      superOddsType: "NEXT_GOAL",
      yesPct: 0.43,
      outcome: "YES",
      resolveLabel: "⚽ GOAL — Rodrygo, 61' · ARG 1-1 BRA",
      scoreAfter: { home: 1, away: 1 },
      botCalls: [
        { botId: "max", side: "YES", at: 86 },
        { botId: "priya", side: "NO", at: 89 },
        { botId: "sam", side: "YES", at: 93 },
        { botId: "deano", side: "YES", at: 97 },
      ],
    },
    {
      propId: 5,
      offerAt: 116,
      windowSec: 12,
      resolveAt: 138,
      minute: 73,
      label: "A red card before full-time?",
      detail: "It's getting heated. Market says no chance.",
      superOddsType: "CARDS",
      yesPct: 0.12,
      outcome: "YES",
      resolveLabel: "🟥 RED — Otamendi, 74'",
      botCalls: [
        { botId: "priya", side: "NO", at: 118 },
        { botId: "max", side: "YES", at: 120 },
        { botId: "sam", side: "NO", at: 123 },
        { botId: "deano", side: "NO", at: 126 },
      ],
    },
    {
      propId: 6,
      offerAt: 146,
      windowSec: 14,
      resolveAt: 170,
      minute: 86,
      label: "Argentina to hold on for a draw — with 10 men?",
      detail: "1-1, down to 10 men, four minutes of stoppage.",
      superOddsType: "MATCH_ODDS",
      yesPct: 0.52,
      outcome: "NO",
      resolveLabel: "⚽ Brazil win it — Vinícius, 90'! ARG 1-2 BRA",
      scoreAfter: { home: 1, away: 2 },
      botCalls: [
        // even the sharp gets the ending wrong — so a good player can take #1
        { botId: "max", side: "YES", at: 148 },
        { botId: "priya", side: "YES", at: 151 },
        { botId: "deano", side: "YES", at: 153 },
        { botId: "sam", side: "YES", at: 157 },
      ],
    },
  ],
};
