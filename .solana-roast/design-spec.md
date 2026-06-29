# CalledIt — Design Spec (resolved)

> Output of `solana-roast`, design stage. Single source of truth for the `calledit` program.
> Scope: **devnet hackathon MVP.** A high score here is **not** an audit pass.

## Purpose
Make "I called it" provable. A player records a call **against the live market** before the
moment happens; the on-chain receipt is timestamped so it can't be a hindsight boast. The
program holds **no funds** — it is a free-to-play points/proof layer.

## Account model

| Account | Owner | Created by | Writable by | Notes |
|---|---|---|---|---|
| `Config` (PDA `["config"]`, singleton) | `calledit` | **upgrade authority only** (`initialize_config`) | never (immutable after init) | stores `authority` (settlement/oracle), `bump` |
| `CallReceipt` (PDA `["call", player, match_id, prop_id]`) | `calledit` | the **player** (`record_call`, `payer = player`) | `settle_call` (authority) sets outcome/points once | the anti-hindsight proof |

No `Vec`/`String` fields → fixed size via `#[derive(InitSpace)]`. No `init_if_needed`, no
`realloc`, no `close` (receipts are permanent proofs).

## PDA map
- `Config`: seeds `["config"]`, bare canonical `bump` (stored). Singleton.
- `CallReceipt`: seeds `["call", player.key(), match_id.to_le_bytes(), prop_id.to_le_bytes()]`,
  bare canonical `bump` (stored). Player-scoped → a player can hold exactly one receipt per
  (match, prop); cannot squat another player's receipt; cannot overwrite their own (`init` fails
  on re-call → no flip-flopping after the fact).

## Authority model / access matrix

| Instruction | Caller | Required signer | Mutates | Invariant after |
|---|---|---|---|---|
| `initialize_config` | deployer | `authority` **== program upgrade authority** (enforced via `program_data.upgrade_authority_address`) | creates `Config` | `config.authority` set once; runnable once (`init`) |
| `record_call(match_id, prop_id, side, market_pct, window_end)` | any wallet (permissionless, self-sovereign) | `player` | creates own `CallReceipt` | `created_at < window_end`; `side ∈ {0,1}`; `market_pct ∈ [1,9999]`; `settled = false` |
| `settle_call(correct)` | settlement oracle | `authority` **== `config.authority`** (`has_one`) | the `CallReceipt` | settled once (`!call.settled`); points computed on-chain |

## Scoring (deterministic, on-chain — authority cannot inflate)
On a **correct** call, points = `min(POINTS_BASE / prob_of_side_bps, POINTS_MAX)` where
`prob_of_side_bps = market_pct` (YES) or `10000 - market_pct` (NO). I.e. **your payout is the
market's fair odds for the side you took** — calling what the market doubted pays more, locks
pay little. Incorrect → 0. `POINTS_BASE = 1_000_000`, `POINTS_MAX = 10_000`. The authority only
attests the binary `correct`; it never supplies points.

## Trust boundaries (stated honestly)
- **Trustless / provable on-chain:** that a given wallet committed to `{side}` for `{match, prop}`
  at block time `created_at`, before `window_end`. This is the core "called it" guarantee and it
  holds with no trust in anyone.
- **Authority-mediated:** the binary outcome (`correct`) and therefore points. The settlement
  authority is trusted to attest outcomes truthfully from the TxLINE feed. Worst-case abuse =
  a corrupted points leaderboard. **No funds can be stolen — the program holds none.**

## Governance (devnet posture)
- Upgrade authority: the deployer hot key (devnet). Program is **upgradeable** during the
  hackathon (deliberate, to iterate). Mainnet target: Squads v4 multisig + timelock.
- `Config.authority` is set once and (MVP) has no rotation path — see threat-model TM-04.

## Deployment
- Cluster: devnet. `anchor deploy` → upgrade authority = deployer.
- Immediately run `initialize_config` (deployer signs == upgrade authority) to set the
  settlement authority. The front-running window is closed by the upgrade-authority gate.
