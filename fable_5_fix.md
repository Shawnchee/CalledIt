# fable_5_fix.md — CalledIt: full fix plan (security + winnability)

> **Audience:** the Opus 4.8 agent team. Work through this top-down. Every task has
> Why / Where / What / Acceptance. Written 2026-07-05 after a full read of every source file,
> a clean `npm run build`, a failing `npm run lint` (6 errors), the `.solana-roast` threat model,
> and on-chain verification docs.
>
> **Hackathon:** TxLINE World Cup — Track B (Consumer & Fan Experiences). Deadline **Jul 19 2026
> 23:59 UTC** (14 days). Judged on: Fan UX · Real-Time Responsiveness · Originality · Commercial
> Path · Completeness — and **heavily on the ≤5-min demo video**. Hard constraints: TxLINE as live
> input, Solana wallet sign-up, functional **deployed** product, public GitHub repo.

---

## 0. Ground rules (read before touching anything)

1. **Next.js warning (from `AGENTS.md`):** this repo runs **Next 16.2.9 — NOT the Next.js in your
   training data.** Before editing anything under `src/app/`, read the relevant guide in
   `node_modules/next/dist/docs/01-app/`. Same caution for React 19.2 + `eslint-config-next` 16
   (react-hooks v6 introduces `react-hooks/refs` and `react-hooks/immutability` rules — see FIX-07).
2. **Do not change the demo math.** `DEMO.md` promises: the 5 starred calls score
   **370 + 200 + 232 + 833 + 208 = 1,843 pts** and the sharp bot Maxi finishes on **1,793**.
   I verified all of these against `src/lib/game/scoring.ts` and the on-chain formula — they are
   exactly right today. Never touch `POINTS_BASE`, `POINTS_MAX`, the `SCRIPT` rounds' `yesPct` /
   `outcome` / bot calls in `src/lib/game/replay-match.ts`, or `pointsFor()` — unless a task below
   explicitly says so (none do).
3. **Do not modify the deployed program's existing instructions' logic** unless doing FIX-09, and
   then only additively (program upgrades keep the program ID `BeR8b7y7c4offbz2fqNj2N1Y5zoEqkY9aYgBVc7NSdM1`,
   so the verified explorer links in `SUBMISSION.md` stay valid).
4. **Branch etiquette:** keep working on `build/calledit-mvp` (or feature branches off it). FIX-03
   merges to `main` at the end. Never force-push `main`.
5. **Verify after every task:** `npm run build` and `npm run lint` must both be clean before you
   consider a frontend task done. For program tasks: `cargo test` inside `calledit/`.
6. Keep the tone/copy voice: confident, editorial, football-native ("Broadsheet" theme). No neon,
   no glow, no crypto-bro copy.

---

## 1. P0 — Submission blockers (do these first, in order)

### FIX-01 · Demo-killing bug: receipt PDA collides on every replay re-run
**Severity: CRITICAL — this WILL ruin the demo recording.**

- **Why:** The `CallReceipt` PDA is seeded `["call", player, match_id, prop_id]`
  (`calledit/programs/calledit/src/instructions/record_call.rs:15-16`,
  `src/lib/solana/calledit-client.ts:12-23`). The replay always uses `matchId = 1042026`
  (`src/lib/game/replay-match.ts:56`) and `propId ∈ {1..6}`. So the **first** playthrough with a
  wallet mints receipts fine — but every subsequent playthrough with the same wallet fails every
  `record_call` with *"account already in use"*. i.e., **one rehearsal with the demo Phantom
  wallet permanently burns the real take.** (The devnet test script already dodged this with a
  random propId — `scripts/test-record-call.mjs:23` — the app does not.)
- **Where:** `src/app/room/page.tsx` (the `handleCall` → `recordCall` call, lines ~86-91) and/or
  `src/lib/solana/calledit-client.ts`.
- **What:** Salt the **propId** with a per-session base so each playthrough mints fresh PDAs,
  while keeping `matchId` = the real TxLINE fixture id (provenance intact):
  ```tsx
  // room/page.tsx — one base per room session
  const [sessionBase] = useState(() => Math.floor(Date.now() / 1000) * 100); // ~1.78e11, safe < 2^53
  ...
  await recordCall(anchorWallet, {
    matchId: state.match.fixtureId,
    propId: sessionBase + prop.id,   // unique per session, still ends in the prop number
    side,
    yesPct: prop.yesPct,
  });
  ```
  `BN` handles the value fine (u64). Keep `prop.id` as the low digits so a receipt is still
  human-mappable to its prop. Add a one-line comment explaining the salt.
- **Acceptance:** With one wallet, play the replay **twice end-to-end** (`npm run dev`, devnet
  Phantom): all tapped calls mint receipts both times, explorer links open, no
  "already in use" toast. Run a third time to be sure.

### FIX-02 · Deploy to Vercel (hard constraint: "functional deployed product")
- **Why:** `SUBMISSION.md` still says "needs your Vercel account" — there is **no deployed URL**.
  This is a hard submission requirement; without it the project is disqualified regardless of quality.
- **What:**
  1. `npm i -g vercel && vercel login && vercel --prod` from repo root (or the dashboard import of
     `Shawnchee/CalledIt`). Zero env vars needed for the demo path (program ID baked in,
     public devnet RPC default — `src/lib/solana/config.ts`).
  2. Optional but recommended for demo reliability: set `NEXT_PUBLIC_SOLANA_RPC` to a dedicated
     devnet RPC (e.g. Helius free tier). A devnet-only key in the client bundle is an accepted,
     low-risk tradeoff — note it in SUBMISSION if used.
  3. If TxLINE creds are available, set `TXLINE_JWT` + `TXLINE_API_TOKEN` (server-side only —
     never `NEXT_PUBLIC_`) to light up the live path (FIX-05).
  4. Update `SUBMISSION.md` (replace the "Deploy (one step…)" section with the live URL),
     `README.md` header, and the GitHub repo About link.
- **Acceptance:** Production URL loads `/` and `/room`; a full replay run on the **production**
  URL mints a devnet receipt from Phantom; `/api/txline/stream` returns the 503 JSON hint (or
  streams, if creds set). Lighthouse quick pass: no console errors on load.

### FIX-03 · Get everything onto `main` (judges land on the default branch)
- **Why:** All 7 product commits live on `build/calledit-mvp`; `origin/main` has none of it.
  Judges opening `github.com/Shawnchee/CalledIt` see the default branch.
- **What:** After FIX-01/02 land: merge `build/calledit-mvp` → `main` (no squash needed), push.
  Confirm the repo is **public**, README renders as the front page, and the About section has the
  live URL + one-liner.
- **Acceptance:** Incognito browser: `main` shows README with working links; `git log main` on
  origin contains the full history.

### FIX-04 · Demo video prep (the highest-weighted judging artifact)
- **Why:** "Heavily judged on the demo video." Everything else in this file exists to make those
  5 minutes land.
- **What (agent-preparable parts):**
  1. Confirm `DEMO.md` timings still match `SCRIPT` after all fixes (they do today; re-verify).
  2. Pre-record checklist additions to `DEMO.md`: FIX-01 must be merged **before** rehearsals;
     airdrop 2 devnet SOL; Phantom on devnet; production URL (not localhost) on camera —
     judges notice.
  3. Keep both hero on-chain moments in the script: the **27% goal (+370)** with the explorer
     receipt reveal, and the **12% red card (+833)**.
  4. After FIX-11 ships, end the video on the **share-card / receipts** beat — it visually proves
     "settle the group chat".
- **Acceptance:** A written, re-verified shot list; two clean rehearsal runs on the production URL
  with receipts minting. (A human records the final take.)

---

## 2. P1 — Track alignment & security (judges will read the code)

### FIX-05 · Wire the live TxLINE feed — it is currently dead code
**This is the biggest track-alignment risk.** The hard constraint is *"must use TxLINE data as a
live input"*, and `SUBMISSION.md` claims *"drop in creds to go live"* — but:

- `LiveTxlineFeed` and `propFromOdds` (`src/lib/txline/live-feed.ts`) are **imported by nothing**.
  The room always constructs `GameEngine` with the hardcoded replay `SCRIPT`
  (`src/lib/game/use-game.ts:10`, `src/lib/game/engine.ts:42`). Even with creds set, no UI path
  ever touches `/api/txline/stream`. A judge grepping for the endpoint will find exactly what I
  found: a proxy and an adapter that nothing calls. That undermines the submission's honesty.
- Additionally the `Scoreboard` permanently shows "**LIVE via TxLINE**" during a scripted replay
  (`src/components/Scoreboard.tsx`), which reads as misleading next to the code.

**What (scope it tightly — replay stays the default demo path):**
1. Add `src/app/api/txline/status/route.ts`: returns `{ live: boolean }` from
   `Boolean(process.env.TXLINE_JWT && process.env.TXLINE_API_TOKEN)`. No secrets in the response.
2. Add a scores proxy `src/app/api/txline/scores/route.ts` mirroring the odds proxy
   (env `TXLINE_SCORES_URL`, same auth headers, same SSE normalization → `{kind:"score", event}`),
   503 without creds. Reuse a shared helper with the odds route rather than copy-paste
   (extract to `src/lib/txline/proxy.ts`).
3. Room feed selection: `/room?feed=live&fixtureId=<id>` (and auto-suggest live via the status
   endpoint) constructs the engine in **live mode**:
   - Subscribe `LiveTxlineFeed`; on each odds `FeedEvent`, `propFromOdds(payload)` → open it as
     the active prop (dedupe: don't reopen while one is open; window from the prop).
   - Settlement, minimal honest scope: settle `NEXT_GOAL`-type props from the scores feed
     (`GOAL` event inside the window → YES, else NO at window end); everything else resolves at
     window end from the scores state, or stays "unsettled" with a visible "settling…" state.
     **Do not fake outcomes in live mode.**
   - Engine refactor: give `GameEngine` a small seam (`openProp(prop)`, `resolveProp(propId,
     outcome, label)`) instead of forking a second engine class — the replay ticker path can call
     the same two methods internally. Keep bots replay-only.
4. Honesty badge: replace the hardcoded "LIVE via TxLINE" pill with a mode-aware one —
   `REPLAY · recorded TxLINE timeline` (default) vs `LIVE · TxLINE` (live mode). One small
   component, used in `Scoreboard`.
5. Update `SUBMISSION.md` + `README.md` to describe the real wiring (status endpoint, `?feed=live`,
   scores proxy). The claim "drop in creds to go live" must be **true** when this task closes.
6. Fix `propFromOdds` prop-id generation (`live-feed.ts:86`): string-concat of
   `FixtureId % 100000` and `Ts % 1000` collides easily. Use a monotonic counter seeded from
   `Date.now()` (same salting scheme as FIX-01) — ids only need uniqueness per session.
- **Acceptance:** Without creds: app behaves exactly as today, badge says REPLAY, status returns
  `{live:false}`. With creds (or a local mock SSE server — write one in `scripts/mock-txline.mjs`
  emitting recorded `OddsPayload` frames): `/room?feed=live` opens props from the stream, a
  scores event settles a NEXT_GOAL prop, on-chain receipt minting works identically.
  `npm run build` + lint clean.

### FIX-06 · Harden the TxLINE SSE proxy (`src/app/api/txline/stream/route.ts`)
Findings, in priority order:
1. **Open proxy / quota burn (MEDIUM):** the route is unauthenticated and unlimited — anyone who
   finds the deployed URL can hold open unlimited upstream connections **on your TxLINE
   credentials** (quota exhaustion / cred abuse). Fix: (a) same-origin check — reject when the
   `Origin`/`Referer` host doesn't match the request host (allow empty for same-site EventSource);
   (b) an in-module concurrent-connection counter, cap ~20, `429` beyond it, decrement in
   `cancel()`/`done`. Note the per-instance caveat in a comment (fine for a hackathon; it's about
   raising the floor, not perfection).
2. **Query injection (LOW):** `route.ts:38` interpolates `fixtureId` raw into the upstream URL —
   `?fixtureId=1&otherParam=x` passes straight through. Build the URL with
   `const u = new URL(ODDS_URL); if (fixtureId) u.searchParams.set("fixtureId", fixtureId);`.
3. **Broken resume (FUNCTIONAL):** the proxy re-emits only `data:` lines and drops upstream `id:`
   lines (`route.ts:73-85`) — so the browser's `EventSource` reconnect never carries a useful
   `Last-Event-ID`, and the resume feature `SUBMISSION.md` praises is inert end-to-end. Parse
   `id:` from each upstream frame and re-emit it (`id: <x>\ndata: <json>\n\n`).
4. **SSE spec (LOW):** multi-line `data:` frames are legal; join all `data:` lines in a frame
   before `JSON.parse`, instead of taking only the first.
- **Acceptance:** Unit-test the frame parser (extract it to `src/lib/txline/sse.ts` with a pure
  `parseSseFrames(buffer) → {frames, rest}` and add a small vitest or node:test file); manual curl
  shows ids forwarded; cross-origin `fetch` from another host gets 403; 21st concurrent local
  connection gets 429.

### FIX-07 · Make `npm run lint` pass (currently 6 errors)
- **Why:** Judges (and their agents) run lint. All 6 errors are the new react-hooks v6 rules:
  - `src/lib/game/use-game.ts:9-22` — `react-hooks/refs`: engine constructed/read from a ref
    during render.
  - `src/app/room/page.tsx:45` — `react-hooks/immutability`: assigning `engine.onYouSettled`
    mutates a hook-returned value.
- **What:**
  1. `use-game.ts`: hold the engine in state, not a ref:
     ```ts
     const [engine] = useState(() => new GameEngine());
     const [state, setState] = useState<GameState>(() => engine.getState());
     useEffect(() => { const unsub = engine.subscribe(setState); return () => { unsub(); engine.stop(); }; }, [engine]);
     ```
  2. `engine.ts`: replace the public mutable `onYouSettled` field with a registration method
     (`setYouSettledHandler(fn | undefined)`), and call it from `room/page.tsx`'s effect. This
     satisfies the immutability rule without an eslint-disable.
  3. Re-check the remaining errors after these two; fix in the same spirit (no blanket disables).
- **Acceptance:** `npm run lint` → 0 errors 0 warnings; `npm run build` clean; full replay
  playthrough still works (kickoff → calls → toasts → full-time), incl. the settled-toast path
  (that's the code being refactored).

### FIX-08 · LiteSVM tests for the program's named invariants
- **Why:** `calledit/programs/calledit/Cargo.toml` already declares `litesvm` + solana test deps —
  but **zero tests exist**. The threat model names invariants INV-1…INV-7; proving them
  executable is a cheap, big "Completeness & Execution" win and makes the security story credible.
- **Where:** `calledit/programs/calledit/tests/calledit.rs` (integration test dir), run with
  `cargo test` from `calledit/` (matches `Anchor.toml`'s `test = "cargo test"`). Load the compiled
  `.so` from `calledit/target/deploy/` into LiteSVM.
- **What (one test per invariant, use the exact devnet-verified numbers):**
  1. INV-1: `record_call` with `window_end` in the past → `WindowClosed`.
  2. INV-2/3: `market_pct` 0 and 10000 → `InvalidMarketPct`; `side = 2` → `InvalidSide`.
  3. PDA uniqueness: same (player, match, prop) twice → second fails (account exists).
  4. INV-6: settle signed by a non-authority → `Unauthorized` (has_one).
  5. INV-4: settle twice → `AlreadySettled`.
  6. INV-5 math: YES @ 2700 bps correct → **370 pts** (mirrors the on-chain devnet tx in
     SUBMISSION.md); YES @ 1200 → 833; NO @ 5200 (prob 4800) → 208; YES @ 1 → capped **10000**;
     incorrect → 0 pts, outcome 2.
  7. INV-7: `initialize_config` where `authority` ≠ upgrade authority → `Unauthorized`.
     (In LiteSVM you control the programdata account — construct both cases.)
- **Acceptance:** `cd calledit && cargo test` green in CI-fresh checkout; add one line to
  README's Solana section: "invariants INV-1…7 are executable tests (`cargo test`)".

---

## 3. P2 — Polish that moves judge scores

### FIX-09 · Optional program hardening (only if time after P1)
The threat model already honestly accepts TM-02/04/05 for the hackathon — judges reward that
honesty, so this is optional. If done, it's an **additive in-place upgrade** (same program ID):
1. `record_call`: bound the client-supplied window — `require!(window_end <= now + 24h)`
   (`MAX_WINDOW_SECS` const). Closes the "mint a receipt with a year-long window" oddity that
   weakens the receipt's meaning (`record_call.rs:41-44` currently has no upper bound).
2. Two-step `set_authority` on `Config` (TM-04): `propose_authority(new)` +
   `accept_authority()` signed by the new key; reject `Pubkey::default()`.
3. Update IDL (`src/lib/solana/idl/calledit.{json,ts}`), redeploy to devnet, re-run
   `scripts/init-config.mjs` sanity (it must detect the existing config and no-op), and re-verify
   one `record_call` + `settle_call` round-trip; refresh the tx links in `SUBMISSION.md` **only if
   behavior-visible** (existing links stay valid either way).
4. Extend FIX-08 tests for both changes.
- **Do NOT** attempt on-chain prop registration (oracle-created Prop accounts) — right fix for
  mainnet, wrong scope for 14 days; it's already documented as the production path in TM-02.

### FIX-10 · Real metadata, OG card, favicon — the first 5 seconds of judging
- **Why:** `src/app/layout.tsx` metadata has title/description only — no `metadataBase`, no
  OpenGraph/Twitter card, `public/` still holds the default Next scaffold SVGs
  (`next.svg`, `vercel.svg`, `globe.svg`, `file.svg`, `window.svg`), the favicon is the scaffold
  default, and the tracked `calledit-landing.png` (repo root) is a **stale screenshot of the old
  dark theme** — the app is now the bright Broadsheet theme. Judges click the link; the link
  preview and tab icon are the first impression.
- **What:**
  1. `layout.tsx`: add `metadataBase` (production URL from FIX-02), `openGraph` (title, description,
     `images: [{ url: "/og.png", width: 1200, height: 630 }]`, `type: "website"`) and
     `twitter: { card: "summary_large_image" }`. Check `node_modules/next/dist/docs/01-app/` for
     the current Metadata API shape first (per ground rule 1 — it may differ from training data).
  2. Create `public/og.png` (1200×630) in Broadsheet style: paper background `#f3f4f6`, the
     CalledIt brand mark (cobalt `#1b53f0` rounded square + white check, per
     `src/components/Brand.tsx`), headline "Call it before the market does.", sub "Prove it
     on-chain. Settle the group chat.", small "TxLINE × Solana · World Cup 2026" footer. Generate
     via a small HTML→screenshot (playwright is available) or SVG→PNG script; keep the source in
     `scripts/og/`.
  3. Replace `src/app/favicon.ico` with the brand check mark (cobalt square). Next 16 also
     supports `src/app/icon.png` — check the bundled docs for the convention.
  4. Delete the five scaffold SVGs from `public/`; delete or regenerate `calledit-landing.png`
     as a **current** Broadsheet screenshot (if kept, reference it from README so it earns its
     269 KB; otherwise remove).
- **Acceptance:** `npx open-graph-checker`-style manual check: paste the prod URL into a Slack/X
  preview debugger — image, title, description all render; tab shows the brand favicon; repo
  contains no scaffold assets.

### FIX-11 · Full-time share moment — close the product loop ("settle the group chat")
- **Why:** The entire pitch is *"settle the group chat"* — but at full-time the app dead-ends:
  no share, no replay (`FullTime` in `src/app/room/page.tsx:212-230`). One button here converts
  the core promise into a visible feature, strengthens Originality + Commercial scores, and gives
  the demo video its closing beat.
- **What:**
  1. "**Share the receipts**" button on the `FullTime` card: composes text via
     `navigator.clipboard.writeText` (with a "Copied ✓" state):
     ```
     CalledIt — <match label> FT
     🏆 #<rank> · <points> pts · <correct>/<total> called right
     Best call: <label> — market said <pct>%, I called it. Receipt: <explorerTx(sig)>
     calledit.<domain>
     ```
     Pick "best call" = highest-points settled correct call with a `receiptSig`.
  2. "**Run it back ↻**" button: constructs a fresh `GameEngine` + new `sessionBase` (FIX-01)
     and resets `started` — no full page reload needed; a `location.href = "/room"` fallback is
     acceptable if the engine reset fights the hook refactor from FIX-07.
  3. Cosmetic: accept `/room?crew=<name>` and show "Crew: <name>" in the room header (defaults to
     "Demo crew") — makes the "link dropped in the group chat" story tangible for zero backend
     cost. Don't build real multiplayer.
- **Acceptance:** Play to full-time → share button copies the exact text with a working explorer
  link; run-it-back starts a fresh match whose receipts mint (proves FIX-01 salting); `?crew=Lads`
  renders in the header.

### FIX-12 · Live-feel micro-polish (Real-Time Responsiveness score)
1. **Leaderboard freshness bug:** `recomputeLeaderboard()` runs only on settle and in the
   constructor (`src/lib/game/engine.ts:202-242`) — so between a call and its settlement the
   board's `totalCalls` ("2/3 called right") is stale. Call `recomputeLeaderboard()` at the end of
   `addCall()` too.
2. **Unused animations:** `globals.css` defines `animate-points` (points-fly) and `.elev` — both
   unused. Use `animate-points` for a "+370" flyout on the leaderboard row / CallCard when a
   settle lands (keyed element on `call.points`), or delete both. Dead CSS reads as unfinished.
3. **Rank-change pop:** when a player's rank changes, apply `animate-pop` to the row (track
   previous ranks in a ref inside `Leaderboard`). Subtle > flashy; respect the existing
   `prefers-reduced-motion` block.
4. **Window-closed race toast:** `engine.placeCall` returns `null` when the window just locked;
   `handleCall` currently returns silently (`room/page.tsx:72-73`). Push a small "Too late — window
   closed" toast so a mistimed tap in the demo doesn't look like a dead button.
- **Acceptance:** During a replay run: board counts update the moment anyone calls; a settle
  triggers exactly one points flyout; a tap after lock shows the toast. Lint/build clean.

### FIX-13 · Mobile pass (the brief literally opens with "phone in their hand")
- **Why:** Judges may open the deployed link on a phone. The layout stacks
  (`lg:grid-cols-[1fr_360px]`) but has never been verified at phone width.
- **What:** Playwright at 390×844 (and 360×800): walk landing → room → pregame → full replay.
  Check: sticky header doesn't overlap the wallet dropdown; `CallCard` YES/NO buttons are
  thumb-sized (min-h-[84px] is good — verify no shrink); `CountdownRing` (68px) doesn't crowd the
  provenance pill; toasts (`w-[min(92vw,380px)]`) don't cover the call buttons; the hero
  `PreviewCard` on landing doesn't overflow horizontally; no body horizontal scroll anywhere.
  Fix what fails; screenshot before/after into the PR.
- **Acceptance:** Screenshots at both widths for landing + room-live + full-time attached; no
  horizontal scroll; all tap targets ≥ 44px.

---

## 4. P3 — Small consistency nits (batch into one PR)

1. **Landing preview math is off by one:** `src/app/page.tsx:145-147` hardcodes "NO +137 pts ·
   1.4×"; the real formula gives `floor(1_000_000/7300) = 136`. Import `potentialPoints` /
   `payoutMultiple` from `src/lib/game/scoring.ts` and compute from `yesPct = 0.27` instead of
   hardcoding — the landing then can never drift from the engine.
2. **README status checklist is stale** (`README.md:111-119`): feed adapter, program deploy,
   wallet wiring, UI are all done — tick them; add deploy/video state as they land. Stale unchecked
   boxes read as "unfinished project" to a skimming judge.
3. **WalletButton a11y:** the dropdown closes only via the invisible overlay click
   (`src/components/WalletButton.tsx`); add `Escape`-key close and `aria-expanded` on the trigger.
4. **Empty dir:** `calledit/app/` is empty scaffold — remove.
5. **`.gitignore`:** add `.superstack/` if you don't want phase-context files public (they're
   currently untracked but not ignored), or deliberately commit them — either is fine, decide.
6. **Scoreboard clock:** during replay the clock compresses 90' into ~3 min (fine), but at
   `status === "pregame"` it shows `0'` while the badge says LIVE — FIX-05's badge change covers
   this; just re-check after.

---

## 5. Verification matrix (run before calling the project done)

| Check | Command / action | Must show |
|---|---|---|
| Build | `npm run build` | exit 0, all 4 routes |
| Lint | `npm run lint` | 0 errors 0 warnings |
| Program tests | `cd calledit && cargo test` | all invariant tests green |
| Replay ×2, same wallet | manual on **prod URL** | receipts mint both runs (FIX-01) |
| Demo math | play the 5 starred calls | 1,843 pts, #1, Maxi 1,793 |
| Live seam | `scripts/mock-txline.mjs` + `?feed=live` | props open from SSE, honest badge |
| Proxy | curl w/ cross-origin Origin header | 403; same-origin streams with `id:` lines |
| OG | paste prod URL in a preview debugger | og.png + title render |
| Mobile | Playwright 390×844 full walkthrough | no overflow, tappable |
| Repo | incognito github.com/Shawnchee/CalledIt | public, `main` current, live URL in About |

## 6. Suggested execution order & parallelization

- **Wave 1 (serial, today):** FIX-01 → FIX-02 → FIX-03. Nothing else matters until these land.
- **Wave 2 (parallel):** FIX-07 (lint) ∥ FIX-06 (proxy) ∥ FIX-08 (tests) ∥ FIX-10 (OG/meta).
- **Wave 3:** FIX-05 (live feed — biggest single task; owns `engine.ts`, so schedule after FIX-07
  merges to avoid conflicts) ∥ FIX-11 ∥ FIX-12 ∥ FIX-13.
- **Wave 4:** FIX-09 (only if ≥3 days remain before video day), P3 batch, then FIX-04 rehearsals.
- **Internal deadline: video recorded by Jul 16**, submission finalized Jul 17 — two days of slack
  before the Jul 19 23:59 UTC cutoff.

---

## Appendix A — What is already GOOD (do not "fix" these)

- **Program security:** typed accounts everywhere, canonical bumps, `init` (not `init_if_needed`),
  `has_one` authority gating, upgrade-authority-gated config bootstrap (front-run closed),
  `overflow-checks = true`, no unwraps, no funds held. Design-stage 9/10 is deserved.
- **On-chain scoring:** points computed deterministically in `settle_call` so the authority can't
  inflate them — this is a genuine differentiator; it's verified on devnet (370 pts tx).
- **The honest threat model** (`.solana-roast/`) with accepted-risk ledger — keep it prominent.
- **Demo choreography:** replay script + bot personas + achievable #1 finish is excellent
  demo-video engineering. Protect its determinism.
- **Frontend scoring mirror** (`scoring.ts`) matches the on-chain integer math exactly (floor
  division included) — verified by hand.
- **Copy & concept:** "market-as-opponent + on-chain anti-hindsight receipts" is a real
  originality axis; every doc tells the same story. Don't dilute it.

## Appendix B — Security findings ledger (summary)

| ID | Sev | Where | Finding | Fix |
|---|---|---|---|---|
| SEC-1 | HIGH (demo) | client + program PDA seeds | Replay re-run PDA collision kills receipts | FIX-01 |
| SEC-2 | MED | `api/txline/stream` | Unauthenticated open proxy on paid TxLINE creds | FIX-06.1 |
| SEC-3 | LOW | `route.ts:38` | `fixtureId` query injection into upstream URL | FIX-06.2 |
| SEC-4 | MED (accepted, TM-02) | `record_call` | `market_pct`/`window_end` client-attested → forged max-point receipts if settlement bot is naive; authority must validate against its TxLINE snapshot before settling | documented; optional bound in FIX-09.1 |
| SEC-5 | LOW (TM-04) | `Config` | No authority rotation | FIX-09.2 (optional) |
| SEC-6 | INFO | program | No receipt close path — rent locked | intentional (permanent proof), documented |
| SEC-7 | FUNC | proxy | SSE `id:` stripped → Last-Event-ID resume inert | FIX-06.3 |
