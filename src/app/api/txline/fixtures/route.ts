import { isSameOrigin } from "@/lib/txline/proxy";
import { txlineHost } from "@/lib/txline/config";
import { mapFixture } from "@/lib/txline/mapping";
import type { RawFixture } from "@/lib/txline/types";

/**
 * Plain-JSON (NOT SSE) proxy to the TxLINE fixtures snapshot — the piece the
 * live loop needs BEFORE the odds/scores streams: it tells the client which
 * fixtures exist, their real team names, and (critically) each fixture's
 * `Participant1IsHome` orientation, which the odds feed itself never carries.
 *
 *   GET <txlineHost()>/api/fixtures/snapshot
 *   Headers: Authorization: Bearer <JWT>, X-Api-Token: <token>
 *
 * Same guards as the SSE proxies (same-origin → creds/503 → upstream). Without
 * creds it returns 503, and LiveGameController falls back to placeholder match
 * defaults (so the mock/no-creds demo still runs). Returns
 * `{ fixtures: MappedFixture[] }`, each carrying `participant1IsHome` and
 * `gameState` so the client can pick an in-play fixture and orient its prices.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const jwt = process.env.TXLINE_JWT;
  const apiToken = process.env.TXLINE_API_TOKEN;
  if (!jwt || !apiToken) {
    return Response.json(
      {
        error: "TxLINE credentials not configured",
        hint: "Set TXLINE_JWT and TXLINE_API_TOKEN to load live fixtures; the demo uses placeholder match data.",
      },
      { status: 503 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${txlineHost()}/api/fixtures/snapshot`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        "X-Api-Token": apiToken,
        Accept: "application/json",
      },
      signal: request.signal,
    });
  } catch {
    return Response.json({ error: "TxLINE upstream unreachable" }, { status: 502 });
  }

  if (!upstream.ok) {
    return Response.json(
      { error: `TxLINE upstream responded ${upstream.status}` },
      { status: 502 },
    );
  }

  let body: unknown;
  try {
    body = await upstream.json();
  } catch {
    return Response.json({ error: "TxLINE upstream returned non-JSON" }, { status: 502 });
  }

  const raw = Array.isArray(body) ? (body as RawFixture[]) : [];
  const fixtures = raw
    .map((f) => mapFixture(f))
    .filter((f): f is NonNullable<typeof f> => f != null);

  return Response.json({ fixtures });
}
