import { parseSseFrames } from "./sse";

/**
 * Shared plumbing for TxLINE upstream SSE proxies (odds today, scores in a
 * later wave). Route handlers stay thin: build a URL, provide creds and a
 * per-frame normaliser, and hand the rest to `proxyEventStream`.
 */

export interface UpstreamCreds {
  jwt: string;
  apiToken: string;
}

/**
 * Build the upstream URL without ever string-interpolating query params —
 * `URLSearchParams` handles encoding, so a client-supplied value can't smuggle
 * extra query params (or anything else) into the upstream request.
 */
export function buildUpstreamUrl(
  base: string,
  params: Record<string, string | null | undefined>,
): string {
  const u = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value) u.searchParams.set(key, value);
  }
  return u.toString();
}

/**
 * Same-origin check for browser-initiated `EventSource` requests. Genuine
 * same-site requests normally send `Origin` (or at least `Referer`), but some
 * browsers omit `Origin` for same-site `EventSource` connections — so a
 * *missing* Origin/Referer is allowed through, while a *mismatched* one is
 * rejected. This stops a page on another domain from holding open streams
 * against our paid TxLINE credentials just by knowing the deployed URL.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin") ?? request.headers.get("referer");
  if (!origin) return true;
  try {
    const originHost = new URL(origin).host;
    const requestHost = new URL(request.url).host;
    return originHost === requestHost;
  } catch {
    return false; // malformed Origin/Referer — fail closed
  }
}

export interface ConnectionLimiter {
  /** Reserve a slot; returns false (and reserves nothing) if at capacity. */
  tryAcquire(): boolean;
  /** Release a previously-acquired slot. Safe to call more than once. */
  release(): void;
}

/**
 * A concurrent-connection counter, scoped to one module instance.
 *
 * Caveat: this lives in per-serverless-instance memory, not a shared store,
 * so under horizontal scaling each instance enforces its own cap rather than
 * one global limit. That's an accepted tradeoff for a hackathon — it raises
 * the floor against a discovered URL being used to open unbounded upstream
 * connections on paid creds, it isn't a production-grade global rate limit
 * (that would need a shared store, e.g. Redis/Upstash).
 */
export function createConnectionLimiter(max: number): ConnectionLimiter {
  let count = 0;
  return {
    tryAcquire() {
      if (count >= max) return false;
      count += 1;
      return true;
    },
    release() {
      count = Math.max(0, count - 1);
    },
  };
}

export interface ProxyStreamParams {
  upstreamUrl: string;
  creds: UpstreamCreds;
  /** Value of the client's `Last-Event-ID` request header, if any. */
  lastEventId: string | null;
  signal: AbortSignal;
  /**
   * Turn one upstream frame's joined `data:` payload into the JSON value to
   * re-emit to the client. Return `null`/`undefined` to drop the frame
   * (keep-alives, non-JSON comments). Throwing has the same effect as
   * returning null — the frame is skipped.
   */
  normalize: (data: string) => unknown;
  /**
   * Called exactly once when the stream ends — naturally, on client cancel,
   * or on an early error — so callers can release accounting like a
   * `ConnectionLimiter` slot without duplicating that logic per route.
   */
  onClose?: () => void;
}

/**
 * Connect to a TxLINE upstream SSE endpoint and re-emit normalised frames as
 * SSE to the caller, forwarding `id:` lines so `EventSource`/Last-Event-ID
 * resume works end to end.
 */
export async function proxyEventStream(
  params: ProxyStreamParams,
): Promise<Response> {
  const { upstreamUrl, creds, lastEventId, signal, normalize, onClose } = params;

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    onClose?.();
  };

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      headers: {
        Authorization: `Bearer ${creds.jwt}`,
        "X-Api-Token": creds.apiToken,
        Accept: "text/event-stream",
        ...(lastEventId ? { "Last-Event-ID": lastEventId } : {}),
      },
      signal,
    });
  } catch (err) {
    close();
    throw err;
  }

  if (!upstream.ok || !upstream.body) {
    close();
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
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await reader.read();
      } catch (err) {
        close();
        controller.error(err);
        return;
      }

      const { value, done } = result;
      if (done) {
        close();
        controller.close();
        return;
      }

      buffer += decoder.decode(value, { stream: true });
      const { frames, rest } = parseSseFrames(buffer);
      buffer = rest;

      for (const frame of frames) {
        if (!frame.data) continue;
        let normalized: unknown;
        try {
          normalized = normalize(frame.data);
        } catch {
          continue; // ignore keep-alives / non-JSON comments
        }
        if (normalized == null) continue;
        const idLine = frame.id ? `id: ${frame.id}\n` : "";
        controller.enqueue(
          encoder.encode(`${idLine}data: ${JSON.stringify(normalized)}\n\n`),
        );
      }
    },
    cancel() {
      close();
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

export interface TxlineStreamRouteConfig {
  /** Upstream SSE base URL (an env-configurable TxLINE endpoint). */
  upstreamBase: string;
  /** Per-route concurrent-connection limiter (module-scoped in the route). */
  limiter: ConnectionLimiter;
  /** Per-frame normaliser — e.g. `{kind:"odds",payload}` / `{kind:"score",event}`. */
  normalize: (data: string) => unknown;
  /** Human hint returned in the 503 body when creds are missing. */
  missingCredsHint?: string;
}

/**
 * The full GET flow shared by the odds and scores SSE proxies: same-origin
 * guard → creds check (503 without them) → concurrency cap (429) → build the
 * upstream URL → stream. The only per-route differences are the upstream base
 * and the frame normaliser, so a new proxy route is a few lines over this
 * helper instead of a copy-paste of the auth/limit boilerplate.
 */
export async function handleTxlineStreamRequest(
  request: Request,
  config: TxlineStreamRouteConfig,
): Promise<Response> {
  if (!isSameOrigin(request)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const jwt = process.env.TXLINE_JWT;
  const apiToken = process.env.TXLINE_API_TOKEN;
  if (!jwt || !apiToken) {
    return Response.json(
      {
        error: "TxLINE credentials not configured",
        hint:
          config.missingCredsHint ??
          "Set TXLINE_JWT and TXLINE_API_TOKEN to stream live data; the demo uses the recorded replay.",
      },
      { status: 503 },
    );
  }

  if (!config.limiter.tryAcquire()) {
    return Response.json(
      { error: "Too many concurrent streams — try again shortly" },
      { status: 429 },
    );
  }

  const { searchParams } = new URL(request.url);
  const upstreamUrl = buildUpstreamUrl(config.upstreamBase, {
    fixtureId: searchParams.get("fixtureId"),
  });
  const lastEventId = request.headers.get("Last-Event-ID");

  return proxyEventStream({
    upstreamUrl,
    creds: { jwt, apiToken },
    lastEventId,
    signal: request.signal,
    normalize: config.normalize,
    onClose: () => config.limiter.release(),
  });
}
