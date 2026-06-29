import type { FeedEvent, OddsPayload, TxlineFeed } from "./types";
import type { Prop } from "@/lib/game/types";

/**
 * LiveTxlineFeed — consumes the server SSE proxy (`/api/txline/stream`), which
 * relays the real TxLINE odds stream. Inert until TxLINE creds are set on the
 * server; the demo uses the deterministic ReplayFeed. This is the seam that
 * makes CalledIt run on real data during an actual live match.
 */
export class LiveTxlineFeed implements TxlineFeed {
  private source: EventSource | null = null;
  private handlers = new Set<(ev: FeedEvent) => void>();

  constructor(private fixtureId?: number) {}

  subscribe(handler: (ev: FeedEvent) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  start() {
    if (this.source) return;
    const url = this.fixtureId
      ? `/api/txline/stream?fixtureId=${this.fixtureId}`
      : `/api/txline/stream`;
    this.source = new EventSource(url);
    this.source.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data) as FeedEvent;
        this.handlers.forEach((h) => h(ev));
      } catch {
        /* ignore */
      }
    };
  }

  stop() {
    this.source?.close();
    this.source = null;
  }
}

/**
 * Convert a TxLINE odds snapshot into a callable Prop — the live analog of the
 * scripted replay props. Maps the most engaging in-play markets into a single
 * YES/NO call with the market's implied probability (TxLINE `Pct[]`).
 */
export function propFromOdds(payload: OddsPayload, windowSec = 600): Prop | null {
  if (!payload.InRunning) return null;

  const idx = (name: string) =>
    payload.PriceNames.findIndex((n) => n.toLowerCase().includes(name));

  let label: string | null = null;
  let yesPct: number | null = null;

  switch (payload.SuperOddsType) {
    case "NEXT_GOAL": {
      const home = idx("home");
      if (home >= 0) {
        label = "Home team to score next?";
        yesPct = payload.Pct[home];
      }
      break;
    }
    case "MATCH_ODDS": {
      const home = idx("home");
      if (home >= 0) {
        label = "Home team to win?";
        yesPct = payload.Pct[home];
      }
      break;
    }
    default: {
      // Generic: first outcome becomes the YES side.
      if (payload.PriceNames.length && payload.Pct.length) {
        label = `${payload.PriceNames[0]}?`;
        yesPct = payload.Pct[0];
      }
    }
  }

  if (label == null || yesPct == null || !isFinite(yesPct)) return null;

  return {
    id: Number(`${payload.FixtureId % 100000}${payload.Ts % 1000}`),
    minute: 0,
    label,
    detail: `${payload.Bookmaker} · ${payload.SuperOddsType}`,
    superOddsType: payload.SuperOddsType,
    yesPct: Math.min(0.99, Math.max(0.01, yesPct)),
    openedAt: Date.now(),
    windowEndsAt: Date.now() + windowSec * 1000,
    status: "open",
  };
}
