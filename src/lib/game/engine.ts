import type {
  Call,
  GameState,
  LeaderboardRow,
  Player,
  Prop,
  Side,
} from "./types";
import { pointsFor } from "./scoring";
import { BOTS, SCRIPT, type MatchScript, type ScriptRound } from "./replay-match";

export const YOU_ID = "you";

type Listener = (s: GameState) => void;

let callSeq = 0;
let tickerSeq = 0;

/**
 * The CalledIt game engine. Plays a MatchScript on a real-time clock: opens
 * calls, runs the countdown, fires bot calls, settles from the (replayed)
 * TxLINE outcome, and keeps a live leaderboard. UI subscribes for state.
 *
 * Deterministic and framework-agnostic — no React, no globals beyond ids.
 */
export class GameEngine {
  private script: MatchScript;
  private state: GameState;
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;

  // fired-event cursors so each scripted moment happens exactly once
  private offered = new Set<number>();
  private locked = new Set<number>();
  private resolved = new Set<number>();
  private botFired = new Set<string>();

  /** Called when the local player's call is settled — lets the UI react. */
  private youSettledHandler?: (call: Call, prop: Prop) => void;

  /**
   * Register the settled-call handler. A method (not a public mutable field) so
   * the React caller doesn't mutate a hook-returned value (react-hooks v6).
   */
  setYouSettledHandler(fn: ((call: Call, prop: Prop) => void) | undefined) {
    this.youSettledHandler = fn;
  }

  constructor(script: MatchScript = SCRIPT, youName = "You", youAvatar = "🫵") {
    this.script = script;
    const you: Player = mkPlayer(YOU_ID, youName, youAvatar, true, false);
    const bots = script.bots.map((b) => mkPlayer(b.id, b.name, b.avatar, false, true));
    this.state = {
      match: script.match,
      minute: 0,
      homeScore: 0,
      awayScore: 0,
      status: "pregame",
      activeProp: undefined,
      props: [],
      calls: [],
      players: [you, ...bots],
      leaderboard: [],
      ticker: [],
    };
    this.recomputeLeaderboard();
  }

  getState(): GameState {
    return this.state;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  setYouIdentity(name: string, avatar?: string) {
    const you = this.state.players.find((p) => p.id === YOU_ID);
    if (you) {
      you.name = name;
      if (avatar) you.avatar = avatar;
      this.commit();
    }
  }

  start() {
    if (this.timer) return;
    this.startedAt = Date.now();
    this.state.status = "live";
    this.pushTicker(`Kick-off — ${this.state.match.home.name} v ${this.state.match.away.name}`);
    this.timer = setInterval(() => this.tick(), 200);
    this.tick();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Local player taps in on the active call. Returns the Call (for the on-chain receipt). */
  placeCall(propId: number, side: Side): Call | null {
    return this.addCall(YOU_ID, propId, side);
  }

  /** Attach the devnet receipt signature once record_call confirms. */
  attachReceipt(callId: string, sig: string) {
    const c = this.state.calls.find((x) => x.id === callId);
    if (c) {
      c.receiptSig = sig;
      this.commit();
    }
  }

  hasCalled(propId: string | number, playerId = YOU_ID): boolean {
    return this.state.calls.some((c) => c.propId === Number(propId) && c.playerId === playerId);
  }

  // ---- internals ----

  private elapsed(): number {
    return (Date.now() - this.startedAt) / 1000;
  }

  private tick() {
    const t = this.elapsed();
    const { rounds, durationSec } = this.script;

    for (const r of rounds) {
      // open the call
      if (t >= r.offerAt && !this.offered.has(r.propId)) {
        this.offered.add(r.propId);
        const prop: Prop = {
          id: r.propId,
          minute: r.minute,
          label: r.label,
          detail: r.detail,
          superOddsType: r.superOddsType,
          yesPct: r.yesPct,
          openedAt: this.startedAt + r.offerAt * 1000,
          windowEndsAt: this.startedAt + (r.offerAt + r.windowSec) * 1000,
          status: "open",
        };
        this.state.props.push(prop);
        this.state.activeProp = prop;
        this.pushTicker(`📣 New call · ${r.label} — market ${Math.round(r.yesPct * 100)}%`);
      }

      // fire bot calls during the window
      for (const bc of r.botCalls) {
        const key = `${r.propId}:${bc.botId}`;
        if (t >= bc.at && !this.botFired.has(key) && this.offered.has(r.propId)) {
          this.botFired.add(key);
          this.addCall(bc.botId, r.propId, bc.side);
        }
      }

      // lock the window
      if (t >= r.offerAt + r.windowSec && !this.locked.has(r.propId)) {
        this.locked.add(r.propId);
        const prop = this.state.props.find((p) => p.id === r.propId);
        if (prop && prop.status === "open") prop.status = "locked";
      }

      // resolve
      if (t >= r.resolveAt && !this.resolved.has(r.propId)) {
        this.resolved.add(r.propId);
        this.settleRound(r);
      }
    }

    // match clock + lifecycle
    this.state.minute = Math.min(90, Math.floor((t / durationSec) * 90));
    if (t >= durationSec && this.state.status !== "fulltime") {
      this.state.status = "fulltime";
      this.state.activeProp = undefined;
      this.pushTicker("🏁 Full-time. The receipts don't lie.");
      this.stop();
    }

    this.commit();
  }

  private addCall(playerId: string, propId: number, side: Side): Call | null {
    const prop = this.state.props.find((p) => p.id === propId);
    if (!prop || prop.status !== "open") return null;
    if (this.state.calls.some((c) => c.propId === propId && c.playerId === playerId)) return null;

    const call: Call = {
      id: `c${++callSeq}`,
      propId,
      playerId,
      side,
      marketYesPct: prop.yesPct,
      placedAt: Date.now(),
    };
    this.state.calls.push(call);

    const player = this.state.players.find((p) => p.id === playerId);
    if (player) player.totalCalls += 1;
    if (playerId !== YOU_ID && player) {
      this.pushTicker(`${player.avatar} ${player.name} called ${side} · ${prop.label}`);
    }
    // refresh so "N/M called right" reflects the new call immediately, not only after settle
    this.recomputeLeaderboard();
    this.commit();
    return call;
  }

  private settleRound(r: ScriptRound) {
    const { propId, outcome, resolveLabel } = r;
    const prop = this.state.props.find((p) => p.id === propId);
    if (prop) {
      prop.status = "settled";
      prop.outcome = outcome;
      prop.resolveLabel = resolveLabel;
      if (this.state.activeProp?.id === propId) this.state.activeProp = undefined;
    }
    if (r.scoreAfter) {
      this.state.homeScore = r.scoreAfter.home;
      this.state.awayScore = r.scoreAfter.away;
    }
    this.pushTicker(resolveLabel);

    for (const call of this.state.calls.filter((c) => c.propId === propId)) {
      const correct = call.side === outcome;
      const pts = pointsFor(call.side, call.marketYesPct, correct);
      call.correct = correct;
      call.points = pts;
      const player = this.state.players.find((p) => p.id === call.playerId);
      if (player) {
        player.points += pts;
        if (correct) {
          player.correctCalls += 1;
          player.streak += 1;
        } else {
          player.streak = 0;
        }
      }
      if (call.playerId === YOU_ID && prop) this.youSettledHandler?.(call, prop);
    }
    this.recomputeLeaderboard();
  }

  private recomputeLeaderboard() {
    const rows = [...this.state.players]
      .sort((a, b) => b.points - a.points || b.correctCalls - a.correctCalls || a.name.localeCompare(b.name))
      .map((p, i): LeaderboardRow => ({ ...p, rank: i + 1 }));
    this.state.leaderboard = rows;
  }

  private pushTicker(text: string) {
    this.state.ticker = [
      { id: `t${++tickerSeq}`, ts: Date.now(), text },
      ...this.state.ticker,
    ].slice(0, 14);
  }

  private commit() {
    // shallow-clone the parts React diffs on so subscribers re-render
    this.state = { ...this.state };
    for (const fn of this.listeners) fn(this.state);
  }
}

function mkPlayer(
  id: string,
  name: string,
  avatar: string,
  isYou: boolean,
  isBot: boolean,
): Player {
  return { id, name, avatar, isYou, isBot, points: 0, correctCalls: 0, totalCalls: 0, streak: 0 };
}

export { BOTS };
