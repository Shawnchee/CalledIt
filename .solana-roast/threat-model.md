# CalledIt — Threat Model

> `solana-roast` design-stage triage. Severity: CRITICAL / HIGH / MEDIUM / LOW.
> **Scores (design-stage only, not an audit pass):**
> - **Code Safety: 9/10** — branches 1,2,4,5,7 clean; one accepted MEDIUM (client-supplied `market_pct`).
> - **Launch Readiness: 6/10** — single-key upgrade + settlement authority, no rotation/pause (devnet-acceptable).

## Findings ledger

| ID | Sev | Branch | Finding | Decision | Residual |
|----|-----|--------|---------|----------|----------|
| TM-01 | HIGH → **fixed** | 2 / 4.2 | `initialize_config` could be front-run: first caller seizes settlement authority | **Gated to program upgrade authority** via `program_data.upgrade_authority_address == authority.key()` | none on devnet (closed) |
| TM-02 | MEDIUM (accepted) | 4.6 / 5 | `market_pct` & `window_end` are client-supplied args in `record_call`; a player could pass a fake market to inflate point weighting | Accepted for MVP: settlement is authority-gated, so the authority only settles calls whose `market_pct` matches its TxLINE snapshot; core proof `{side, created_at<window_end}` is unaffected | leaderboard weighting trusts the authority's settlement discipline |
| TM-03 | LOW | 4.3 / 7.2 | `CallReceipt` has no close path → rent locked permanently | Intentional — the receipt is a permanent proof | ~0.0015 SOL rent per call, unrecoverable (by design) |
| TM-04 | MEDIUM | 2.4 / 6 | `Config.authority` has no rotation; a lost/leaked settlement key can't be replaced | Accepted for hackathon | add two-step `set_authority` (reject `Pubkey::default()`) before mainnet |
| TM-05 | MEDIUM | 6.1 / 6.4 | Upgrade authority & settlement authority are single hot keys | Devnet-acceptable | mainnet → Squads v4 multisig + timelock |
| TM-06 | LOW | 6.5 | No emergency pause | Low need — program holds no funds | optional guardian pause for settlement |

## Named invariants (and where enforced)
- **INV-1** a call must be made before its window closes — `require!(now < window_end)` in `record_call`.
- **INV-2** `market_pct ∈ [1, 9999]` bps — `require!` in `record_call` (guarantees no div-by-zero in scoring).
- **INV-3** `side ∈ {0,1}` — `require!` in `record_call`.
- **INV-4** a receipt settles at most once — `constraint = !call.settled` in `settle_call`.
- **INV-5** points = 0 unless correct; else `min(POINTS_BASE/prob_of_side_bps, POINTS_MAX)` — computed in `settle_call`, not supplied.
- **INV-6** only `config.authority` (a signer) can settle — `has_one = authority` in `settle_call`.
- **INV-7** only the upgrade authority can bootstrap `Config` — `program_data` constraint in `initialize_config`.

## Blast radius
The program **moves no value**. The maximum impact of a fully-compromised settlement authority
is a falsified points leaderboard — recoverable by re-settlement after an authority rotation
(TM-04). No path to user fund loss. This is the central reason the economic surface is small.

## Overflow / arithmetic
`overflow-checks = true` in `[profile.release]`. Scoring uses division + `min`; `market_pct ≤ 9999`
so `10000 - market_pct ≥ 1` (no underflow); `raw ≤ 1_000_000` fits `u32`. No bare value arithmetic.
