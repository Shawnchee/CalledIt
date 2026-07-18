# CalledIt — Submission Packet

**Track B · Consumer & Fan Experiences** — TxLINE World Cup Hackathon
**Live:** https://calledit-chi.vercel.app · **Repo:** https://github.com/Shawnchee/CalledIt

---

## Core idea

Everyone in the group chat is a genius *after* the goal. CalledIt is a live play-along where you
**call what happens next against the live betting market** — and every call is **timestamped
on-chain before the moment**, so "I called it" becomes provable instead of a hindsight boast.
The crew gets a live leaderboard of who actually reads the game. Free-to-play, points-only, no wager.

**Why it's not another prediction app:** it's the only one where the **bookmaker's live in-play
odds are your opponent and your difficulty engine**. Your payout is the market's *fair odds* for
the side you took — calling what the market doubts pays more, locks pay little. That mechanic is
impossible without TxLINE, and the on-chain receipt is the literal mechanism that kills hindsight bias.

## Highlights

- **Market-as-opponent scoring**, computed deterministically on-chain (the settlement authority
  can't inflate points): `points = POINTS_BASE / market_prob_of_your_side`, capped.
- **On-chain anti-hindsight receipts** — `record_call` writes `{side, market %, block-time}` to
  Solana **before** the window closes (`created_at < window_end` enforced on-chain).
- **Live crew leaderboard + moments ticker** that move with the pitch; a simulated crew (incl. a
  hindsight-merchant bot) makes a room of one lively and fixes the "fake friends in a recording" demo problem.
- **Solana wallet sign-up**; **/solana-roast**'d program (front-running on init fixed) deployed to devnet.
- **"Broadsheet" UI** — bright editorial: paper, ink, hairline cards, a confident cobalt brand;
  green/red reserved for the YES/NO calls, amber for the market. Flat, no glow.

## TxLINE endpoints used

| Use | Endpoint | Fields consumed |
|-----|----------|-----------------|
| Generate calls + set difficulty | **Odds SSE** — `GET https://txline.txodds.com/api/odds/stream` (headers `Authorization: Bearer <JWT>`, `X-Api-Token`; query `fixtureId`; `Last-Event-ID` resume) | `InRunning`, `Pct[]` (implied %), `PriceNames[]`, `Prices[]`, `SuperOddsType`, `Ts`, `FixtureId` |
| Settle calls | **Scores/events SSE** — `GET <TXLINE_SCORES_URL>` (same auth, same resume) | `type` (GOAL/…), `homeScore`, `awayScore`, `minute`, `label` |

Integration code:
- Odds proxy (adds auth, forwards `id:` for resume, normalises to `FeedEvent`): [`src/app/api/txline/stream/route.ts`](./src/app/api/txline/stream/route.ts)
- Scores proxy (mirror of the odds proxy → `{kind:"score", event}`): [`src/app/api/txline/scores/route.ts`](./src/app/api/txline/scores/route.ts)
- Live-availability probe (`{live:boolean}`, no secrets): [`src/app/api/txline/status/route.ts`](./src/app/api/txline/status/route.ts)
- Shared proxy plumbing (same-origin guard, concurrency cap, SSE frame parser) reused by both proxies: [`src/lib/txline/proxy.ts`](./src/lib/txline/proxy.ts) + [`src/lib/txline/sse.ts`](./src/lib/txline/sse.ts)
- Client adapter + odds→prop mapper + **`LiveGameController`** (odds open calls, scores settle them): [`src/lib/txline/live-feed.ts`](./src/lib/txline/live-feed.ts)
- Deterministic replay for the demo (matches end before judging): [`src/lib/game/replay-match.ts`](./src/lib/game/replay-match.ts)

> ⚠️ Free / World-Cup tier samples odds **every ~60s** — exactly why the mechanic is "call the next
> N minutes", not per-tick.

### Going live is literally one step

The **same `GameEngine`** runs both paths — the replay ticker and the live feed drive the identical
`openProp()` / `resolveProp()` seam, so live isn't a separate, untested code path.

- **Default (no creds):** [`/api/txline/status`](./src/app/api/txline/status/route.ts) returns
  `{live:false}`, the proxies return `503`, and the room runs the recorded replay. The scoreboard
  badge honestly reads **`REPLAY · recorded TxLINE timeline`**.
- **Drop in creds:** set `TXLINE_JWT` + `TXLINE_API_TOKEN` (server-side only). `status` flips to
  `{live:true}`, the room auto-suggests live, and **`/room?feed=live&fixtureId=<id>`** subscribes the
  real feeds: each odds snapshot opens a call (`propFromOdds`), a `GOAL` inside the window settles a
  `NEXT_GOAL` call **YES** (else **NO** at window end); markets a mid-match event can't resolve stay
  visibly "settling…" — **no outcome is ever fabricated in live mode**. The badge reads **`LIVE · TxLINE`**.
- **Test it without real creds:** [`scripts/mock-txline.mjs`](./scripts/mock-txline.mjs) is a local SSE
  server that replays recorded `OddsPayload` + `ScoreEvent` frames. Run it, point the proxies at it,
  and the whole live path (open → dedupe → goal-settles-YES → no-goal-settles-NO → full-time) runs
  end-to-end:
  ```bash
  node scripts/mock-txline.mjs                       # terminal 1  (:8787)
  TXLINE_JWT=dev TXLINE_API_TOKEN=dev \
  TXLINE_ODDS_URL=http://localhost:8787/odds \
  TXLINE_SCORES_URL=http://localhost:8787/scores \
  npm run dev                                        # terminal 2
  # open http://localhost:3000/room?feed=live&fixtureId=1042026&window=8
  ```

## Solana (devnet)

| | |
|---|---|
| Program (`calledit`) | [`BeR8b7y7c4offbz2fqNj2N1Y5zoEqkY9aYgBVc7NSdM1`](https://explorer.solana.com/address/BeR8b7y7c4offbz2fqNj2N1Y5zoEqkY9aYgBVc7NSdM1?cluster=devnet) |
| Example `record_call` receipt | [`3bd17fga…RKt2v`](https://explorer.solana.com/tx/3bd17fga1BuBRyz8Q8uXqG611kf2bpAiGjWnKjvUBBVBaFJeNhuSLYz7dhCguDA7nHa2XmcKm9fH5UJLhnLRKt2v?cluster=devnet) |
| Instructions | `record_call` (permissionless receipt), `settle_call` (authority-gated, points on-chain), `initialize_config` (upgrade-authority-gated) |
| Config PDA | `ERqWzBnwMsj9tK9fA4DTebya9hBtc3DLBogybTL7gFjm` |
| Design review | [`.solana-roast/`](./.solana-roast/) — Code Safety 9/10 · Launch Readiness 6/10 |

**All three instructions verified on devnet:**
- `record_call` → receipt created ([`3bd17fga…RKt2v`](https://explorer.solana.com/tx/3bd17fga1BuBRyz8Q8uXqG611kf2bpAiGjWnKjvUBBVBaFJeNhuSLYz7dhCguDA7nHa2XmcKm9fH5UJLhnLRKt2v?cluster=devnet))
- `initialize_config` → upgrade-authority gate passed ([`3Kzbtgzq…W1bK`](https://explorer.solana.com/tx/3Kzbtgzq8f1EDuaSSUmYMvsUyWYw7XWyz4nChph7zB7NpqCombTL1rew9rnVTNhQ9A2RG7XLEFek8JRDaghhW1bK?cluster=devnet))
- `settle_call` → **points = 370 computed on-chain** for a YES @ 27% (1,000,000 ÷ 2700) ([`5siJd29e…hXKUE`](https://explorer.solana.com/tx/5siJd29enQjKCm4DxFe4T3us5YjAMYnZXASy6LApwrk5m2ysUZE16fL58h75YiabdRsL2YU6zCR9e54gX96hXKUE?cluster=devnet))

### The receipt, as a page — `/receipt/[address]`

Every `CallReceipt` PDA now has a branded page (not just a raw Explorer link): fetches + decodes the
account directly (`src/lib/solana/calledit-client.ts` → `fetchReceipt`/`getPlayerReceipts`, no
database — `getProgramAccounts` + a `memcmp` on `player` is the entire "career history" backend), and
a dynamic `next/og` image so the link unfurls as a real card in a group chat. Wired in from `CallCard`,
the "Your receipts"/"Career" list, and the full-time share button. See it live: kick off a match, make
a call, click "view your CALLED IT card."

**Honest note on what's trustless today vs. what isn't.** The on-chain **timestamp** (`created_at`,
the block time) is fully trustless — it's exactly what makes a call provable instead of a hindsight
boast, and it's the thing this whole product is built around. The on-chain **`market_pct`**, however,
is **app-attested today**: the client reads it off the live TxLINE odds snapshot and passes it into
`record_call` as a plain argument — nothing on-chain currently checks that number against what TxLINE
actually quoted at that moment. That's a deliberate, documented scope cut for the hackathon, not an
oversight: the receipt page surfaces the odds' provenance (TxLINE `Ts`/`MessageId`/StablePrice marker)
so the claim is visible and inspectable, but verifying it on-chain is the `txoracle` program's job (a
sibling project's Merkle-root anchoring), not this one's. The natural next step is a CPI/read into
`txoracle`'s anchored roots at `record_call` time so `market_pct` gets the same trustless guarantee
`created_at` already has.

## How it meets the hard constraints

- **TxLINE as a live input** ✅ — odds drive the calls + scoring; scores settle them. The live path is
  fully wired (`/room?feed=live`, odds + scores proxies, status probe) and testable via the mock SSE
  server; the demo defaults to the recorded replay because World-Cup matches end before judging.
- **Sign up through Solana** ✅ — wallet adapter; calling requires a connected wallet.
- **Functional deployed product** ✅ — live at **https://calledit-chi.vercel.app** (Vercel, production; `npm run build` clean).
- **Demo-video-friendly** ✅ — replay + simulated crew; solo-vs-market is complete on its own.

## Deployment

**Live (production):** https://calledit-chi.vercel.app — deployed on Vercel from `main`, auto-redeploys
on push. Zero env vars required for the demo path (Solana uses public devnet RPC; program ID is baked
in). Optional env to light up extras: `NEXT_PUBLIC_SOLANA_RPC` (dedicated devnet RPC), and `TXLINE_JWT`
/ `TXLINE_API_TOKEN` (server-side only) to enable the live feed.

## Demo video script (≤5 min)

1. **0:00–0:30 — The hook.** Landing page: *"Everyone's a genius after the goal."* Read the one-liner.
   Connect Phantom (devnet). → the wallet sign-up requirement, on camera.
2. **0:30–0:50 — Kick off.** Enter the room, kick off. One line: *calls are against the live market;
   the longshots the market doubts pay the most.*
3. **0:50–2:00 — Call the longshot.** When **"Argentina to score (market 27%)"** opens, call **YES**.
   Show the toast: *"Locking YES on devnet…" → "Receipt minted on-chain"* → click **view receipt** →
   Solana Explorer (side + market% + block-time, **before** the goal). Goal drops → **CALLED IT +370**.
4. **2:00–3:10 — The crew + hindsight.** Leaderboard moves live. Point out **Deano** (the
   hindsight-merchant bot) calling it wrong; the sharp bot **Maxi** banking longshots. Call the
   **red-card (12%)** longshot YES for the big jump.
5. **3:10–4:00 — Full time.** *"You read the game best."* Open **Your receipts** → every call is an
   on-chain proof. *No take-backs, no hindsight.*
6. **4:00–4:40 — Close.** TxLINE powers the odds + settlement; Solana is the anti-hindsight proof.
   *"Call it before the market does. Prove it. Settle the group chat."*

## Feedback on the TxLINE API experience

- **The odds SSE is a great primitive.** `InRunning` + `Pct[]` map almost 1:1 onto a "call the next
  N minutes vs the market" mechanic — we built the whole scoring engine on `Pct[]`.
- **Surface the ~60s sampling cadence loudly in the quickstart.** It's the single most
  architecture-shaping fact — it (correctly) killed our first sub-second "belief-meter" idea. Builders
  should learn it before they design an interaction model, not after.
- **Publish a sample `OddsPayload` and scores/events payload in the quickstart.** We had to infer the
  field shapes (`PriceNames`/`Prices`/`Pct` alignment, `SuperOddsType` values); a couple of real
  example frames per market type would save everyone an afternoon.
- **Clarify the two auth tokens.** Bearer JWT *and* `X-Api-Token` — document which is long-lived vs
  rotating, and TTLs, so people handle refresh correctly.
- **`Last-Event-ID` resume is excellent** — made reconnection trivial. More of this.
- **A documented scores/events SSE schema next to the odds one** would speed settlement integration
  (we modelled `ScoreEvent` from the worldcup docs + inference).
