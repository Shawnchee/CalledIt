"use client";

import type { Call, Prop } from "@/lib/game/types";
import { explorerTx } from "@/lib/solana/config";

export function YourReceipts({
  calls,
  props,
}: {
  calls: Call[];
  props: Prop[];
}) {
  const mine = calls.filter((c) => c.playerId === "you").slice().reverse();
  const propById = new Map(props.map((p) => [p.id, p]));

  return (
    <div className="rounded-2xl border border-border bg-surface/60 p-4">
      <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
        <span>📜</span> Your receipts
        <span className="ml-auto font-mono tnum text-muted">{mine.length}</span>
      </h3>
      {mine.length === 0 ? (
        <p className="text-sm text-muted">
          Your calls get stamped on Solana before the moment — proof you called it.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {mine.map((c) => {
            const prop = propById.get(c.propId);
            const settled = c.correct !== undefined;
            const yes = c.side === "YES";
            return (
              <li
                key={c.id}
                className="flex items-center gap-3 rounded-xl bg-bg/40 px-3 py-2"
              >
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-bold ${
                    yes ? "bg-brand/15 text-brand" : "bg-no/15 text-no"
                  }`}
                >
                  {c.side}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-fg/90">{prop?.label ?? "Call"}</p>
                  <p className="text-[11px] text-muted">
                    {settled ? (
                      c.correct ? (
                        <span className="text-brand">Called it · +{c.points} pts</span>
                      ) : (
                        <span className="text-muted">Missed</span>
                      )
                    ) : (
                      <span className="text-market">Live</span>
                    )}
                  </p>
                </div>
                {c.receiptSig ? (
                  <a
                    href={explorerTx(c.receiptSig)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[11px] text-brand hover:underline"
                  >
                    ↗
                  </a>
                ) : (
                  <span className="h-1.5 w-1.5 animate-live rounded-full bg-market" />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
