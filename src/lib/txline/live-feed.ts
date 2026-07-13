import type { MappedFixture } from "./mapping";
import type { FeedEvent, OddsPayload, ScoreEvent, TxlineFeed } from "./types";
import type { Prop, Side } from "@/lib/game/types";
import type { GameEngine } from "@/lib/game/engine";

/** Fixture context the live loop resolves once (from /api/txline/fixtures). */
export interface FixtureContext {
  fixtureId: number;
  homeName: string;
  awayName: string;
  /** part1/Participant1 is home iff true — the odds feed lacks this field. */
  participant1IsHome: boolean;
}

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
  private fixtureId?: number;
  private path: string;

  // Explicit field assignment (not `constructor(private …)`) so this module
  // parses under Node's strip-only TS in `node --test` — parameter properties
  // need codegen, which strip-only mode rejects.
  constructor(fixtureId?: number, path = "/api/txline/stream") {
    this.fixtureId = fixtureId;
    this.path = path;
  }

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
 * Convert a TxLINE odds record into a callable, GOAL-SETTLEABLE Prop.
 *
 * The free World Cup tier only reliably emits the 1X2
 * ("1X2_PARTICIPANT_RESULT") market, whose `PriceNames` are
 * `["part1","draw","part2"]` — NOT the "NEXT_GOAL"/"MATCH_ODDS" markets the
 * original code switched on (those never appear, so `idx("home")` was always
 * -1 and no prop ever opened). We reuse the home team's 1X2 implied
 * probability as a proxy price for a call the scores feed CAN actually
 * resolve: "{home} to score in the next N min?" — settled YES on a home goal
 * inside the window, NO otherwise. That keeps the loop honest AND alive.
 *
 * Notes vs the real payloads:
 *  - `InRunning` is NOT a reliable "match is live" flag (a clearly mid-match
 *    France v Spain record carried `InRunning: false`), so we do NOT gate on
 *    it. The client-side fixture filter + scores feed drive liveness instead.
 *  - The odds record has no `Participant1IsHome`, so `part1` is only the home
 *    price when the fixture's `participant1IsHome` is true — hence `ctx`.
 *  - Prefer StablePrice (demargined) records; accept when `MessageId` is
 *    absent (snapshots may omit it) but reject a non-StablePrice priced one.
 */
export function propFromOdds(
  payload: OddsPayload,
  windowSec = 600,
  ctx?: { homeName: string; participant1IsHome: boolean },
): Prop | null {
  if (payload.SuperOddsType !== "1X2_PARTICIPANT_RESULT") return null;
  if (payload.PriceNames.length === 0 || payload.Pct.length === 0) return null;
  // Prefer StablePrice (demargined) records — MessageId ends with mapping.ts's
  // STABLE_PRICE_SUFFIX ("-stab"). Inlined (not imported) so this module has no
  // runtime relative import and stays loadable under Node's strip-only TS in
  // `node --test`. Accept records with no MessageId (snapshots may omit it).
  if (payload.MessageId != null && !payload.MessageId.endsWith("-stab")) return null;

  const homeName = ctx?.homeName ?? "Home";
  // part1 = Participant1; that's the home price only when Participant1 is home.
  const wantPart = ctx && !ctx.participant1IsHome ? "part2" : "part1";
  const found = payload.PriceNames.findIndex((n) => n.toLowerCase() === wantPart);
  const homeIdx = found >= 0 ? found : 0;
  const yesPct = payload.Pct[homeIdx];
  if (yesPct == null || !isFinite(yesPct)) return null;

  const minutes = Math.round(windowSec / 60);
  const openedAt = Date.now();
  return {
    id: ++livePropSeq,
    minute: 0,
    label: `${homeName} to score in the next ${minutes} min?`,
    detail: `${payload.Bookmaker} · ${payload.SuperOddsType}`,
    superOddsType: payload.SuperOddsType,
    team: "home",
    yesPct: Math.min(0.99, Math.max(0.01, yesPct)),
    openedAt,
    windowEndsAt: openedAt + windowSec * 1000,
    status: "open",
    // Provenance markers straight off the wire — surfaced (not validated) on
    // the receipt page. See mapping.ts's isStablePrice() for the "-stab" check.
    oddsTs: payload.Ts,
    oddsMessageId: payload.MessageId,
  };
}

/**
 * LiveGameController — the client-side orchestrator that drives a GameEngine
 * (constructed in live mode) from the real TxLINE feeds. It owns the fixture
 * context, the two SSE subscriptions, the "one open call at a time" dedupe,
 * the per-prop window timers, and the honest settlement rules.
 *
 * On start() it first resolves the real fixture from /api/txline/fixtures
 * (team names + the `participant1IsHome` orientation the odds feed lacks),
 * stamps it onto the engine, and — if no fixtureId was supplied — adopts the
 * chosen fixture's id before opening the streams. Without creds that fetch
 * 503s and it falls back to the placeholder match so the mock/no-creds demo
 * still runs.
 *
 * Settlement is honest but now actually resolves. Every live prop is a
 * "{home} to score in the next N min?" call (see propFromOdds):
 *  - settles YES on a GOAL by the prop's team inside the window (with a `Ts`
 *    guard so a replayed/backlog goal from a stream reconnect can't instantly
 *    settle a freshly opened prop),
 *  - settles NO at window end if no such goal arrived (the scores feed's
 *    silence is real information),
 *  - FULL_TIME ends the match.
 */
export class LiveGameController {
  private oddsFeed: LiveTxlineFeed;
  private scoresFeed: LiveTxlineFeed;
  private unsubscribers: Array<() => void> = [];
  private windowTimer: ReturnType<typeof setTimeout> | null = null;
  /** The currently-open, not-yet-settled live prop (the dedupe gate). */
  private pending: Prop | null = null;
  /** Resolved fixture context (team names + orientation); null until start(). */
  private ctx: FixtureContext | null = null;
  private stopped = false;
  private engine: GameEngine;
  private fixtureId?: number;
  private windowSec: number;

  // Explicit field assignment (not `constructor(private …)`) so this module
  // parses under Node's strip-only TS in `node --test` — parameter properties
  // need codegen, which strip-only mode rejects.
  constructor(engine: GameEngine, fixtureId?: number, windowSec = 600) {
    this.engine = engine;
    this.fixtureId = fixtureId;
    this.windowSec = windowSec;
    this.oddsFeed = new LiveTxlineFeed(fixtureId, "/api/txline/stream");
    this.scoresFeed = new LiveTxlineFeed(fixtureId, "/api/txline/scores");
  }

  async start() {
    // Resolve the real fixture BEFORE opening the streams so props are
    // labelled and oriented correctly. Never throws — falls back to defaults.
    await this.loadFixtureContext();
    if (this.stopped) return; // stop() may have fired during the await

    if (this.fixtureId != null) this.engine.setFixtureId(this.fixtureId);

    // (Re)create the feeds with the (possibly newly-adopted) fixtureId.
    this.oddsFeed = new LiveTxlineFeed(this.fixtureId, "/api/txline/stream");
    this.scoresFeed = new LiveTxlineFeed(this.fixtureId, "/api/txline/scores");
    this.unsubscribers.push(this.oddsFeed.subscribe((ev) => this.onFeed(ev)));
    this.unsubscribers.push(this.scoresFeed.subscribe((ev) => this.onFeed(ev)));
    this.oddsFeed.start();
    this.scoresFeed.start();
  }

  stop() {
    this.stopped = true;
    for (const off of this.unsubscribers) off();
    this.unsubscribers = [];
    this.oddsFeed.stop();
    this.scoresFeed.stop();
    this.clearWindowTimer();
    this.pending = null;
  }

  /**
   * Fetch /api/txline/fixtures and pick the fixture to track: the one matching
   * an explicit fixtureId, else the first with an in-play GameState signal,
   * else the first. Caches team names + orientation and stamps the engine. On
   * any failure (503 without creds, network error, empty list) it falls back
   * to the placeholder match's names and participant1IsHome=true, and never
   * throws — the loop must keep running in the mock/no-creds demo.
   */
  private async loadFixtureContext() {
    const placeholder = this.engine.getState().match;
    // Sensible default so onOdds always has a ctx even if the fetch fails.
    this.ctx = {
      fixtureId: this.fixtureId ?? placeholder.fixtureId,
      homeName: placeholder.home.name,
      awayName: placeholder.away.name,
      participant1IsHome: true,
    };

    let fixtures: MappedFixture[] = [];
    // Bound the wait so a slow/unreachable fixtures upstream (e.g. the mock's
    // no-fixtures path) can't stall the whole live loop — abort and fall back.
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 8000);
    try {
      const res = await fetch("/api/txline/fixtures", { signal: abort.signal });
      if (!res.ok) return; // 503 (no creds) / 502 (upstream) — keep defaults
      const body: unknown = await res.json();
      const list = (body as { fixtures?: unknown })?.fixtures;
      if (Array.isArray(list)) fixtures = list as MappedFixture[];
    } catch {
      return; // network error / abort — keep defaults, never throw
    } finally {
      clearTimeout(timer);
    }
    if (fixtures.length === 0) return;

    const chosen =
      (this.fixtureId != null
        ? fixtures.find((f) => f.fixtureId === this.fixtureId)
        : undefined) ??
      fixtures.find((f) => f.gameState != null) ??
      fixtures[0];
    if (!chosen) return;

    this.ctx = {
      fixtureId: chosen.fixtureId,
      homeName: chosen.home,
      awayName: chosen.away,
      participant1IsHome: chosen.participant1IsHome,
    };
    // Adopt the chosen fixture's id when none was supplied.
    if (this.fixtureId == null) this.fixtureId = chosen.fixtureId;

    this.engine.setMatch({
      fixtureId: chosen.fixtureId,
      competition: chosen.competition,
      homeName: chosen.home,
      awayName: chosen.away,
    });
  }

  private onFeed(ev: FeedEvent) {
    // Client-side fixture filter: multiple in-play fixtures can interleave on
    // the shared stream regardless of whether upstream honours ?fixtureId, so
    // drop anything that isn't the fixture we're tracking (once it's known).
    if (this.fixtureId != null) {
      if (ev.kind === "odds" && ev.payload.FixtureId !== this.fixtureId) return;
      if (ev.kind === "score" && ev.event.FixtureId !== this.fixtureId) return;
    }
    if (ev.kind === "odds") this.onOdds(ev.payload);
    else if (ev.kind === "score") this.onScore(ev.event);
    else if (ev.kind === "clock") this.engine.setMinute(ev.minute);
  }

  private onOdds(payload: OddsPayload) {
    if (this.engine.getState().status === "fulltime") return;
    // dedupe: one open call at a time (free-tier windows are minutes long)
    if (this.pending) return;
    const prop = propFromOdds(
      payload,
      this.windowSec,
      this.ctx
        ? { homeName: this.ctx.homeName, participant1IsHome: this.ctx.participant1IsHome }
        : undefined,
    );
    if (!prop) return;
    this.pending = prop;
    this.engine.openProp(prop);
    this.clearWindowTimer();
    const ms = Math.max(0, prop.windowEndsAt - Date.now());
    this.windowTimer = setTimeout(() => this.onWindowEnd(prop), ms);
  }

  private onScore(event: ScoreEvent) {
    // mapScoreEvent (src/lib/txline/mapping.ts) only ever emits an event when
    // the raw record carried a genuine Score payload, so this is safe to
    // apply unconditionally — it never resets the scoreboard off a scoreless
    // record (kickoff, free kick, possession, ...).
    this.engine.setScore(event.homeScore, event.awayScore);
    this.engine.setMinute(event.minute);

    if (event.type === "FULL_TIME") {
      this.clearWindowTimer();
      this.pending = null;
      this.engine.endMatch();
      return;
    }

    const prop = this.pending;
    if (!prop) return;

    // Settle YES only on a GOAL by the prop's team, and only if the goal is
    // NOT older than the prop's open (the `Ts` guard rejects a replayed/
    // backlog goal that a stream reconnect + Last-Event-ID resume can deliver).
    if (
      event.type === "GOAL" &&
      event.team === prop.team &&
      event.Ts >= prop.openedAt
    ) {
      const who = this.ctx?.homeName ?? "Home";
      this.settle(prop, "YES", `⚽ GOAL — ${who} · called it`);
    }
  }

  private onWindowEnd(prop: Prop) {
    if (this.pending?.id !== prop.id) return; // already settled inside the window
    // No qualifying goal arrived in the window → NO (the feed's silence is
    // real information). These props ARE resolvable, so never leave them
    // stuck "settling…".
    this.settle(prop, "NO", "No goal in the window — settled NO");
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
