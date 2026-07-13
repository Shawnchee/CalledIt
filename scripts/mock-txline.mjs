// mock-txline.mjs — a tiny local stand-in for the TxLINE odds + scores SSE
// endpoints, so `/room?feed=live` is fully testable WITHOUT real credentials.
//
// Frames below are REAL devnet-shaped records (captured 2026-07-12 from
// https://txline-dev.txodds.com — see GROUND-TRUTH.md): the odds frames are
// StablePrice 1X2 records (France v Spain, fixture 18237038) with `InRunning`
// flipped true (the live capture happened to be pregame), and the scores
// frames are real event records (Argentina v Switzerland, fixture 18222446)
// re-timed for the mock timeline. This is NOT the old invented
// {type,homeScore,awayScore,minute,label} shape — it's what
// src/lib/txline/mapping.ts actually has to parse.
//
// ── Run it ────────────────────────────────────────────────────────────────
//   node scripts/mock-txline.mjs                      # listens on :8787
//   PORT=9000 node scripts/mock-txline.mjs            # custom port
//
// ── Point the app's proxy at it (server env, in a second terminal) ─────────
//   TXLINE_JWT=dev \
//   TXLINE_API_TOKEN=dev \
//   TXLINE_ODDS_URL=http://localhost:8787/odds \
//   TXLINE_SCORES_URL=http://localhost:8787/scores \
//   npm run dev
//
// Then open (a short call window keeps the whole timeline testable in ~40s):
//   http://localhost:3000/room?feed=live&fixtureId=18222446&window=8
//
// There is deliberately NO /fixtures endpoint here: the app's fixtures fetch
// fails and LiveGameController falls back to defaults (participant1IsHome=true,
// placeholder team names), which is the path the goal records below target.
//
// You'll see: a "<home> to score in the next N min?" call open from the odds
// feed (a 2nd odds frame is deduped while it's open) → a home GOAL inside the
// window settle it YES → the next call, with no goal in its window, settle NO
// → a final home GOAL settle YES → FULL-TIME. Nothing is faked: settlement
// comes only from real-shaped scores frames, and only from a home goal whose
// Ts is after the call opened.

import http from "node:http";

const PORT = Number(process.env.PORT) || 8787;
const DEFAULT_FIXTURE_ID = 18222446;

// A real StablePrice 1X2 record shape (see probe-out/sample-odds.json). The
// real capture had `InRunning: false` even mid-match, so we mirror that here —
// propFromOdds must (and does) NOT gate on it. The `-stab` MessageId marks it
// as a StablePrice record, which propFromOdds requires.
const odds = (t, fixtureId, prices, pct, messageId) => ({
  at: t,
  payload: {
    FixtureId: fixtureId,
    MessageId: messageId,
    Ts: Date.now(),
    Bookmaker: "TXLineStablePriceDemargined",
    BookmakerId: 10021,
    SuperOddsType: "1X2_PARTICIPANT_RESULT",
    GameState: null,
    InRunning: false,
    MarketParameters: null,
    MarketPeriod: "half=1",
    PriceNames: ["part1", "draw", "part2"],
    Prices: prices,
    Pct: pct,
  },
});

// A real scores/events record shape (see probe-out/sample-scores.json),
// re-timed and re-scored for the mock timeline. `Score` is always populated
// here (unlike some real Action kinds, e.g. kickoff/free_kick) so every frame
// below survives mapScoreEvent's "no Score → drop" rule. `Participant: 1` +
// `Participant1IsHome: true` ⇒ the event maps to team "home", which is what
// the goal frames need to settle the (home) props YES.
const score = (t, action, statusId, seconds, homeGoals, awayGoals, fixtureId) => ({
  at: t,
  event: {
    FixtureId: fixtureId,
    Participant1IsHome: true,
    Participant1Id: 1489,
    Participant2Id: 3099,
    Action: action,
    Id: 1000 + t,
    Ts: Date.now(),
    Seq: t,
    StatusId: statusId,
    Clock: { Running: true, Seconds: seconds },
    Score: {
      Participant1: { Total: { Goals: homeGoals } },
      Participant2: { Total: { Goals: awayGoals } },
    },
    Participant: 1,
  },
});

// Odds timeline (ms from connection). Windows below assume ?window=8.
function oddsTimeline(fixtureId) {
  return [
    odds(1000, fixtureId, [3110, 2273, 4193], ["32.154", "43.995", "23.849"], `mock:1-${fixtureId}-stab`), // opens call #1 (goal → YES)
    odds(3000, fixtureId, [2980, 2350, 4310], ["33.557", "42.553", "23.202"], `mock:2-${fixtureId}-stab`), // deduped (call #1 still open)
    odds(12000, fixtureId, [2412, 3438, 3396], ["41.459", "29.087", "29.446"], `mock:3-${fixtureId}-stab`), // opens call #2 (no goal → NO)
    odds(23000, fixtureId, [1725, 2379, 5210], ["57.971", "32.60", "9.83"], `mock:4-${fixtureId}-stab`), // opens call #3 (goal → YES)
  ];
}

// Scores timeline (ms from connection). Home goals inside a call's window
// settle it YES; the gap after call #2 opens (12s → 20s) has no goal, so it
// settles NO. game_finalised ends the match. Goal Ts is always after the call
// it settles opened, satisfying onScore's Ts guard.
function scoresTimeline(fixtureId) {
  return [
    score(5000, "goal", 9, 720, 1, 0, fixtureId), // 12' — home goal, settles call #1 YES
    score(27000, "goal", 9, 3600, 2, 0, fixtureId), // 60' — home goal, settles call #3 YES
    score(38000, "game_finalised", 100, 5400, 2, 0, fixtureId), // full time
  ];
}

function openSse(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });
  res.write(": connected\n\n");
}

function emit(res, id, obj) {
  res.write(`id: ${id}\ndata: ${JSON.stringify(obj)}\n\n`);
}

function playTimeline(res, frames, pick) {
  let seq = 0;
  const timers = frames.map((f) =>
    setTimeout(() => emit(res, `evt-${++seq}`, pick(f)), f.at),
  );
  // keep the connection open (avoid EventSource auto-reconnect replaying the timeline)
  const ping = setInterval(() => res.write(": ping\n\n"), 20000);
  res.on("close", () => {
    timers.forEach(clearTimeout);
    clearInterval(ping);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const fixtureId = Number(url.searchParams.get("fixtureId")) || DEFAULT_FIXTURE_ID;

  if (url.pathname === "/odds") {
    openSse(res);
    playTimeline(res, oddsTimeline(fixtureId), (f) => f.payload);
    return;
  }
  if (url.pathname === "/scores") {
    openSse(res);
    playTimeline(res, scoresTimeline(fixtureId), (f) => f.event);
    return;
  }
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found", try: ["/odds", "/scores"] }));
});

server.listen(PORT, () => {
  console.log(`mock-txline SSE server → http://localhost:${PORT}`);
  console.log(`  odds:   http://localhost:${PORT}/odds?fixtureId=${DEFAULT_FIXTURE_ID}`);
  console.log(`  scores: http://localhost:${PORT}/scores?fixtureId=${DEFAULT_FIXTURE_ID}`);
  console.log(
    "\nPoint the proxy at it:\n" +
      "  TXLINE_JWT=dev TXLINE_API_TOKEN=dev \\\n" +
      `  TXLINE_ODDS_URL=http://localhost:${PORT}/odds \\\n` +
      `  TXLINE_SCORES_URL=http://localhost:${PORT}/scores npm run dev\n` +
      `\nthen open http://localhost:3000/room?feed=live&fixtureId=${DEFAULT_FIXTURE_ID}&window=8`,
  );
});
