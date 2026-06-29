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
}

export interface RecordCallResult {
  sig: string;
  receipt: string;
}

/**
 * Write the anti-hindsight receipt to devnet. `window_end` is given comfortable
 * slack so the tx always lands; the on-chain `created_at` (block time) is the
 * real proof of *when* the call was made.
 */
export async function recordCall(
  wallet: AnchorWallet,
  args: RecordCallArgs,
): Promise<RecordCallResult> {
  const program = getProgram(wallet);
  const player = wallet.publicKey;
  const receipt = callPda(player, args.matchId, args.propId);
  const marketPct = Math.min(9999, Math.max(1, Math.round(args.yesPct * 10000)));
  const windowEnd = new BN(Math.floor(Date.now() / 1000) + 180);

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
