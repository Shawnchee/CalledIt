import {
  createConnectionLimiter,
  handleTxlineStreamRequest,
} from "@/lib/txline/proxy";
import { scoresStreamUrl } from "@/lib/txline/config";
import { mapScoreFrame } from "@/lib/txline/mapping";
import type { FeedEvent } from "@/lib/txline/types";

/**
 * Server-side proxy to the TxLINE scores/events SSE stream — the mirror of the
 * odds proxy (`../stream/route.ts`), settling calls instead of opening them.
 *
 *   GET <scoresStreamUrl()>   (devnet by default — see src/lib/txline/config.ts)
 *   Headers: Authorization: Bearer <JWT>, X-Api-Token: <token>
 *   Query:   fixtureId (optional), Last-Event-ID (resume, via header)
 *
 * Normalisation: an upstream `data:` frame may be ONE scores/events record or
 * a JSON array of them; `mapScoreFrame` (src/lib/txline/mapping.ts) handles
 * both and picks the first mappable record — deriving `homeScore`/`awayScore`
 * from `Score.ParticipantN.Total.Goals`, `minute` from `Clock.Seconds`, and
 * `type` from `Action`/`StatusId`. Records with no `Score` payload at all
 * (possession, comment, lineups, and even some real event kinds like
 * `kickoff`/`free_kick`) map to `null` and the frame is dropped — see
 * mapping.ts's `mapScoreEvent` doc for why that's the honest behaviour.
 *
 * Each mapped frame is normalised to `{kind:"score", event}` for the client
 * (`LiveGameController`). Without creds it returns 503 and the demo settles from
 * the recorded replay. All the auth / same-origin / concurrency / SSE-resume
 * plumbing is shared with the odds proxy via `handleTxlineStreamRequest`.
 */
export const dynamic = "force-dynamic";

// Per-serverless-instance concurrency cap (see createConnectionLimiter doc).
const limiter = createConnectionLimiter(20);

export function GET(request: Request) {
  return handleTxlineStreamRequest(request, {
    upstreamBase: scoresStreamUrl(),
    limiter,
    normalize: (data): FeedEvent | null => {
      const parsed: unknown = JSON.parse(data);
      const event = mapScoreFrame(parsed);
      return event ? { kind: "score", event } : null;
    },
    missingCredsHint:
      "Set TXLINE_JWT and TXLINE_API_TOKEN to settle calls from the live scores feed; the demo settles from the recorded replay.",
  });
}
