import {
  createConnectionLimiter,
  handleTxlineStreamRequest,
} from "@/lib/txline/proxy";
import type { FeedEvent, ScoreEvent } from "@/lib/txline/types";

/**
 * Server-side proxy to the TxLINE scores/events SSE stream — the mirror of the
 * odds proxy (`../stream/route.ts`), settling calls instead of opening them.
 *
 *   GET <TXLINE_SCORES_URL>   (default https://txline.txodds.com/api/scores/stream)
 *   Headers: Authorization: Bearer <JWT>, X-Api-Token: <token>
 *   Query:   fixtureId (optional), Last-Event-ID (resume, via header)
 *
 * Each upstream frame is normalised to `{kind:"score", event}` for the client
 * (`LiveGameController`). Without creds it returns 503 and the demo settles from
 * the recorded replay. All the auth / same-origin / concurrency / SSE-resume
 * plumbing is shared with the odds proxy via `handleTxlineStreamRequest`.
 */
export const dynamic = "force-dynamic";

const SCORES_URL =
  process.env.TXLINE_SCORES_URL ?? "https://txline.txodds.com/api/scores/stream";

// Per-serverless-instance concurrency cap (see createConnectionLimiter doc).
const limiter = createConnectionLimiter(20);

export function GET(request: Request) {
  return handleTxlineStreamRequest(request, {
    upstreamBase: SCORES_URL,
    limiter,
    normalize: (data): FeedEvent => ({
      kind: "score",
      event: JSON.parse(data) as ScoreEvent,
    }),
    missingCredsHint:
      "Set TXLINE_JWT and TXLINE_API_TOKEN to settle calls from the live scores feed; the demo settles from the recorded replay.",
  });
}
