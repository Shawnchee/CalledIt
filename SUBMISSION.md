# CalledIt — Submission Packet

**Track B · Consumer & Fan Experiences** — TxLINE World Cup Hackathon
Repo: https://github.com/Shawnchee/CalledIt

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
- **"Broadcast Terminal" UI** — premium dark, live-sports energy + crypto receipts credibility.

## TxLINE endpoints used

| Use | Endpoint | Fields consumed |
|-----|----------|-----------------|
| Generate calls + set difficulty | **Odds SSE** — `GET https://txline.txodds.com/api/odds/stream` (headers `Authorization: Bearer <JWT>`, `X-Api-Token`; query `fixtureId`; `Last-Event-ID` resume) | `InRunning`, `Pct[]` (implied %), `PriceNames[]`, `Prices[]`, `SuperOddsType`, `Ts`, `FixtureId` |
| Settle calls | **Scores/events SSE** | goals, cards, match clock |

Integration code:
- Server proxy (adds auth, normalises to `FeedEvent`): [`src/app/api/txline/stream/route.ts`](./src/app/api/txline/stream/route.ts)
- Client adapter + odds→prop mapper: [`src/lib/txline/live-feed.ts`](./src/lib/txline/live-feed.ts)
- Deterministic replay for the demo (matches end before judging): [`src/lib/game/replay-match.ts`](./src/lib/game/replay-match.ts)

> ⚠️ Free / World-Cup tier samples odds **every ~60s** — exactly why the mechanic is "call the next
> N minutes", not per-tick. The app talks to TxLINE through a `TxlineFeed` interface with `LiveTxlineFeed`
> (real SSE, creds via `TXLINE_JWT` / `TXLINE_API_TOKEN`) and `ReplayFeed` (the demo). Drop in creds to go live.

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

## How it meets the hard constraints

- **TxLINE as a live input** ✅ — odds drive the calls + scoring; scores settle them (live adapter + replay).
- **Sign up through Solana** ✅ — wallet adapter; calling requires a connected wallet.
- **Functional deployed product** — builds and runs (`npm run build` clean); deploy steps below.
- **Demo-video-friendly** ✅ — replay + simulated crew; solo-vs-market is complete on its own.

## Deploy (one step — needs your Vercel account)

The app is zero-config for Vercel (Next.js auto-detected; no env vars required for the demo —
Solana uses public devnet RPC and the program ID is baked in).

**Option A — Vercel dashboard (easiest):** go to https://vercel.com/new → Import
`Shawnchee/CalledIt` → Deploy. (Optional env: `NEXT_PUBLIC_SOLANA_RPC`, and `TXLINE_JWT` /
`TXLINE_API_TOKEN` to enable the live feed.)

**Option B — CLI:** `npm i -g vercel && vercel login && vercel --prod`

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
