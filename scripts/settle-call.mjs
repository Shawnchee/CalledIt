// Settle a CallReceipt (authority-gated). Points are computed on-chain.
import anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import fs from "node:fs";
import os from "node:os";

const { AnchorProvider, Program, Wallet } = anchor;
const idl = JSON.parse(fs.readFileSync("src/lib/solana/idl/calledit.json", "utf8"));
const kp = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(fs.readFileSync(`${os.homedir()}/.config/solana/id.json`, "utf8"))),
);
const conn = new Connection("https://api.devnet.solana.com", "confirmed");
const program = new Program(idl, new AnchorProvider(conn, new Wallet(kp), { commitment: "confirmed" }));
const programId = new PublicKey(idl.address);

const callPk = new PublicKey(process.argv[2] ?? "362TYENDX9iccvkLDrF1mbGAfdxJVXFZKFwZZEaY8ZUW");
const correct = (process.argv[3] ?? "true") === "true";
const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], programId);

const sig = await program.methods
  .settleCall(correct)
  .accountsPartial({ config, call: callPk, authority: kp.publicKey })
  .rpc();

console.log("✅ settle_call tx:", sig);
const acct = await program.account.callReceipt.fetch(callPk);
console.log({
  side: acct.side,
  marketPct: acct.marketPct,
  settled: acct.settled,
  outcome: acct.outcome,
  points: acct.points,
});
