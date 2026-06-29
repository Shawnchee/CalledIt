# CalledIt — Pre-Audit Checklist

> Hand-off artifact for a static scanner / external auditor. `[x]` = resolved at design stage,
> `[ ]` = open / pre-mainnet. Devnet hackathon scope.

## Accounts & PDAs (branch 1)
- [x] All data-bearing accounts use typed `Account<'info, T>` (owner + discriminator checked)
- [x] No `AccountInfo` / `UncheckedAccount` reading program data
- [x] Canonical bumps only; no user-supplied bump argument
- [x] Seeds pin each `CallReceipt` to one (player, match, prop); no PDA reused as cross-domain signer
- [x] `payer = player` on `record_call` (no protocol-paid rent → no rent-griefing)

## Authority & signers (branch 2)
- [x] Every privileged account is a `Signer`
- [x] `settle_call` binds signer to `config.authority` via `has_one = authority`
- [x] `initialize_config` gated to the program **upgrade authority** (front-running closed — TM-01)
- [x] User path (`record_call`) vs admin path (`settle_call`) are separate authorities
- [ ] Two-step authority transfer for `config.authority` (TM-04 — pre-mainnet)

## State & data (branch 4)
- [x] Plain `init` (no `init_if_needed`); re-init impossible (PDA singleton / per-player)
- [x] `#[derive(InitSpace)]`; no unbounded `Vec`/`String`
- [x] `record_call` cannot overwrite an existing receipt (no post-hoc flip)
- [ ] (accepted) `market_pct` client-supplied — production: authority-published `Prop` account (TM-02)

## Economic invariants (branch 5)
- [x] `overflow-checks = true` for release
- [x] No div-by-zero (`market_pct ∈ [1,9999]` enforced before scoring)
- [x] Points computed on-chain; authority attests only the binary outcome
- [x] Program holds/moves **no funds** (no value-conservation surface)
- [n/a] oracle price feed / slippage / shares — not applicable

## Compute & DoS (branch 7)
- [x] No loops / unbounded iteration in any instruction
- [x] No single growing account (one PDA per call; leaderboard indexed off-chain)
- [x] ≤5 accounts per instruction (well under tx limits)
- [x] Default compute budget sufficient
- [ ] (note) `msg!` logs in hot paths could be trimmed for production

## Governance (branch 6 — pre-mainnet)
- [ ] Move upgrade authority to Squads v4 multisig + timelock (TM-05)
- [ ] Decide immutable vs upgradeable policy and publish it
- [ ] Optional guardian pause on settlement (TM-06)

## Hand-off
- Static scan: Trail of Bits `solana-vulnerability-scanner`
- Invariants for formal verification (QEDGen): INV-1…INV-7 in `threat-model.md`
- Mainnet: `deploy-to-mainnet` once governance items are green
