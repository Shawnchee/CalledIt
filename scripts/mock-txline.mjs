// mock-txline.mjs — a tiny local stand-in for the TxLINE odds + scores SSE
// endpoints, so `/room?feed=live` is fully testable WITHOUT real credentials.
//
// It emits recorded OddsPayload frames (opening calls) on /odds and ScoreEvent
// frames (settling them) on /scores, on the same SSE wire shape the real TxLINE
// API uses (id: + data: lines, Bearer/X-Api-Token headers accepted and ignored).
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
// Then open (a short call window keeps the whole timeline testable in ~45s):
//   http://localhost:3000/room?feed=live&fixtureId=1042026&window=8
//
// You'll see: a call open from the odds feed (a 2nd odds frame is deduped while
// it's open) → a GOAL settle it YES → the next call go NO when no goal lands in
// its window → a MATCH_ODDS call left honestly "settling…" → a final GOAL settle
// YES → FULL-TIME. Nothing is faked: settlement comes only from scores frames.

import http from "node:http";

const PORT = Number(process.env.PORT) || 8787;

const odds = (t, superType, priceNames, pct, fixtureId) => ({
  at: t,
  payload: {
    FixtureId: fixtureId,
    Ts: Date.now(),
    Bookmaker: "MockBook",
    SuperOddsType: superType,
    InRunning: true,
    PriceNames: priceNames,
    Prices: pct.map((p) => Number((1 / Math.max(0.01, p)).toFixed(2))),
    Pct: pct,
  },
});

const score = (t, type, homeScore, awayScore, minute, label) => ({
  at: t,
  event: { FixtureId: 0, Ts: Date.now(), minute, type, homeScore, awayScore, label },
});

// Odds timeline (ms from connection). Windows below assume ?window=8.
function oddsTimeline(fixtureId) {
  return [
    odds(1000, "NEXT_GOAL", ["Home", "Away"], [0.31, 0.42], fixtureId), // opens call #1
    odds(3000, "NEXT_GOAL", ["Home", "Away"], [0.33, 0.40], fixtureId), // deduped (call #1 still open)
    odds(11000, "NEXT_GOAL", ["Home", "Away"], [0.28, 0.45], fixtureId), // opens call #2 (no goal → NO)
    odds(21000, "MATCH_ODDS", ["Home", "Draw", "Away"], [0.55, 0.25, 0.2], fixtureId), // opens call #3 (settling…)
    odds(31000, "NEXT_GOAL", ["Home", "Away"], [0.4, 0.35], fixtureId), // opens call #4 (goal → YES)
  ];
}

// Scores timeline (ms from connection).
function scoresTimeline(fixtureId) {
  const withFixture = (s) => ({ ...s, event: { ...s.event, FixtureId: fixtureId } });
  return [
    score(1500, "KICKOFF", 0, 0, 1, "Kick-off"),
    score(6000, "GOAL", 1, 0, 12, "Álvarez 12'"), // settles call #1 YES
    score(36000, "GOAL", 2, 0, 60, "Rodrygo 60'"), // settles call #4 YES
    score(44000, "FULL_TIME", 2, 0, 90, "Full time"),
  ].map(withFixture);
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
  const fixtureId = Number(url.searchParams.get("fixtureId")) || 1042026;

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
  console.log(`  odds:   http://localhost:${PORT}/odds?fixtureId=1042026`);
  console.log(`  scores: http://localhost:${PORT}/scores?fixtureId=1042026`);
  console.log(
    "\nPoint the proxy at it:\n" +
      "  TXLINE_JWT=dev TXLINE_API_TOKEN=dev \\\n" +
      `  TXLINE_ODDS_URL=http://localhost:${PORT}/odds \\\n` +
      `  TXLINE_SCORES_URL=http://localhost:${PORT}/scores npm run dev\n` +
      "\nthen open http://localhost:3000/room?feed=live&fixtureId=1042026&window=8",
  );
});
