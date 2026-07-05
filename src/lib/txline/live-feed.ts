import type { FeedEvent, OddsPayload, ScoreEvent, TxlineFeed } from "./types";
import type { Prop, Side } from "@/lib/game/types";
import type { GameEngine } from "@/lib/game/engine";

/**
 * LiveTxlineFeed — consumes a server SSE proxy that relays a real TxLINE stream.
 * Points at the odds proxy (`/api/txline/stream`) by default; pass a different
 * `path` (e.g. `/api/txline/scores`) to consume the scores stream with the same
 * plumbing. Inert until TxLINE creds are set on the server; the demo uses the
 * deterministic replay. This is the seam that makes CalledIt run on real data.
 */
export class LiveTxlineFeed implements TxlineFeed {
  private source: EventSource | null = null;
  private handlers = new Set<(ev: FeedEvent) => void>();

  constructor(
    private fixtureId?: number,
    private path = "/api/txline/stream",
  ) {}

  subscribe(handler: (ev: FeedEvent) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  start() {
    if (this.source) return;
    const url = this.fixtureId
      ? `${this.path}?fixtureId=${this.fixtureId}`
      : this.path;
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
 * Monotonic prop-id source for live props, seeded per session (per page load)
 * off the clock — the same salting idea as the room's `sessionBase`. Replaces
 * the old `Number(`${FixtureId % 100000}${Ts % 1000}`)` scheme, whose
 * string-concat collided whenever two snapshots shared the low fixture/ts
 * digits. Ids only need per-session uniqueness; the room salts them again
 * before minting the on-chain receipt.
 */
let livePropSeq = Math.floor(Date.now() / 1000) * 100;

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

  const openedAt = Date.now();
  return {
    id: ++livePropSeq,
    minute: 0,
    label,
    detail: `${payload.Bookmaker} · ${payload.SuperOddsType}`,
    superOddsType: payload.SuperOddsType,
    yesPct: Math.min(0.99, Math.max(0.01, yesPct)),
    openedAt,
    windowEndsAt: openedAt + windowSec * 1000,
    status: "open",
  };
}

/**
 * LiveGameController — the client-side orchestrator that drives a GameEngine
 * (constructed in live mode) from the real TxLINE feeds. It owns the two SSE
 * subscriptions, the "one open call at a time" dedupe, the per-prop window
 * timers, and the honest settlement rules.
 *
 * Settlement is deliberately conservative — it never fabricates an outcome:
 *  - NEXT_GOAL props settle YES on a GOAL inside the window, else NO at window
 *    end (the scores feed's silence is real information).
 *  - Any other market (MATCH_ODDS, TOTAL_GOALS, …) that a single mid-match
 *    scores event can't resolve is locked at window end and left visibly
 *    "settling…" rather than guessed.
 */
export class LiveGameController {
  private oddsFeed: LiveTxlineFeed;
  private scoresFeed: LiveTxlineFeed;
  private unsubscribers: Array<() => void> = [];
  private windowTimer: ReturnType<typeof setTimeout> | null = null;
  /** The currently-open, not-yet-settled live prop (the dedupe gate). */
  private pending: Prop | null = null;

  constructor(
    private engine: GameEngine,
    private fixtureId?: number,
    private windowSec = 600,
  ) {
    this.oddsFeed = new LiveTxlineFeed(fixtureId, "/api/txline/stream");
    this.scoresFeed = new LiveTxlineFeed(fixtureId, "/api/txline/scores");
  }

  start() {
    if (this.fixtureId != null) this.engine.setFixtureId(this.fixtureId);
    this.unsubscribers.push(this.oddsFeed.subscribe((ev) => this.onFeed(ev)));
    this.unsubscribers.push(this.scoresFeed.subscribe((ev) => this.onFeed(ev)));
    this.oddsFeed.start();
    this.scoresFeed.start();
  }

  stop() {
    for (const off of this.unsubscribers) off();
    this.unsubscribers = [];
    this.oddsFeed.stop();
    this.scoresFeed.stop();
    this.clearWindowTimer();
    this.pending = null;
  }

  private onFeed(ev: FeedEvent) {
    if (ev.kind === "odds") this.onOdds(ev.payload);
    else if (ev.kind === "score") this.onScore(ev.event);
    else if (ev.kind === "clock") this.engine.setMinute(ev.minute);
  }

  private onOdds(payload: OddsPayload) {
    if (this.engine.getState().status === "fulltime") return;
    // dedupe: one open call at a time (free-tier windows are minutes long)
    if (this.pending) return;
    const prop = propFromOdds(payload, this.windowSec);
    if (!prop) return;
    this.pending = prop;
    this.engine.openProp(prop);
    this.clearWindowTimer();
    const ms = Math.max(0, prop.windowEndsAt - Date.now());
    this.windowTimer = setTimeout(() => this.onWindowEnd(prop), ms);
  }

  private onScore(event: ScoreEvent) {
    // keep the scoreboard honest with the real feed
    this.engine.setScore(event.homeScore, event.awayScore);
    if (typeof event.minute === "number") this.engine.setMinute(event.minute);

    if (event.type === "FULL_TIME") {
      this.clearWindowTimer();
      this.pending = null;
      this.engine.endMatch();
      return;
    }

    const prop = this.pending;
    if (!prop) return;

    if (prop.superOddsType === "NEXT_GOAL" && event.type === "GOAL") {
      this.settle(prop, "YES", `⚽ GOAL${event.label ? ` — ${event.label}` : ""} · called it`);
    }
  }

  private onWindowEnd(prop: Prop) {
    if (this.pending?.id !== prop.id) return; // already settled inside the window
    if (prop.superOddsType === "NEXT_GOAL") {
      // no goal in the window → NO (the scores feed's silence is real information)
      this.settle(prop, "NO", "No goal in the window — settled NO");
    } else {
      // don't fabricate an outcome a mid-match scores event can't resolve
      this.engine.lockProp(prop.id);
      this.pending = null;
      this.clearWindowTimer();
    }
  }

  private settle(prop: Prop, outcome: Side, label: string) {
    this.clearWindowTimer();
    this.engine.resolveProp(prop.id, outcome, label);
    this.pending = null;
  }

  private clearWindowTimer() {
    if (this.windowTimer) {
      clearTimeout(this.windowTimer);
      this.windowTimer = null;
    }
  }
}
