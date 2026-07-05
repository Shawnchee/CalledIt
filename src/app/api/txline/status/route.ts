/**
 * Live-feed availability probe. Returns whether TxLINE creds are configured on
 * the server — a plain boolean, never the secrets themselves. The room uses it
 * to auto-suggest the live path, and `/room?feed=live` only engages when this
 * says `true` (so the app falls back to the recorded replay without creds).
 */
export const dynamic = "force-dynamic";

export function GET() {
  const live = Boolean(process.env.TXLINE_JWT && process.env.TXLINE_API_TOKEN);
  return Response.json({ live });
}
