// Verifies the on-chain receipt path against the deployed devnet program.
// Uses the same instruction the web app's recordCall() builds.
import anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import fs from "node:fs";
import os from "node:os";

const { AnchorProvider, Program, BN, Wallet } = anchor;

const idl = JSON.parse(fs.readFileSync("src/lib/solana/idl/calledit.json", "utf8"));
const secret = JSON.parse(fs.readFileSync(`${os.homedir()}/.config/solana/id.json`, "utf8"));
const kp = Keypair.fromSecretKey(new Uint8Array(secret));

const conn = new Connection("https://api.devnet.solana.com", "confirmed");
const provider = new AnchorProvider(conn, new Wallet(kp), { commitment: "confirmed" });
const program = new Program(idl, provider);
const programId = new PublicKey(idl.address);

const matchId = new BN(1042026);
const propId = new BN(Math.floor(Math.random() * 1e9)); // unique per run
const side = 1; // YES
const marketPct = 2700; // 27% implied
const windowEnd = new BN(Math.floor(Date.now() / 1000) + 180);

const [call] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("call"),
    kp.publicKey.toBuffer(),
    matchId.toArrayLike(Buffer, "le", 8),
    propId.toArrayLike(Buffer, "le", 8),
  ],
  programId,
);

console.log("program:", programId.toBase58());
console.log("player :", kp.publicKey.toBase58());
console.log("receipt:", call.toBase58());

const sig = await program.methods
  .recordCall(matchId, propId, side, marketPct, windowEnd)
  .accountsPartial({ call, player: kp.publicKey, systemProgram: SystemProgram.programId })
  .rpc();

console.log("\n✅ record_call tx:", sig);

const acct = await program.account.callReceipt.fetch(call);
console.log("\nCallReceipt on-chain:");
console.log({
  player: acct.player.toBase58(),
  matchId: acct.matchId.toString(),
  propId: acct.propId.toString(),
  side: acct.side,
  marketPct: acct.marketPct,
  createdAt: new Date(acct.createdAt.toNumber() * 1000).toISOString(),
  settled: acct.settled,
  outcome: acct.outcome,
  points: acct.points,
});
