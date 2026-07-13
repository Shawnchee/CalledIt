#!/usr/bin/env node
/**
 * CalledIt — mint a TxLINE API token END-TO-END (devnet subscription flow).
 *
 * Implements the proven TxLINE credential pipeline:
 *   1. subscribe on-chain: program.methods.subscribe(serviceLevel, weeks) with the
 *      Token-2022 subscription accounts  → txSig
 *   2. POST /auth/guest/start  → guest jwt
 *   3. sign  `${txSig}:${leagues.join(",")}:${jwt}`  with tweetnacl (empty leagues ⇒ `${txSig}::${jwt}`)
 *   4. POST /api/token/activate { txSig, walletSignature(base64), leagues } with Bearer jwt
 *   5. parse the token (plain-text OR JSON) and write it to .env.local (chmod 600)
 *
 * ⚠️ THIS SENDS A REAL TRANSACTION and SPENDS TxL tokens — it requires a FUNDED wallet
 * at SOLANA_KEYPAIR. On devnet this is free (airdrop devnet SOL first). The token value
 * is never echoed. Leave this UNRUN unless you have a funded keypair.
 *
 * Usage:
 *   SOLANA_KEYPAIR=~/.config/solana/id.json npm run txline:subscribe                       # devnet, service level 1
 *   SOLANA_KEYPAIR=... npm run txline:subscribe -- --network mainnet                        # mainnet, service level 12
 *   SOLANA_KEYPAIR=... TXLINE_SERVICE_LEVEL=3 TXLINE_LEAGUES=8,72 npm run txline:subscribe  # custom tier + leagues
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import nacl from "tweetnacl";
import { writeEnv, guestJwt } from "./txline-activate.mjs";

const { AnchorProvider, Program, Wallet } = anchor;

const NETWORKS = {
  devnet: {
    host: "https://txline-dev.txodds.com",
    rpc: "https://api.devnet.solana.com",
    idl: "../src/lib/txoracle/idl.devnet.json",
    defaultServiceLevel: 1,
  },
  mainnet: {
    host: "https://txline.txodds.com",
    rpc: "https://api.mainnet-beta.solana.com",
    idl: "../src/lib/txoracle/idl.mainnet.json",
    defaultServiceLevel: 12,
  },
};

function cliArg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function loadKeypair() {
  const path = (process.env.SOLANA_KEYPAIR || `${homedir()}/.config/solana/id.json`).replace(
    /^~/,
    homedir(),
  );
  const secret = Uint8Array.from(JSON.parse(readFileSync(path, "utf8")));
  return Keypair.fromSecretKey(secret);
}

function loadIdl(relPath) {
  const url = new URL(relPath, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8"));
}

function parseLeagues() {
  return (process.env.TXLINE_LEAGUES || "")
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n));
}

async function main() {
  const network = cliArg("network", process.env.TXLINE_NETWORK) === "mainnet" ? "mainnet" : "devnet";
  const net = NETWORKS[network];
  const rpcUrl = process.env.SOLANA_RPC_URL || net.rpc;
  const host = process.env.TXLINE_BASE_URL || net.host;
  const serviceLevel = Number(cliArg("service-level", process.env.TXLINE_SERVICE_LEVEL)) || net.defaultServiceLevel;
  const weeks = Number(cliArg("weeks", process.env.DURATION_WEEKS)) || 4; // helper requires a multiple of 4
  const leagues = parseLeagues();

  const idl = loadIdl(net.idl);
  const mintStr = idl.constants.find((c) => c.name === "TXLINE_MINT")?.value;
  if (!mintStr) throw new Error("TXLINE_MINT missing from vendored IDL constants");
  const tokenMint = new PublicKey(mintStr);

  const keypair = loadKeypair();
  const connection = new Connection(rpcUrl, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(keypair), { commitment: "confirmed" });
  anchor.setProvider(provider);
  const program = new Program(idl, provider);

  console.log(`Subscribe flow · ${network}`);
  console.log(`  program : ${program.programId.toBase58()}`);
  console.log(`  wallet  : ${keypair.publicKey.toBase58()}`);
  console.log(`  mint    : ${tokenMint.toBase58()}`);
  console.log(`  tier    : service level ${serviceLevel}, ${weeks} weeks, leagues [${leagues.join(",")}]`);
  console.warn(
    "⚠️  This broadcasts a REAL on-chain subscribe tx and spends TxL tokens from the wallet " +
      "above — it needs a FUNDED SOLANA_KEYPAIR (devnet: airdrop devnet SOL first).",
  );

  // Token-2022 accounts + PDAs (seeds per txoracle program addresses).
  const userTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    keypair,
    tokenMint,
    keypair.publicKey,
    false,
    "confirmed",
    undefined,
    TOKEN_2022_PROGRAM_ID,
  );

  const [pricingMatrixPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pricing_matrix")],
    program.programId,
  );
  const [tokenTreasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_treasury_v2")],
    program.programId,
  );
  const tokenTreasuryVault = getAssociatedTokenAddressSync(
    tokenMint,
    tokenTreasuryPda,
    true,
    TOKEN_2022_PROGRAM_ID,
  );

  // 1. Subscribe on-chain (service_level_id: u16, weeks: u8).
  console.log("\nSubscribing on-chain…");
  const txSig = await program.methods
    .subscribe(serviceLevel, weeks)
    .accounts({
      user: keypair.publicKey,
      pricingMatrix: pricingMatrixPda,
      tokenMint,
      userTokenAccount: userTokenAccount.address,
      tokenTreasuryVault,
      tokenTreasuryPda,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log(`  tx confirmed: ${txSig}`);
  console.log(`  explorer: https://explorer.solana.com/tx/${txSig}?cluster=${network === "mainnet" ? "mainnet-beta" : "devnet"}`);

  // 2. Guest JWT (reuse txline-activate.mjs).
  const jwt = await guestJwt(host);
  console.log("  guest JWT obtained");

  // 3. Sign the binding message. Empty leagues ⇒ `${txSig}::${jwt}`.
  const messageString = `${txSig}:${leagues.join(",")}:${jwt}`;
  const signatureBytes = nacl.sign.detached(new TextEncoder().encode(messageString), keypair.secretKey);
  const walletSignature = Buffer.from(signatureBytes).toString("base64");

  // 4. Activate.
  console.log("Activating API access…");
  const res = await fetch(`${host}/api/token/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ txSig, walletSignature, leagues }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`activate ${res.status}: ${text.slice(0, 200)}`);

  // 5. Parse token (plain-text OR JSON) — never echoed.
  let apiToken;
  try {
    const body = JSON.parse(text);
    apiToken = typeof body === "string" ? body : body.token ?? body.apiToken;
  } catch {
    apiToken = text.trim();
  }
  if (!apiToken) throw new Error("no token in activate response");

  writeEnv({ TXLINE_NETWORK: network, TXLINE_JWT: jwt, TXLINE_API_TOKEN: apiToken });
  console.log("✓ wrote TXLINE_NETWORK, TXLINE_JWT, TXLINE_API_TOKEN to .env.local (chmod 600)");
  console.log("Now run: npm run dev  (CalledIt auto-flips to live TxLINE data)");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error("✗", e.message);
    process.exit(1);
  });
}
