import { test } from "node:test";
import assert from "node:assert/strict";
import type { RawOdds, RawScore } from "./types";

// This repo runs tests with Node's native TypeScript execution (`node --test`),
// NOT vitest — see sse.test.ts for the required pattern. Node needs a real,
// resolvable extension on relative ESM specifiers, but tsc's "bundler" module
// resolution rejects a literal ".ts" specifier; building the specifier at
// runtime ("./mapping" + ".ts") keeps both happy. The `typeof import(...js)`
// type aliases keep the dynamic value imports fully typed under tsc. (The
// `import type` above is erased by Node's type stripping, so it costs nothing
// at runtime.)
type MappingModule = typeof import("./mapping.js");
type LiveFeedModule = typeof import("./live-feed.js");

const { mapOdds, mapOddsFrame, mapScoreEvent, mapFixture, isStablePrice }: MappingModule =
  await import("./mapping" + ".ts");
const { propFromOdds }: LiveFeedModule = await import("./live-feed" + ".ts");

// ---------------------------------------------------------------------------
// Real devnet samples (copied verbatim from probe-out/sample-odds.json and
// probe-out/sample-scores.json, captured 2026-07-12) — GROUND TRUTH.
// ---------------------------------------------------------------------------

const SAMPLE_ODDS: RawOdds[] = [
  {
    FixtureId: 18237038,
    MessageId: "1837412721:00003:000038-10021-stab",
    Ts: 1783837683994,
    Bookmaker: "TXLineStablePriceDemargined",
    BookmakerId: 10021,
    SuperOddsType: "1X2_PARTICIPANT_RESULT",
    GameState: null,
    InRunning: false,
    MarketParameters: null,
    MarketPeriod: "half=1",
    PriceNames: ["part1", "draw", "part2"],
    Prices: [3110, 2273, 4193],
    Pct: ["32.154", "43.995", "23.849"],
  },
  {
    FixtureId: 18237038,
    MessageId: "1837412721:00003:000029-10021-stab",
    Ts: 1783837683994,
    Bookmaker: "TXLineStablePriceDemargined",
    BookmakerId: 10021,
    SuperOddsType: "1X2_PARTICIPANT_RESULT",
    GameState: null,
    InRunning: false,
    MarketParameters: null,
    MarketPeriod: null,
    PriceNames: ["part1", "draw", "part2"],
    Prices: [2412, 3438, 3396],
    Pct: ["41.459", "29.087", "29.446"],
  },
  {
    FixtureId: 18237038,
    MessageId: "1837412721:00003:000039-10021-stab",
    Ts: 1783837683994,
    Bookmaker: "TXLineStablePriceDemargined",
    BookmakerId: 10021,
    SuperOddsType: "ASIANHANDICAP_PARTICIPANT_GOALS",
    GameState: null,
    InRunning: false,
    MarketParameters: "line=0",
    MarketPeriod: "half=1",
    PriceNames: ["part1", "part2"],
    Prices: [1725, 2379],
    Pct: ["57.971", "42.034"],
  },
];

const SAMPLE_SCORE_CORNER: RawScore = {
  FixtureId: 18222446,
  GameState: "scheduled",
  StartTime: 1783818000000,
  Participant1IsHome: true,
  Participant2Id: 3099,
  Participant1Id: 1489,
  Action: "corner",
  Id: 1121,
  Ts: 1783827564792,
  Seq: 1257,
  StatusId: 9,
  Clock: { Running: true, Seconds: 7128 },
  Score: {
    Participant1: {
      H1: { Goals: 1, Corners: 2 },
      Total: { Goals: 2, YellowCards: 3, Corners: 8 },
    },
    Participant2: {
      Total: { Goals: 1, YellowCards: 1, RedCards: 1, Corners: 2 },
    },
  },
  Participant: 1,
};

const SAMPLE_SCORE_FREE_KICK: RawScore = {
  FixtureId: 18222446,
  Participant1IsHome: true,
  Participant2Id: 3099,
  Participant1Id: 1489,
  Action: "free_kick",
  Id: 1149,
  Ts: 1783827792185,
  Seq: 1292,
  StatusId: 9,
  Clock: { Running: true, Seconds: 7366 },
  Data: { FreeKickType: "Safe" },
  Participant: 1,
};

const SAMPLE_SCORE_GAME_FINALISED: RawScore = {
  FixtureId: 18222446,
  Participant1IsHome: true,
  Participant2Id: 3099,
  Participant1Id: 1489,
  Action: "game_finalised",
  Id: 1164,
  Ts: 1783828222499,
  Seq: 1306,
  StatusId: 100,
  Score: {
    Participant1: { Total: { Goals: 3, YellowCards: 3, Corners: 8 } },
    Participant2: { Total: { Goals: 1, YellowCards: 1, RedCards: 1, Corners: 2 } },
  },
};

const SAMPLE_SCORE_GOAL: RawScore = {
  FixtureId: 18222446,
  Participant1IsHome: true,
  Participant2Id: 3099,
  Participant1Id: 1489,
  Action: "goal",
  Id: 1141,
  Ts: 1783827757258,
  Seq: 1284,
  StatusId: 9,
  Clock: { Running: true, Seconds: 7244 },
  Score: {
    Participant1: { Total: { Goals: 3, YellowCards: 3, Corners: 8 } },
    Participant2: { Total: { Goals: 1, YellowCards: 1, RedCards: 1, Corners: 2 } },
  },
  Data: { GoalType: "Shot", PlayerId: 948167 },
  Participant: 1,
};

const SAMPLE_SCORE_HALFTIME: RawScore = {
  FixtureId: 18222446,
  Participant1IsHome: true,
  Participant2Id: 3099,
  Participant1Id: 1489,
  Action: "halftime_finalised",
  Id: 390,
  Ts: 1783821267452,
  Seq: 435,
  StatusId: 3,
  Score: {
    Participant1: { H1: { Goals: 1, Corners: 2 }, Total: { Goals: 1, Corners: 2 } },
    Participant2: { Total: { YellowCards: 1, Corners: 1 } },
  },
};

const SAMPLE_SCORE_KICKOFF: RawScore = {
  FixtureId: 18222446,
  Participant1IsHome: true,
  Participant2Id: 3099,
  Participant1Id: 1489,
  Action: "kickoff",
  Id: 1144,
  Ts: 1783827776610,
  Seq: 1286,
  StatusId: 9,
  Clock: { Running: true, Seconds: 7351 },
  Kickoff: { Team: 2 },
  Possession: 2,
};

// ---- mapOdds ----

test("mapOdds parses Pct string percentages into 0..1 fractions", () => {
  const mapped = mapOdds(SAMPLE_ODDS[0]);
  assert.ok(mapped);
  assert.ok(Math.abs(mapped.Pct[0] - 0.32154) < 1e-6);
  assert.ok(Math.abs(mapped.Pct[1] - 0.43995) < 1e-6);
  assert.ok(Math.abs(mapped.Pct[2] - 0.23849) < 1e-6);
});

test("mapOdds parses integer Prices (decimal-odds x1000) into true decimal odds", () => {
  const mapped = mapOdds(SAMPLE_ODDS[0]);
  assert.ok(mapped);
  assert.deepEqual(mapped.Prices, [3.11, 2.273, 4.193]);
});

test("mapOdds preserves part1/draw/part2 PriceNames and carries SuperOddsType/MessageId/MarketPeriod", () => {
  const mapped = mapOdds(SAMPLE_ODDS[0]);
  assert.ok(mapped);
  assert.deepEqual(mapped.PriceNames, ["part1", "draw", "part2"]);
  assert.equal(mapped.SuperOddsType, "1X2_PARTICIPANT_RESULT");
  assert.equal(mapped.MessageId, "1837412721:00003:000038-10021-stab");
  assert.equal(mapped.MarketPeriod, "half=1");
});

test("mapOdds also maps a non-1X2 market (ASIANHANDICAP) generically", () => {
  const mapped = mapOdds(SAMPLE_ODDS[2]);
  assert.ok(mapped);
  assert.deepEqual(mapped.PriceNames, ["part1", "part2"]);
  assert.deepEqual(mapped.Prices, [1.725, 2.379]);
});

test("mapOddsFrame handles an array frame and returns a mappable record", () => {
  const mapped = mapOddsFrame(SAMPLE_ODDS);
  assert.ok(mapped);
  assert.equal(mapped.FixtureId, 18237038);
});

// ---- mapScoreEvent ----

test("mapScoreEvent maps a goal record to GOAL with correct scores, minute, and team", () => {
  const mapped = mapScoreEvent(SAMPLE_SCORE_GOAL);
  assert.ok(mapped);
  assert.equal(mapped.type, "GOAL");
  assert.equal(mapped.homeScore, 3);
  assert.equal(mapped.awayScore, 1);
  assert.equal(mapped.minute, Math.floor(7244 / 60));
  assert.equal(mapped.team, "home");
});

test("mapScoreEvent maps game_finalised to FULL_TIME", () => {
  const mapped = mapScoreEvent(SAMPLE_SCORE_GAME_FINALISED);
  assert.ok(mapped);
  assert.equal(mapped.type, "FULL_TIME");
  assert.equal(mapped.homeScore, 3);
  assert.equal(mapped.awayScore, 1);
});

test("mapScoreEvent maps halftime_finalised to HALF_TIME", () => {
  const mapped = mapScoreEvent(SAMPLE_SCORE_HALFTIME);
  assert.ok(mapped);
  assert.equal(mapped.type, "HALF_TIME");
  assert.equal(mapped.homeScore, 1);
  assert.equal(mapped.awayScore, 0);
});

test("mapScoreEvent maps a corner record to CORNER without crashing on partial period data", () => {
  const mapped = mapScoreEvent(SAMPLE_SCORE_CORNER);
  assert.ok(mapped);
  assert.equal(mapped.type, "CORNER");
  assert.equal(mapped.homeScore, 2);
  assert.equal(mapped.awayScore, 1);
});

test("mapScoreEvent drops Score-less records (free_kick/kickoff) without crashing", () => {
  assert.doesNotThrow(() => mapScoreEvent(SAMPLE_SCORE_FREE_KICK));
  assert.doesNotThrow(() => mapScoreEvent(SAMPLE_SCORE_KICKOFF));
  assert.equal(mapScoreEvent(SAMPLE_SCORE_FREE_KICK), null);
  assert.equal(mapScoreEvent(SAMPLE_SCORE_KICKOFF), null);
});

test("mapScoreEvent never crashes on garbage input", () => {
  assert.doesNotThrow(() => mapScoreEvent({} as RawScore));
  assert.equal(mapScoreEvent({} as RawScore), null);
  assert.doesNotThrow(() => mapScoreEvent(null as unknown as RawScore));
});

// ---- isStablePrice / mapFixture ----

test("isStablePrice recognises the -stab suffix and rejects everything else", () => {
  assert.equal(isStablePrice("1837412721:00003:000038-10021-stab"), true);
  assert.equal(isStablePrice("1837412721:00003:000038-10021"), false);
  assert.equal(isStablePrice(undefined), false);
});

test("mapFixture derives home/away + orientation + gameState", () => {
  const mapped = mapFixture({
    Ts: 1783767600000,
    StartTime: 1783818000000,
    Competition: "World Cup",
    Participant1Id: 1489,
    Participant1: "Argentina",
    Participant2Id: 3099,
    Participant2: "Switzerland",
    FixtureId: 18222446,
    Participant1IsHome: true,
    GameState: 1,
  });
  assert.ok(mapped);
  assert.equal(mapped.home, "Argentina");
  assert.equal(mapped.away, "Switzerland");
  assert.equal(mapped.kickoff, 1783818000000);
  assert.equal(mapped.competition, "World Cup");
  assert.equal(mapped.participant1IsHome, true);
  assert.equal(mapped.gameState, 1);
});

// ---- propFromOdds (the live loop) ----

test("propFromOdds builds a GOAL-settleable home prop from the real InRunning:false 1X2 record", () => {
  // The real captured 1X2 record has InRunning:false even though it's mid-match,
  // so propFromOdds must NOT gate on InRunning.
  const payload = mapOdds(SAMPLE_ODDS[0]);
  assert.ok(payload);
  const prop = propFromOdds(payload, 600, {
    homeName: "France",
    participant1IsHome: true,
  });
  assert.ok(prop, "expected a prop from the in-play 1X2 record");
  assert.equal(prop.team, "home");
  // part1 Pct fraction ~0.32154, inside the 0.01..0.99 clamp.
  assert.ok(prop.yesPct > 0.01 && prop.yesPct < 0.99);
  assert.ok(Math.abs(prop.yesPct - 0.32154) < 1e-6);
  assert.ok(prop.label.includes("France"));
  assert.ok(prop.label.includes("10 min"));
});

test("propFromOdds orients to part2 when participant1IsHome is false", () => {
  const payload = mapOdds(SAMPLE_ODDS[0]);
  assert.ok(payload);
  const prop = propFromOdds(payload, 600, {
    homeName: "Spain",
    participant1IsHome: false,
  });
  assert.ok(prop);
  // part2 Pct fraction ~0.23849
  assert.ok(Math.abs(prop.yesPct - 0.23849) < 1e-6);
  assert.ok(prop.label.includes("Spain"));
});

test("propFromOdds rejects a non-1X2 market", () => {
  const payload = mapOdds(SAMPLE_ODDS[2]); // ASIANHANDICAP
  assert.ok(payload);
  const prop = propFromOdds(payload, 600, { homeName: "France", participant1IsHome: true });
  assert.equal(prop, null);
});
