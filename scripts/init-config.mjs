// One-time: create the singleton Config + set the settlement authority.
// Must be signed by the program's upgrade authority (enforced on-chain).
import anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import fs from "node:fs";
import os from "node:os";

const { AnchorProvider, Program, Wallet } = anchor;
const BPF_LOADER_UPGRADEABLE = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");

const idl = JSON.parse(fs.readFileSync("src/lib/solana/idl/calledit.json", "utf8"));
const kp = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(fs.readFileSync(`${os.homedir()}/.config/solana/id.json`, "utf8"))),
);
const conn = new Connection("https://api.devnet.solana.com", "confirmed");
const program = new Program(idl, new AnchorProvider(conn, new Wallet(kp), { commitment: "confirmed" }));
const programId = new PublicKey(idl.address);

const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], programId);
const [programData] = PublicKey.findProgramAddressSync([programId.toBuffer()], BPF_LOADER_UPGRADEABLE);

const existing = await conn.getAccountInfo(config);
if (existing) {
  const cfg = await program.account.config.fetch(config);
  console.log("config already initialized:", config.toBase58(), "authority:", cfg.authority.toBase58());
  process.exit(0);
}

const sig = await program.methods
  .initializeConfig()
  .accountsPartial({
    config,
    authority: kp.publicKey,
    program: programId,
    programData,
    systemProgram: SystemProgram.programId,
  })
  .rpc();

console.log("✅ initialize_config tx:", sig);
const cfg = await program.account.config.fetch(config);
console.log("config:", config.toBase58());
console.log("authority:", cfg.authority.toBase58());
