"use client";

import type { LeaderboardRow } from "@/lib/game/types";

export function Leaderboard({ rows }: { rows: LeaderboardRow[] }) {
  return (
    <div className="rounded-2xl border border-border bg-surface/60 p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
        Crew leaderboard
      </h3>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.id}>
            {/* FIX-12.3: keying the row body by rank remounts it when the rank changes, replaying
                animate-pop — a stateless rank-change pop that stays clear of react-hooks v6 rules. */}
            <div
              key={r.rank}
              className={`flex animate-pop items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                r.isYou ? "border border-brand/40 bg-brand/10" : "bg-bg/40"
              }`}
            >
              <span
                className={`w-5 text-center font-mono tnum text-sm font-semibold ${
                  r.rank === 1 ? "text-market" : "text-muted"
                }`}
              >
                {r.rank}
              </span>
              <span className="text-xl leading-none">{r.avatar}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`truncate text-sm font-semibold ${
                      r.isYou ? "text-brand" : "text-fg"
                    }`}
                  >
                    {r.isYou ? "You" : r.name}
                  </span>
                  {r.streak >= 2 && (
                    <span className="font-mono tnum text-[11px] text-market">🔥{r.streak}</span>
                  )}
                </div>
                <div className="text-[11px] text-muted">
                  {r.correctCalls}/{r.totalCalls} called right
                </div>
              </div>
              <span className="font-mono tnum text-base font-bold text-fg">
                {r.points.toLocaleString()}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
