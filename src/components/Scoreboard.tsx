"use client";

import type { GameState, TeamInfo } from "@/lib/game/types";
import type { GameMode } from "@/lib/game/engine";

export function Scoreboard({ state, mode = "replay" }: { state: GameState; mode?: GameMode }) {
  const { match, homeScore, awayScore, minute, status } = state;
  const clock = status === "pregame" ? "0'" : status === "fulltime" ? "FT" : `${minute}'`;

  return (
    <div className="rounded-2xl border border-border bg-surface/70 px-5 py-4 backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <Team t={match.home} />
        <div className="flex flex-col items-center">
          <FeedPill live={mode === "live"} />
          <div className="mt-2 font-mono tnum text-4xl font-bold tracking-tight">
            {homeScore}
            <span className="px-2 text-muted">:</span>
            {awayScore}
          </div>
          <div className="mt-0.5 font-mono tnum text-sm text-market">{clock}</div>
        </div>
        <Team t={match.away} align="right" />
      </div>
      <div className="mt-2 text-center text-[11px] uppercase tracking-[0.15em] text-muted">
        {match.competition}
      </div>
    </div>
  );
}

/**
 * Honest mode badge. LIVE only when the engine is actually driven by the live
 * TxLINE feed; the default demo runs a recorded timeline and says so, so the
 * pill can never claim "LIVE" over a scripted replay.
 */
function FeedPill({ live }: { live: boolean }) {
  // FIX-13: the descriptive suffix is dropped below `sm` — squeezed between the two
  // flex-1 Team blocks at phone width, the full text was wrapping the pill into a
  // 3-line blob instead of a one-line badge (and forcing the row wider than the viewport).
  if (live) {
    return (
      <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-border bg-bg/60 px-3 py-1 text-[11px]">
        <span className="h-1.5 w-1.5 rounded-full bg-live animate-live" />
        <span className="font-semibold text-live">LIVE</span>
        <span className="hidden text-muted sm:inline">· TxLINE</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-border bg-bg/60 px-3 py-1 text-[11px]">
      <span className="h-1.5 w-1.5 rounded-full bg-muted" />
      <span className="font-semibold text-fg">REPLAY</span>
      <span className="hidden text-muted sm:inline">· recorded TxLINE timeline</span>
    </span>
  );
}

function Team({ t, align = "left" }: { t: TeamInfo; align?: "left" | "right" }) {
  return (
    <div
      className={`flex flex-1 items-center gap-3 ${
        align === "right" ? "flex-row-reverse text-right" : ""
      }`}
    >
      <span className="text-3xl leading-none">{t.flag}</span>
      <div>
        <div className="font-display text-lg font-bold leading-none text-fg">{t.short}</div>
        <div className="mt-1 text-xs text-muted">{t.name}</div>
      </div>
    </div>
  );
}
