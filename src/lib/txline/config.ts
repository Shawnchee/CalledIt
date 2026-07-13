/**
 * TxLINE network configuration — a single switch (`TXLINE_NETWORK`) that selects
 * the API host, the txoracle program id, and (downstream) the Solana cluster.
 *
 * Plain, dependency-free TS (only `process.env`) so it is importable from both
 * Next.js route handlers and the standalone `scripts/*.mjs` tooling. Keep it free
 * of React and Next server APIs.
 *
 * Env overrides (all optional; sensible devnet defaults otherwise):
 *   TXLINE_NETWORK      "devnet" (default) | "mainnet"
 *   TXLINE_BASE_URL     explicit host override (wins over the network default)
 *   TXLINE_ODDS_URL     explicit odds SSE URL override
 *   TXLINE_SCORES_URL   explicit scores SSE URL override
 */

export type TxlineNetwork = "devnet" | "mainnet";

/** Per-network TxLINE API hosts (devnet is free and uses devnet SOL). */
const TXLINE_HOSTS: Record<TxlineNetwork, string> = {
  devnet: "https://txline-dev.txodds.com",
  mainnet: "https://txline.txodds.com",
};

/** TxODDS txoracle Anchor program ids by network (anchors the odds data). */
export const TXLINE_PROGRAM_IDS: Record<TxlineNetwork, string> = {
  devnet: "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J",
  mainnet: "9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA",
};

/** Resolve the active network from `TXLINE_NETWORK`; anything but "mainnet" ⇒ devnet. */
export function txlineNetwork(): TxlineNetwork {
  return process.env.TXLINE_NETWORK === "mainnet" ? "mainnet" : "devnet";
}

/** Base API host for a network; `TXLINE_BASE_URL` overrides when set. */
export function txlineHost(network: TxlineNetwork = txlineNetwork()): string {
  return process.env.TXLINE_BASE_URL || TXLINE_HOSTS[network];
}

/** Upstream odds SSE URL; `TXLINE_ODDS_URL` overrides when set. */
export function oddsStreamUrl(network: TxlineNetwork = txlineNetwork()): string {
  return process.env.TXLINE_ODDS_URL || `${txlineHost(network)}/api/odds/stream`;
}

/** Upstream scores SSE URL; `TXLINE_SCORES_URL` overrides when set. */
export function scoresStreamUrl(network: TxlineNetwork = txlineNetwork()): string {
  return process.env.TXLINE_SCORES_URL || `${txlineHost(network)}/api/scores/stream`;
}
