# CalledIt — Technical Documentation

> **TxLINE World Cup Hackathon · Track B — Consumer & Fan Experiences**
> **Live:** https://calledit-chi.vercel.app · **Repo:** https://github.com/Shawnchee/CalledIt
> **Status:** shipped & deployed (Solana devnet)

*Call it before the market does. Prove it. Settle the group chat.*

---

## 1. Submission form answers (copy-paste ready)

These are the exact answers for each field of the World Cup Track submission form.

### Link to Your Submission (most useful link)
```
https://calledit-chi.vercel.app
```

### Tweet Link
> Not published yet. Optional field — leave blank, or paste a tweet announcing CalledIt once posted.

### Project Title
```
CalledIt
```

### Briefly explain your Project
```
CalledIt is a live, free-to-play World Cup game where you call what happens next in a
match — but not against your mates, against the live betting market. Each call is stamped
on-chain BEFORE the moment (your side, the market's implied %, and the block time), so
"I called it" stops being a group-chat boast and becomes a provable receipt. Points are
market-weighted: back the longshot the market doubts and you're right, it pays big; back
a lock and it pays little. The result is the one thing football fans have never had — a
provable scoreboard of who actually reads the game. TxLINE's live in-play odds are the
opponent, the difficulty engine, and the settlement source; Solana is the anti-hindsight
proof. Points-only, no wager, no payout.
```

### Link to your live & working MVP
```
https://calledit-chi.vercel.app
```

### Link to Your Live Demo Video
> **NEEDS YOUR INPUT** — record the ≤5-min walkthrough (script in `demo-script.md` / `DEMO.md`)
> and paste the YouTube/Loom link here. This is heavily judged; do not leave it blank.

### Project's Public Repository Link
```
https://github.com/Shawnchee/CalledIt
```

### Link to your Project's Technical Documentation
```
https://github.com/Shawnchee/CalledIt/blob/main/technical_documentation.md
```

### Link to your Project's X Profile or a tweet about it
> Not published yet. Optional — paste a tweet or project X profile if/when you post one.

### Share your team's experience using the TxLINE API (see §10 for the full version)
```
The odds SSE is a great primitive — InRunning + Pct[] map almost 1:1 onto a "call the next
N minutes vs the market" mechanic, and we built the entire scoring engine on Pct[]. The
best affordance was Last-Event-ID resume, which made SSE reconnection trivial. Biggest
friction: the ~60s free/World-Cup sampling cadence isn't surfaced loudly enough in the
quickstart — it's the single most architecture-shaping fact and it (correctly) killed our
first sub-second "belief-meter" idea, so builders should learn it before designing the
interaction model, not after. We also had to infer payload shapes (PriceNames/Prices/Pct
alignment, SuperOddsType values) and model the scores/events schema from the worldcup docs;
a couple of real example frames per market type, plus a documented scores schema next to the
odds one and clarity on the two auth tokens (Bearer JWT vs X-Api-Token — which is long-lived
vs rotating, and their TTLs), would each save every builder an afternoon.
```

### Anything Else?
```
- Trust model is documented honestly (§6): the on-chain TIMESTAMP is fully trustless (this
  is the anti-hindsight proof and the whole point of the product); the on-chain market_pct
  is app-attested today, a deliberate documented scope cut. The natural next step is a
  CPI/read into a sibling txoracle program's Merkle-anchored roots so market_pct gets the
  same trustless guarantee created_at already has.
- The live path is fully wired but the demo defaults to a deterministic recorded replay
  because World Cup matches end before judging. Both paths run through the identical
  openProp()/resolveProp() seam, so "live" is not a separate untested code path. Drop in
  TXLINE_JWT + TXLINE_API_TOKEN and open /room?feed=live to switch — one step (§7).
- The 7 named threat-model invariants (INV-1..7) are executable tests (cargo test), not
  just prose. All three program instructions are verified on devnet with explorer links (§5).
```

---

## 2. Overview

**The problem.** Everyone in the group chat is a genius *after* the goal — *"I said he'd score,"
"I called that red."* Nobody remembers, nobody can prove it, and the loudest hindsight-merchant
wins. This is *hindsight bias*, the "I-knew-it-all-along effect." There is no scoreboard for who
actually reads the game.

**The product.** CalledIt is a live play-along game. You join a room (a link dropped in the group
chat), and as the match unfolds, calls open — *"Next 10 min — Argentina to score? Market says 27%."*
You tap YES/NO **before the window closes**, and that call is written to Solana as an immutable,
timestamped receipt. TxLINE's live odds settle the call, and points are market-weighted so that
calling what the market doubted scores big. A live crew leaderboard exposes the hindsight-merchants.

**Why it's not just another prediction app.** The friends-predict-match-events lane is a graveyard
(tackl, Tippr, Kicktipp, Pick'Em Sports, and the official FIFA 2026 app all ship "predict events +
leaderboard"). CalledIt is different on the one axis only TxLINE enables: **you play against the
live in-play market.** That makes:
- **TxLINE load-bearing** — the bookmaker's live odds are the opponent, the difficulty engine, *and*
  the settlement source, not a garnish on a score feed any API could provide.
- **Solana load-bearing** — the pre-event on-chain receipt is the literal mechanism that kills
  hindsight bias: proof you called it *before* it happened.

**Track fit (clean Track B).** Points-only, no wager, no payout — free-to-play, like "the game
without the gamble." Keeps it distinct from the betting tracks and dodges gambling warnings.

---

## 3. Architecture

```
                       ┌──────────────────────── TxLINE (txodds) ─────────────────────────┐
                       │   Odds SSE  (in-play implied %)      Scores/Events SSE (GOAL/…)   │
                       └───────────┬───────────────────────────────────┬──────────────────┘
                                   │ Bearer JWT + X-Api-Token           │  (browser EventSource
                                   │ (server-side only)                 │   can't set headers)
                       ┌───────────▼───────────┐          ┌─────────────▼──────────────┐
   Next.js server →    │ /api/txline/stream    │          │ /api/txline/scores          │
   (SSE proxies)       │  → FeedEvent{odds}    │          │  → FeedEvent{score}         │
                       └───────────┬───────────┘          └─────────────┬──────────────┘
                                   │  same-origin guard, concurrency cap, id: resume
                       ┌───────────▼────────────────────────────────────▼──────────────┐
   Browser (client) →  │  LiveTxlineFeed → LiveGameController → GameEngine              │
                       │     odds OPEN calls (openProp)   scores SETTLE calls (resolveProp)
                       │                        │                                       │
                       │            market-weighted scoring (mirror of on-chain formula)│
                       └───────────┬───────────────────────────────────────────────────┘
                                   │  record_call  (before window close)
                       ┌───────────▼───────────┐
   Solana devnet →     │  calledit program     │   CallReceipt PDA  {player, match, prop,
                       │  record_call/settle/  │   side, market_pct, created_at, window_end,
                       │  initialize_config    │   outcome, points}
                       └───────────────────────┘   → /receipt/[address] branded proof page + OG image
```

**One engine, two feed sources.** The deterministic recorded replay (for the demo) and the live
TxLINE feed both drive the *identical* `openProp()` / `resolveProp()` seam in `GameEngine`
(`src/lib/game/engine.ts`). Live is therefore not a separate, untested path — it is the same engine
fed by a different source.

Key modules:
| Concern | File |
|---|---|
| Odds SSE proxy (adds auth, forwards `id:` resume, normalises frames) | `src/app/api/txline/stream/route.ts` |
| Scores/events SSE proxy (mirror → `{kind:"score"}`) | `src/app/api/txline/scores/route.ts` |
| Live-availability probe (`{live:boolean}`, no secrets leaked) | `src/app/api/txline/status/route.ts` |
| Shared proxy plumbing (same-origin guard, concurrency cap, SSE parse) | `src/lib/txline/proxy.ts`, `src/lib/txline/sse.ts` |
| Client adapter + odds→prop mapper + `LiveGameController` | `src/lib/txline/live-feed.ts`, `src/lib/txline/mapping.ts` |
| Game engine / state machine | `src/lib/game/engine.ts`, `src/lib/game/use-game.ts` |
| Market-weighted scoring (on-chain mirror) | `src/lib/game/scoring.ts` |
| Deterministic replay for the demo | `src/lib/game/replay-match.ts` |
| Solana client (decode receipts, career history via `getProgramAccounts`) | `src/lib/solana/calledit-client.ts` |

---

## 4. TxLINE integration

CalledIt consumes two TxLINE Server-Sent-Event streams.

| Use | Endpoint | Fields consumed |
|-----|----------|-----------------|
| **Generate calls + set difficulty** | Odds SSE — `GET https://txline.txodds.com/api/odds/stream` (headers `Authorization: Bearer <JWT>`, `X-Api-Token`; query `fixtureId`; `Last-Event-ID` resume) | `InRunning` (in-play flag), `Pct[]` (implied %), `PriceNames[]`, `Prices[]`, `SuperOddsType`, `Ts`, `FixtureId` |
| **Settle calls** | Scores/events SSE — `GET <TXLINE_SCORES_URL>` (same auth, same resume) | `type` (GOAL/…), `homeScore`, `awayScore`, `minute`, `label` |

**Why proxies.** A browser `EventSource` cannot set request headers, so credentials can't ride on
the client's SSE connection. Both feeds go through same-origin Next.js server proxies that inject
the credentials, enforce a same-origin guard + a concurrency cap, forward `id:` for `Last-Event-ID`
resume, and normalise every frame into a single `FeedEvent` type the client understands.

**The mechanic follows the cadence.** The free / World-Cup tier samples odds **every ~60s**, not
per-tick. That is exactly why the interaction is "call the next N minutes vs the market" rather than
a sub-second belief meter — the cadence shaped the design, not the other way around.

**Credential pipeline (devnet, free).** `guest JWT → on-chain subscribe tx → token/activate`.
`npm run txline:subscribe` broadcasts a real devnet `subscribe` tx, fetches a guest JWT, signs the
binding message, activates the token, and writes `TXLINE_NETWORK` / `TXLINE_JWT` / `TXLINE_API_TOKEN`
into `.env.local` (chmod 600; the token value is never printed). Full steps: `docs/txline-setup.md`.

---

## 5. Solana program — `calledit` (devnet)

An Anchor program that turns each call into a tamper-evident, timestamped receipt and computes
market-weighted points deterministically on-chain (so the settlement authority can't inflate scores).

| | |
|---|---|
| Program ID | [`BeR8b7y7c4offbz2fqNj2N1Y5zoEqkY9aYgBVc7NSdM1`](https://explorer.solana.com/address/BeR8b7y7c4offbz2fqNj2N1Y5zoEqkY9aYgBVc7NSdM1?cluster=devnet) |
| Config PDA | `ERqWzBnwMsj9tK9fA4DTebya9hBtc3DLBogybTL7gFjm` |
| Design review | `.solana-roast/` — Code Safety 9/10 · Launch Readiness 6/10 |

### Instructions

1. **`initialize_config`** — one-time, **upgrade-authority-gated**. Creates the singleton `Config`
   PDA (seed `"config"`) and sets the settlement (oracle) authority allowed to resolve calls.
2. **`record_call(match_id, prop_id, side, market_pct, window_end)`** — **permissionless** (the
   player signs and pays rent). Creates a `CallReceipt` PDA at
   `["call", player, match_id, prop_id]`. Validates `side ∈ {NO, YES}`, `1 ≤ market_pct ≤ 9999`
   (basis points), and crucially **`Clock::now < window_end`** — the call must land *before* the
   window closes, which is what makes it an anti-hindsight proof rather than a boast. Stamps
   `created_at` with the on-chain block time.
3. **`settle_call(correct)`** — **authority-gated** (`has_one` against `Config.authority`). Marks
   the outcome and computes points **on-chain**.

### Accounts

**`CallReceipt`** `{ player, match_id, prop_id, side, market_pct, created_at, window_end, settled,
outcome, points, bump }`. The `created_at < window_end` relationship is the receipt's whole value.

### On-chain scoring (deterministic, non-inflatable)

```
points = correct ? min(POINTS_BASE / prob_of_your_side_bps, POINTS_MAX) : 0
POINTS_BASE = 1_000_000   POINTS_MAX = 10_000   (bps denominator = 10_000)
```

Your payout is the market's *fair odds* for the side you took. A correct YES at 27% (2700 bps)
scores `1_000_000 / 2700 = 370`. A correct lock at 80% scores far less. This exact formula is
mirrored 1:1 in the client (`src/lib/game/scoring.ts`) for previews, but the authoritative number
is computed on-chain.

### Verified on devnet (all three instructions)

- `record_call` → receipt created — [`3bd17fga…RKt2v`](https://explorer.solana.com/tx/3bd17fga1BuBRyz8Q8uXqG611kf2bpAiGjWnKjvUBBVBaFJeNhuSLYz7dhCguDA7nHa2XmcKm9fH5UJLhnLRKt2v?cluster=devnet)
- `initialize_config` → upgrade-authority gate passed — [`3Kzbtgzq…W1bK`](https://explorer.solana.com/tx/3Kzbtgzq8f1EDuaSSUmYMvsUyWYw7XWyz4nChph7zB7NpqCombTL1rew9rnVTNhQ9A2RG7XLEFek8JRDaghhW1bK?cluster=devnet)
- `settle_call` → **points = 370 computed on-chain** for YES @ 27% (1,000,000 ÷ 2700) — [`5siJd29e…hXKUE`](https://explorer.solana.com/tx/5siJd29enQjKCm4DxFe4T3us5YjAMYnZXASy6LApwrk5m2ysUZE16fL58h75YiabdRsL2YU6zCR9e54gX96hXKUE?cluster=devnet)

### Threat-model invariants (executable, not prose)

`.solana-roast/` names seven invariants; each is a passing `cargo test`
(`calledit/programs/calledit/tests/calledit.rs`):

| | Invariant |
|---|---|
| INV-1 | A call whose window already closed is rejected (anti-hindsight). |
| INV-2 / INV-3 | `market_pct` and `side` are validated at record time. |
| INV-4 | A call can only be settled once. |
| INV-5 | On-chain scoring math is deterministic — the authority can't inflate points. |
| INV-6 | Only the config authority may settle (`has_one` gate). |
| INV-7 | Only the program's upgrade authority may bootstrap `Config`. |

### The receipt as a page — `/receipt/[address]`

Every `CallReceipt` PDA has a branded page (not just a raw Explorer link). It fetches and decodes
the account directly (`fetchReceipt` / `getPlayerReceipts`) — **no database**: `getProgramAccounts`
+ a `memcmp` on `player` is the entire "career history" backend — and renders a dynamic `next/og`
image so the link unfurls as a real card in a group chat. Wired in from the call card, the "Your
receipts"/career list, and the full-time share button.

---

## 6. Trust model (honest note)

The on-chain **timestamp** (`created_at`, the block time) is **fully trustless** — it is exactly
what makes a call provable instead of a hindsight boast, and it is the thing the whole product is
built around.

The on-chain **`market_pct`**, however, is **app-attested today**: the client reads it off the live
TxLINE odds snapshot and passes it into `record_call` as a plain argument; nothing on-chain
currently checks that number against what TxLINE actually quoted at that moment. This is a
deliberate, documented scope cut for the hackathon, not an oversight — the receipt page surfaces the
odds' provenance (TxLINE `Ts` / `MessageId` / StablePrice marker) so the claim is visible and
inspectable. Verifying it on-chain is the `txoracle` program's job (a sibling project's Merkle-root
anchoring). The natural next step is a CPI/read into `txoracle`'s anchored roots at `record_call`
time, so `market_pct` gets the same trustless guarantee `created_at` already has.

---

## 7. Going live (one step)

The same `GameEngine` runs both the demo replay and the live feed.

- **Default (no creds):** `/api/txline/status` returns `{live:false}`, the proxies return `503`, and
  the room runs the recorded replay. Badge: **`REPLAY · recorded TxLINE timeline`**.
- **Drop in creds:** set `TXLINE_JWT` + `TXLINE_API_TOKEN` (server-side only). `status` flips to
  `{live:true}` and **`/room?feed=live&fixtureId=<id>`** subscribes the real feeds: each odds
  snapshot opens a call, a `GOAL` inside the window settles a `NEXT_GOAL` call **YES** (else **NO**
  at window end). Markets a mid-match event can't resolve stay visibly "settling…" — **live mode
  never fabricates an outcome**. Badge: **`LIVE · TxLINE`**.
- **Test without real creds:** `scripts/mock-txline.mjs` is a local SSE server that replays recorded
  `OddsPayload` + `ScoreEvent` frames, exercising the whole live path end-to-end:
  ```bash
  node scripts/mock-txline.mjs                       # terminal 1 (:8787)
  TXLINE_JWT=dev TXLINE_API_TOKEN=dev \
  TXLINE_ODDS_URL=http://localhost:8787/odds \
  TXLINE_SCORES_URL=http://localhost:8787/scores \
  npm run dev                                        # terminal 2
  # open http://localhost:3000/room?feed=live&fixtureId=1042026&window=8
  ```

The demo defaults to the recorded replay because World Cup matches end before judging — and solo
play (you vs the market) is a complete game on its own, which also fixes the "fake friends in a
recording" problem that sinks most social-app demos (a simulated crew, including a hindsight-merchant
bot, makes a room of one lively).

---

## 8. Tech stack

- **Frontend:** Next.js 16.2 (App Router, React 19), Tailwind v4. "Broadsheet" bright editorial UI —
  paper/ink, hairline cards, cobalt brand; green/red reserved for YES/NO, amber for the market.
- **Solana:** `@solana/web3.js`, wallet adapter (Phantom et al.), `@coral-xyz/anchor` 0.32; Anchor
  program deployed to **devnet**.
- **Data:** TxLINE odds + scores SSE, consumed via same-origin server proxies.
- **Tests:** LiteSVM/`cargo test` for the program invariants; `node --test` for the TxLINE mapping
  and SSE parsing (`src/lib/txline/*.test.ts`).

---

## 9. Deployment

**Live (production):** https://calledit-chi.vercel.app — deployed on Vercel from `main`, auto-redeploys
on push. Zero env vars required for the demo path (Solana uses public devnet RPC; the program ID is
baked in). Optional env to light up extras: `NEXT_PUBLIC_SOLANA_RPC` (dedicated devnet RPC) and
`TXLINE_JWT` / `TXLINE_API_TOKEN` (server-side only) for the live feed. `npm run build` is clean.

---

## 10. Feedback on the TxLINE API experience

**What we liked most**
- **The odds SSE is a great primitive.** `InRunning` + `Pct[]` map almost 1:1 onto a "call the next
  N minutes vs the market" mechanic — we built the entire scoring engine on `Pct[]`.
- **`Last-Event-ID` resume is excellent** — it made SSE reconnection trivial. More of this.

**Where we hit friction**
- **Surface the ~60s sampling cadence loudly in the quickstart.** It is the single most
  architecture-shaping fact — it (correctly) killed our first sub-second "belief-meter" idea.
  Builders should learn it *before* they design an interaction model, not after.
- **Publish a sample `OddsPayload` and a scores/events payload in the quickstart.** We had to infer
  field shapes (`PriceNames` / `Prices` / `Pct` alignment, `SuperOddsType` values); a couple of real
  example frames per market type would save everyone an afternoon.
- **Clarify the two auth tokens.** Bearer JWT *and* `X-Api-Token` — document which is long-lived vs
  rotating, and their TTLs, so people handle refresh correctly.
- **Document the scores/events SSE schema next to the odds one.** We modelled `ScoreEvent` from the
  worldcup docs + inference; a canonical schema would speed settlement integration.

---

## 11. Local development

```bash
npm install
npm run dev            # http://localhost:3000  (runs the recorded replay by default)
npm run build          # production build
npm run test           # node --test — TxLINE mapping + SSE parsing
# on-chain program:
cd calledit && cargo test   # INV-1..7 invariant tests
```

Live TxLINE feed setup (devnet credential pipeline): see `docs/txline-setup.md`.
Demo walkthrough / shot list: see `DEMO.md` and `demo-script.md`.
