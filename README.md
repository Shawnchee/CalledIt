# CalledIt ⚽️ — *call it before the market does. prove it. settle the group chat.*

> **Track B · Consumer & Fan Experiences** — TxLINE World Cup Hackathon
> **Status:** concept **LOCKED**, MVP in build. See [`TRACK.md`](./TRACK.md) for the brief.

**One-liner:** a live, play-along game where you call what's about to happen in a World Cup
match **against the live betting market** — your calls are timestamped on-chain *before* the
moment, so your crew gets a provable scoreboard of who actually reads the game.

---

## The pain (real, and documented)

Everyone in the group chat is a genius **after** the goal. *"I said he'd score." "I called that red."*
Nobody remembers, nobody can prove it, and the loudest hindsight-merchant wins. This is literally a
named cognitive bias — *hindsight bias*, the "I-knew-it-all-along effect," football's "Monday-morning
quarterbacking." Meanwhile fans actively crave **"fast-to-know" status** and use match insight as
*social currency* to look smart among their mates.

**There is no scoreboard for who actually reads the game.** CalledIt is that scoreboard.

## Why this isn't just another prediction app

The friends-predict-match-events lane is a graveyard — tackl, Tippr, Kicktipp, Prodefy, WinView,
Pick'Em Sports, **and the official FIFA World Cup 2026 app itself** all ship "predict events +
leaderboard." Building a 7th loses on originality instantly.

CalledIt is different on the one axis only TxLINE enables: **you play against the live market.**
There is no free-to-play game where the *bookmaker's live in-play odds are your opponent*. That makes:

- **TxLINE load-bearing** — live odds are the opponent, the difficulty engine, *and* the settlement,
  not a garnish on a score feed any API could provide.
- **Solana load-bearing** — the on-chain call receipt is the literal mechanism that kills hindsight
  bias: an immutable, timestamped proof you called it *before* the event.

## How it works

```
Join a ROOM (link dropped in the group chat)
        │
        ├─► Live CALLS        derived from match state + TxLINE odds:
        │                     "Next 10 min — Argentina to score? Market says 22%"
        ├─► Tap in BEFORE     the window closes → call locked
        ├─► On-chain RECEIPT  record_call writes your pick + the market % + a block timestamp to
        │                     Solana devnet — provable you called it before it happened
        ├─► TxLINE SETTLES    the scores/events feed resolves the call
        ├─► Market-weighted    calling what the market DOUBTED scores big; safe calls score little
        │   SCORING            (reward insight, not locks)
        └─► Crew LEADERBOARD   who actually beats the market, live — hindsight-merchants exposed
```

The **market sets the difficulty**: a correct 22%-odds call is worth far more than an 80% lock.
Even solo, *you vs the market* is a complete game — which is what makes the demo work when matches
have ended (see Demo plan).

## Keeping it cleanly Track B

- **Points-only, no wager, no payout** — free-to-play, like Pick'Em Sports ("the game without the
  gamble"). Keeps it distinct from the betting tracks and dodges the gambling warnings.
- **Lead with crew + proof.** The market is the *difficulty engine*; the point is settling the group
  chat with receipts.

## Powered by TxLINE (primary data source)

| Use | TxLINE source | Field(s) |
|-----|---------------|----------|
| Generate calls + set difficulty | **Odds SSE** `GET /api/odds/stream` (Bearer JWT + `X-Api-Token`, optional `fixtureId`, `Last-Event-ID` resume) | `InRunning` (in-play flag), `Pct[]` (implied %), `PriceNames[]`, `Prices[]`, `SuperOddsType`, `Ts` |
| Settle calls | **Scores/events SSE** | goals, cards, match clock |

⚠️ **Cadence:** free / World-Cup tier samples odds **every 60s**, not per-tick — fine for the
"call the next 10 minutes" window mechanic. Docs: https://txline-docs.txodds.com ·
API ref: https://txline-docs.txodds.com/api-reference

The app talks to TxLINE through a `TxlineFeed` adapter with two implementations:
`LiveTxlineFeed` (real SSE endpoints, creds via env) for live matches, and `ReplayFeed`
(recorded/synthetic match timeline) for the demo video — matches end before judging, so the video
must carry the experience.

## Solana

- **Wallet sign-up** (track requirement) — Solana wallet adapter, devnet.
- **`calledit` Anchor program (devnet)** — `record_call` creates a `CallReceipt` PDA
  `{player, match, prop, side, market_pct, created_at}`; authority-gated `settle_call` marks the
  outcome + points. The pre-event receipt is the anti-hindsight proof; the "called it" flex links to it.
- The threat model's named invariants INV-1…7 are executable tests (`cargo test`), not just claims.

## Monetization path

Premium private leagues, sponsor-branded rounds/pots, crew cosmetics, B2B watch-party tooling.

## Demo plan (matches end before judging)

Replay a recorded TxLINE feed + a **simulated room of mates** (bot players make calls off the same
timeline) → a lively social demo on the ≤5-min video. **Solo play (you vs the market) is fun on its
own**, so a room of 1 still works — mitigates social cold-start *and* the "fake friends in a recording"
problem that sinks most social-app demos.

## Rubric mapping

- **Fan Accessibility & UX** — social, intuitive, built on a real fan ritual. ✅
- **Real-Time Responsiveness** — calls open/close on market windows; leaderboard moves live. ✅
- **Originality** — the only free-to-play *play-against-the-live-market* game; market-as-opponent +
  on-chain receipts. ✅ (was the weak axis — this is the fix)
- **Commercial Path** — premium leagues / sponsor pots. ✅
- **Completeness** — small surface, fully finishable end-to-end. ✅

## Tech

Next.js 16.2 (App Router, React 19) · Tailwind v4 · Solana wallet adapter + `@coral-xyz/anchor` ·
Anchor program on devnet · TxLINE SSE feeds.

## Status / next

- [x] Concept locked (CalledIt — market-as-opponent + on-chain receipts)
- [x] GitHub connected · Solana toolchain ready (devnet, funded)
- [x] TxLINE feed adapter (live + replay) + scoring engine
- [x] `calledit` Anchor program → /solana-roast → devnet deploy
- [x] Wallet auth + on-chain receipt wiring
- [x] UI (landing → match room → calls → leaderboard) via /ui-ux-pro-max
- [ ] Deploy + demo video + submission
