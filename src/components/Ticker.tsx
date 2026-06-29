"use client";

import type { GameState } from "@/lib/game/types";

export function Ticker({ ticker }: { ticker: GameState["ticker"] }) {
  return (
    <div className="rounded-2xl border border-border bg-surface/60 p-4">
      <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-live animate-live" />
        Live moments
      </h3>
      <ul className="space-y-2">
        {ticker.length === 0 && (
          <li className="text-sm text-muted">Waiting for kick-off…</li>
        )}
        {ticker.map((t) => (
          <li
            key={t.id}
            className="animate-rise text-sm leading-snug text-fg/90"
          >
            {t.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
