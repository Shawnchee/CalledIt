#!/usr/bin/env node
/**
 * CalledIt — TxLINE live-mode credential helper.
 *
 * Real odds data needs an X-Api-Token. This script:
 *   1. always fetches a fresh guest JWT (POST /auth/guest/start — verified working);
 *   2. if TXLINE_API_TOKEN is already set (e.g. issued by TxLINE), validates it against
 *      the CURRENT v1.5.2 data endpoints (/api/fixtures/snapshot, then a per-fixture
 *      /api/odds/snapshot/{fixtureId});
 *   3. otherwise, if TXLINE_SUB_TXSIG + TXLINE_WALLET_SIG are provided, attempts
 *      POST /api/token/activate (leagues sent as an INT ARRAY per v1.5.2);
 *   4. writes the working credentials (TXLINE_JWT + TXLINE_API_TOKEN) into .env.local so
 *      `npm run dev` runs live mode — the app auto-flips to live once both are present.
 *
 * To MINT a token from scratch (on-chain subscribe → activate), use
 * scripts/txline-subscribe.mjs (`npm run txline:subscribe`).
 *
 * Usage:
 *   TXLINE_API_TOKEN=... node scripts/txline-activate.mjs                        # validate + wire an issued token
 *   TXLINE_SUB_TXSIG=... TXLINE_WALLET_SIG=... node scripts/txline-activate.mjs  # activate from a prior subscribe tx
 *   node scripts/txline-activate.mjs --network mainnet                           # target mainnet host
 */
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const HOSTS = {
  devnet: "https://txline-dev.txodds.com",
  mainnet: "https://txline.txodds.com",
};
const ENV_FILE = ".env.local";

function cliArg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function resolveNetwork() {
  return cliArg("network", process.env.TXLINE_NETWORK) === "mainnet" ? "mainnet" : "devnet";
}

function baseUrl() {
  return process.env.TXLINE_BASE_URL || HOSTS[resolveNetwork()];
}

/** Parse TXLINE_LEAGUES ("8,72") into an int array; empty ⇒ [] (standard bundle). */
function parseLeagues() {
  return (process.env.TXLINE_LEAGUES || "")
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n));
}

/**
 * Env writer — shared with txline-subscribe.mjs. Merges updates into .env.local and
 * chmods the file to 600 (it holds secrets). Never echoes secret values.
 */
export function writeEnv(updates, envFile = ENV_FILE) {
  const lines = existsSync(envFile) ? readFileSync(envFile, "utf8").split("\n") : [];
  const map = new Map();
  for (const l of lines) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) map.set(m[1], m[2]);
  }
  for (const [k, v] of Object.entries(updates)) map.set(k, v);
  const out = [...map.entries()].map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
  writeFileSync(envFile, out);
  try {
    chmodSync(envFile, 0o600);
  } catch {
    /* best-effort on platforms without chmod */
  }
}

export async function guestJwt(base = baseUrl()) {
  const r = await fetch(`${base}/auth/guest/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!r.ok) throw new Error(`guest auth failed: ${r.status}`);
  const { token } = await r.json();
  if (!token) throw new Error("no token in guest response");
  return token;
}

/**
 * Validate an issued API token against the CURRENT endpoints: /api/fixtures/snapshot,
 * then a per-fixture /api/odds/snapshot/{fixtureId}. A 200 on fixtures proves the token
 * is authorized for the subscription; the odds probe confirms odds access when a fixture
 * is available.
 */
async function validateToken(jwt, apiToken, base = baseUrl()) {
  const headers = { Authorization: `Bearer ${jwt}`, "X-Api-Token": apiToken };

  const fx = await fetch(`${base}/api/fixtures/snapshot`, { headers });
  const fxBody = await fx.text();
  if (!fx.ok) {
    return { ok: false, status: fx.status, body: fxBody.slice(0, 200), endpoint: "fixtures/snapshot" };
  }

  // Pull a fixture id from the response envelope to probe odds access.
  let fixtureId;
  try {
    const parsed = JSON.parse(fxBody);
    const list = Array.isArray(parsed)
      ? parsed
      : parsed.data || parsed.items || parsed.fixtures || parsed.results || [];
    const first = list[0] || {};
    fixtureId = first.FixtureId ?? first.Id ?? first.id ?? first.fixtureId;
  } catch {
    /* non-JSON is fine; fixtures still returned 200 */
  }

  if (fixtureId === undefined) {
    return { ok: true, status: fx.status, body: "fixtures OK (no fixture to probe odds)", endpoint: "fixtures/snapshot" };
  }

  const od = await fetch(`${base}/api/odds/snapshot/${encodeURIComponent(fixtureId)}?asOf=${Date.now()}`, { headers });
  const odBody = await od.text();
  return {
    ok: od.ok,
    status: od.status,
    body: od.ok ? `fixtures + odds OK (fixture ${fixtureId})` : odBody.slice(0, 200),
    endpoint: `odds/snapshot/${fixtureId}`,
  };
}

/** Activate from a prior on-chain subscribe tx. leagues → INT ARRAY (v1.5.2). */
async function activate(jwt, base = baseUrl()) {
  const r = await fetch(`${base}/api/token/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({
      txSig: process.env.TXLINE_SUB_TXSIG,
      walletSignature: process.env.TXLINE_WALLET_SIG,
      leagues: parseLeagues(), // int[]
    }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`activate ${r.status}: ${text.slice(0, 200)}`);
  // Response may be plain text OR JSON { token } / { apiToken }.
  let apiToken;
  try {
    const body = JSON.parse(text);
    apiToken = typeof body === "string" ? body : body.token ?? body.apiToken;
  } catch {
    apiToken = text.trim();
  }
  if (!apiToken) throw new Error("no apiToken in activate response");
  return apiToken;
}

async function main() {
  const base = baseUrl();
  const jwt = await guestJwt(base);
  console.log(`✓ guest JWT obtained (${resolveNetwork()} · ${base})`);

  let apiToken = process.env.TXLINE_API_TOKEN;

  if (apiToken) {
    const v = await validateToken(jwt, apiToken, base);
    if (!v.ok) {
      console.error(`✗ provided TXLINE_API_TOKEN rejected at /${v.endpoint} (${v.status}): ${v.body}`);
      process.exit(1);
    }
    console.log(`✓ provided API token validated: ${v.body}`);
  } else if (process.env.TXLINE_SUB_TXSIG && process.env.TXLINE_WALLET_SIG) {
    apiToken = await activate(jwt, base);
    console.log("✓ activation succeeded; API token issued");
  } else {
    console.error(
      "No credentials to wire. Either:\n" +
        "  • set TXLINE_API_TOKEN=<issued token> to validate + wire it, or\n" +
        "  • set TXLINE_SUB_TXSIG + TXLINE_WALLET_SIG to activate a prior subscribe tx, or\n" +
        "  • run `npm run txline:subscribe` to mint a token end-to-end (needs a funded SOLANA_KEYPAIR).",
    );
    process.exit(1);
  }

  writeEnv({ TXLINE_JWT: jwt, TXLINE_API_TOKEN: apiToken });
  console.log(`✓ wrote TXLINE_JWT, TXLINE_API_TOKEN to ${ENV_FILE} (chmod 600)`);
  console.log("Now run: npm run dev  (CalledIt auto-flips to live TxLINE data)");
}

// Run only when invoked directly — importing writeEnv/guestJwt from txline-subscribe.mjs
// must NOT trigger activation.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error("✗", e.message);
    process.exit(1);
  });
}
