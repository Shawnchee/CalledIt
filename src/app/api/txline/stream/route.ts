import type { FeedEvent, OddsPayload } from "@/lib/txline/types";

/**
 * Server-side proxy to the TxLINE odds SSE stream.
 *
 *   GET https://txline.txodds.com/api/odds/stream
 *   Headers: Authorization: Bearer <JWT>, X-Api-Token: <token>
 *   Query:   fixtureId (optional), Last-Event-ID (resume, via header)
 *
 * The browser's EventSource can't set auth headers, so we connect upstream
 * here (creds from server env), normalise each odds snapshot into a FeedEvent,
 * and re-emit as SSE to the client (`LiveTxlineFeed`).
 *
 * Without creds it returns 503 — the demo runs on the deterministic ReplayFeed,
 * and this flips to real data the moment TXLINE_JWT / TXLINE_API_TOKEN are set.
 */
export const dynamic = "force-dynamic";

const ODDS_URL =
  process.env.TXLINE_ODDS_URL ?? "https://txline.txodds.com/api/odds/stream";

export async function GET(request: Request) {
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

  const { searchParams } = new URL(request.url);
  const fixtureId = searchParams.get("fixtureId");
  const upstreamUrl = fixtureId ? `${ODDS_URL}?fixtureId=${fixtureId}` : ODDS_URL;

  const lastEventId = request.headers.get("Last-Event-ID");
  const upstream = await fetch(upstreamUrl, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      "X-Api-Token": apiToken,
      Accept: "text/event-stream",
      ...(lastEventId ? { "Last-Event-ID": lastEventId } : {}),
    },
    signal: request.signal,
  });

  if (!upstream.ok || !upstream.body) {
    return Response.json(
      { error: `TxLINE upstream responded ${upstream.status}` },
      { status: 502 },
    );
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = upstream.body.getReader();
  let buffer = "";

  const stream = new ReadableStream({
    async pull(controller) {
      const { value, done } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const dataLine = frame
          .split("\n")
          .find((l) => l.startsWith("data:"));
        if (!dataLine) continue;
        try {
          const payload = JSON.parse(dataLine.slice(5).trim()) as OddsPayload;
          const ev: FeedEvent = { kind: "odds", payload };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
        } catch {
          // ignore keep-alives / non-JSON comments
        }
      }
    },
    cancel() {
      reader.cancel().catch(() => {});
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
