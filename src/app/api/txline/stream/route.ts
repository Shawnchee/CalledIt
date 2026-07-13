import {
  buildUpstreamUrl,
  createConnectionLimiter,
  isSameOrigin,
  proxyEventStream,
} from "@/lib/txline/proxy";
import { oddsStreamUrl } from "@/lib/txline/config";
import { mapOddsFrame } from "@/lib/txline/mapping";
import type { FeedEvent } from "@/lib/txline/types";

/**
 * Server-side proxy to the TxLINE odds SSE stream.
 *
 *   GET <oddsStreamUrl()>   (devnet by default — see src/lib/txline/config.ts)
 *   Headers: Authorization: Bearer <JWT>, X-Api-Token: <token>
 *   Query:   fixtureId (optional), Last-Event-ID (resume, via header)
 *
 * The browser's EventSource can't set auth headers, so we connect upstream
 * here (creds from server env), normalise each odds snapshot into a FeedEvent,
 * and re-emit as SSE to the client (`LiveTxlineFeed`).
 *
 * Normalisation: an upstream `data:` frame may be ONE odds record or a JSON
 * array of them; `mapOddsFrame` (src/lib/txline/mapping.ts) handles both and
 * maps raw wire fields (string-percent `Pct`, ×1000 integer `Prices`,
 * "part1"/"draw"/"part2" `PriceNames`) to the clean `OddsPayload` the app
 * consumes. Returning `null` drops the frame (keep-alive, non-JSON, or an
 * unmappable record) — see proxyEventStream's `normalize` doc in proxy.ts.
 *
 * Without creds it returns 503 — the demo runs on the deterministic ReplayFeed,
 * and this flips to real data the moment TXLINE_JWT / TXLINE_API_TOKEN are set.
 *
 * Hardening (this route is otherwise an open proxy onto paid TxLINE creds):
 *  - same-origin check (403 on a mismatched Origin/Referer)
 *  - a concurrent-stream cap, 429 beyond it (see createConnectionLimiter doc
 *    comment in src/lib/txline/proxy.ts for the per-instance caveat)
 * The actual frame parsing / re-emit plumbing lives in src/lib/txline/proxy.ts
 * and src/lib/txline/sse.ts so the upcoming scores proxy can reuse it.
 */
export const dynamic = "force-dynamic";

// Cap concurrent upstream connections this route will hold open at once.
// Per-serverless-instance (module-scoped memory) — good enough to raise the
// floor against a discovered URL being abused for a hackathon; a production
// deployment would back this with a shared store across instances.
const MAX_CONCURRENT_STREAMS = 20;
const limiter = createConnectionLimiter(MAX_CONCURRENT_STREAMS);

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
        hint: "Set TXLINE_JWT and TXLINE_API_TOKEN to stream live odds; the demo uses ReplayFeed.",
      },
      { status: 503 },
    );
  }

  if (!limiter.tryAcquire()) {
    return Response.json(
      { error: "Too many concurrent streams — try again shortly" },
      { status: 429 },
    );
  }

  const { searchParams } = new URL(request.url);
  const upstreamUrl = buildUpstreamUrl(oddsStreamUrl(), {
    fixtureId: searchParams.get("fixtureId"),
  });
  const lastEventId = request.headers.get("Last-Event-ID");

  return proxyEventStream({
    upstreamUrl,
    creds: { jwt, apiToken },
    lastEventId,
    signal: request.signal,
    normalize: (data): FeedEvent | null => {
      const parsed: unknown = JSON.parse(data);
      const payload = mapOddsFrame(parsed);
      return payload ? { kind: "odds", payload } : null;
    },
    onClose: () => limiter.release(),
  });
}
