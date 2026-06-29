import { PublicKey } from "@solana/web3.js";

/** Deployed calledit program (devnet). */
export const CALLEDIT_PROGRAM_ID = new PublicKey(
  "BeR8b7y7c4offbz2fqNj2N1Y5zoEqkY9aYgBVc7NSdM1",
);

export const SOLANA_CLUSTER = "devnet" as const;
export const SOLANA_RPC =
  process.env.NEXT_PUBLIC_SOLANA_RPC ?? "https://api.devnet.solana.com";

export const explorerTx = (sig: string) =>
  `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
export const explorerAddress = (addr: string) =>
  `https://explorer.solana.com/address/${addr}?cluster=devnet`;
