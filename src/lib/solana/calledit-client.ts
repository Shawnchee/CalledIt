import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import idl from "./idl/calledit.json";
import type { Calledit } from "./idl/calledit";
import { CALLEDIT_PROGRAM_ID, SOLANA_RPC } from "./config";
import type { Side } from "@/lib/game/types";

const SIDE_VALUE: Record<Side, number> = { NO: 0, YES: 1 };

/** Derive the CallReceipt PDA — seeds ["call", player, match_id_le, prop_id_le]. */
export function callPda(player: PublicKey, matchId: number, propId: number): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("call"),
      player.toBuffer(),
      new BN(matchId).toArrayLike(Buffer, "le", 8),
      new BN(propId).toArrayLike(Buffer, "le", 8),
    ],
    CALLEDIT_PROGRAM_ID,
  );
  return pda;
}

/** Singleton Config PDA — seeds ["config"]. */
export function configPda(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    CALLEDIT_PROGRAM_ID,
  );
  return pda;
}

function getProgram(wallet: AnchorWallet, connection?: Connection): Program<Calledit> {
  const conn = connection ?? new Connection(SOLANA_RPC, "confirmed");
  const provider = new AnchorProvider(conn, wallet, { commitment: "confirmed" });
  return new Program(idl as Calledit, provider);
}

export interface RecordCallArgs {
  matchId: number;
  propId: number;
  side: Side;
  /** Market implied prob of YES (0..1). */
  yesPct: number;
  /**
   * The prop's REAL call-window close (ms epoch, i.e. `Prop.windowEndsAt`).
   * The on-chain `window_end` is derived from this (+ a small confirmation
   * grace) so the receipt's "called before the window closed" claim matches
   * what the UI actually showed the player — not an arbitrary slack window.
   */
  windowEndsAt: number;
}

export interface RecordCallResult {
  sig: string;
  receipt: string;
}

/** Confirmation grace added on top of the real window close, in seconds —
 * covers wallet-approval + devnet confirmation latency without disconnecting
 * the on-chain deadline from the UI's own countdown. */
const WINDOW_END_GRACE_SEC = 15;

/**
 * Write the anti-hindsight receipt to devnet. `window_end` = the prop's real
 * close time (+ WINDOW_END_GRACE_SEC) — the on-chain `created_at < window_end`
 * check is thus tied to the same deadline the player saw counting down, not a
 * disconnected 180s slack. `created_at` (block time) remains the real proof
 * of *when* the call was made.
 */
export async function recordCall(
  wallet: AnchorWallet,
  args: RecordCallArgs,
): Promise<RecordCallResult> {
  const program = getProgram(wallet);
  const player = wallet.publicKey;
  const receipt = callPda(player, args.matchId, args.propId);
  const marketPct = Math.min(9999, Math.max(1, Math.round(args.yesPct * 10000)));
  const windowEnd = new BN(Math.floor(args.windowEndsAt / 1000) + WINDOW_END_GRACE_SEC);

  const sig = await program.methods
    .recordCall(
      new BN(args.matchId),
      new BN(args.propId),
      SIDE_VALUE[args.side],
      marketPct,
      windowEnd,
    )
    .accountsPartial({
      call: receipt,
      player,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return { sig, receipt: receipt.toBase58() };
}

// ---------------------------------------------------------------------------
// Reading receipts back — "no database, your record IS the chain." Both the
// branded /receipt/[address] page and the on-chain career history read ONLY
// from devnet via these, using the same IDL coder record_call wrote with.
// ---------------------------------------------------------------------------

const SIDE_FROM_VALUE: Record<number, Side> = { 0: "NO", 1: "YES" };

/** Outcome as stored on-chain: 0 = unsettled, 1 = correct, 2 = incorrect. */
export type Outcome = 0 | 1 | 2;

export interface CallReceiptData {
  address: string;
  player: string;
  matchId: number;
  propId: number;
  side: Side;
  /** Market implied prob of YES, in basis points (1..9999) — as stored on-chain. */
  marketPct: number;
  /** Block time the call was recorded (ms epoch) — the anti-hindsight proof. */
  createdAt: number;
  /** Deadline the call had to beat (ms epoch); `createdAt < windowEnd` is enforced on-chain. */
  windowEnd: number;
  settled: boolean;
  outcome: Outcome;
  points: number;
  bump: number;
}

/**
 * Read-only wallet stub — never asked to sign. Only used to stand up a
 * `Program` for account reads (no wallet is connected on the server, e.g. the
 * receipt page and its OG image render before any wallet exists). Writes
 * (`recordCall`) always go through the real connected wallet above.
 */
const READ_ONLY_WALLET: AnchorWallet = {
  publicKey: PublicKey.default,
  signTransaction: async () => {
    throw new Error("Read-only Solana provider cannot sign transactions");
  },
  signAllTransactions: async () => {
    throw new Error("Read-only Solana provider cannot sign transactions");
  },
};

function getReadOnlyProgram(connection?: Connection): Program<Calledit> {
  return getProgram(READ_ONLY_WALLET, connection);
}

type RawCallReceipt = {
  player: PublicKey;
  matchId: BN;
  propId: BN;
  side: number;
  marketPct: number;
  createdAt: BN;
  windowEnd: BN;
  settled: boolean;
  outcome: number;
  points: number;
  bump: number;
};

function decodeReceipt(address: PublicKey, raw: RawCallReceipt): CallReceiptData {
  return {
    address: address.toBase58(),
    player: raw.player.toBase58(),
    matchId: Number(raw.matchId.toString()),
    propId: Number(raw.propId.toString()),
    side: SIDE_FROM_VALUE[raw.side] ?? "NO",
    marketPct: raw.marketPct,
    createdAt: Number(raw.createdAt.toString()) * 1000,
    windowEnd: Number(raw.windowEnd.toString()) * 1000,
    settled: raw.settled,
    outcome: (raw.outcome as Outcome) ?? 0,
    points: raw.points,
    bump: raw.bump,
  };
}

/**
 * Fetch + decode one CallReceipt PDA — the read behind `/receipt/[address]`
 * (page + OG image). Never throws: a malformed address, a missing account, or
 * a discriminator mismatch (wrong account type / wrong program) all resolve
 * to `null` so the caller can render an honest "not found" instead of a 500.
 */
export async function fetchReceipt(
  address: string,
  connection?: Connection,
): Promise<CallReceiptData | null> {
  let pubkey: PublicKey;
  try {
    pubkey = new PublicKey(address);
  } catch {
    return null;
  }
  try {
    const program = getReadOnlyProgram(connection);
    const raw = (await program.account.callReceipt.fetch(pubkey)) as RawCallReceipt;
    return decodeReceipt(pubkey, raw);
  } catch {
    return null;
  }
}

/** Byte offset of the `player` field inside a CallReceipt account: the 8-byte
 * Anchor discriminator, then `player: Pubkey` is the first field in state.rs. */
const PLAYER_FIELD_OFFSET = 8;

/**
 * Every receipt a wallet has ever minted, newest first — the "Career" strip's
 * data source. Plain `getProgramAccounts` + memcmp on `player`; Anchor's
 * `.all()` also prepends its own discriminator filter, so this only ever
 * matches CallReceipt accounts (never the singleton Config). Reads devnet
 * directly, so it survives a page refresh — there is no local cache to lose.
 */
export async function getPlayerReceipts(
  player: PublicKey,
  connection?: Connection,
): Promise<CallReceiptData[]> {
  try {
    const program = getReadOnlyProgram(connection);
    const results = await program.account.callReceipt.all([
      { memcmp: { offset: PLAYER_FIELD_OFFSET, bytes: player.toBase58() } },
    ]);
    return results
      .map(({ publicKey, account }) => decodeReceipt(publicKey, account as RawCallReceipt))
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch (e) {
    console.error("getPlayerReceipts failed", e);
    return [];
  }
}
