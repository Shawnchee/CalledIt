"use client";

import type { GameState, TeamInfo } from "@/lib/game/types";

export function Scoreboard({ state }: { state: GameState }) {
  const { match, homeScore, awayScore, minute, status } = state;
  const clock = status === "pregame" ? "0'" : status === "fulltime" ? "FT" : `${minute}'`;

  return (
    <div className="rounded-2xl border border-border bg-surface/70 px-5 py-4 backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <Team t={match.home} />
        <div className="flex flex-col items-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-bg/60 px-3 py-1 text-[11px]">
            <span className="h-1.5 w-1.5 rounded-full bg-live animate-live" />
            <span className="font-semibold text-live">LIVE</span>
            <span className="text-muted">via TxLINE</span>
          </span>
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

function Team({ t, align = "left" }: { t: TeamInfo; align?: "left" | "right" }) {
  return (
    <div
      className={`flex flex-1 items-center gap-3 ${
        align === "right" ? "flex-row-reverse text-right" : ""
      }`}
    >
      <span className="text-3xl leading-none">{t.flag}</span>
      <div>
        <div className="font-display text-lg font-bold leading-none" style={{ color: t.color }}>
          {t.short}
        </div>
        <div className="mt-1 text-xs text-muted">{t.name}</div>
      </div>
    </div>
  );
}
