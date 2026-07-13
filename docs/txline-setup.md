# TxLINE live-data setup (devnet)

CalledIt runs on a deterministic mock/replay feed out of the box. To stream **live**
TxLINE odds + scores, wire two credentials into `.env.local`:
`TXLINE_JWT` and `TXLINE_API_TOKEN`. The app auto-flips to live mode once both are set
(the SSE proxy routes gate purely on their presence).

The credential pipeline is: **guest JWT → on-chain `subscribe` → `token/activate`**.
Devnet is free and uses devnet SOL.

## 1. Fund a devnet keypair (free)

```bash
solana-keygen new -o ~/.config/solana/id.json   # skip if you already have one
solana airdrop 2 --url devnet                    # devnet SOL is free
```

## 2. Mint an API token end-to-end

```bash
SOLANA_KEYPAIR=~/.config/solana/id.json npm run txline:subscribe
```

This broadcasts a **real devnet `subscribe` tx** (service level 1 by default), fetches a
guest JWT, signs the binding message, calls `/api/token/activate`, and writes
`TXLINE_NETWORK`, `TXLINE_JWT`, `TXLINE_API_TOKEN` into `.env.local` (chmod 600).
The token value is never printed.

Custom tier / leagues:

```bash
SOLANA_KEYPAIR=~/.config/solana/id.json TXLINE_SERVICE_LEVEL=3 TXLINE_LEAGUES=8,72 npm run txline:subscribe
```

## 3. Already have a token? Validate + wire it (no on-chain tx)

```bash
TXLINE_API_TOKEN=<issued token> npm run txline:activate
```

This fetches a guest JWT and validates the token against `/api/fixtures/snapshot`
(and a per-fixture `/api/odds/snapshot/{id}`), then writes the working creds to
`.env.local`. To activate from a prior subscribe tx instead:

```bash
TXLINE_SUB_TXSIG=<sig> TXLINE_WALLET_SIG=<base64 sig> npm run txline:activate
```

## 4. Run the app

```bash
npm run dev
```

With `TXLINE_JWT` + `TXLINE_API_TOKEN` present, the odds/scores proxies stream live
TxLINE data. Without them, CalledIt stays on the mock/replay feed — no error, no setup.

For **mainnet**, pass `--network mainnet` (service level 12) and fund a mainnet wallet
yourself. See `.env.example` for every variable.
