"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import type { PublicKey } from "@solana/web3.js";
import type { Call, MatchInfo, Prop } from "@/lib/game/types";
import { getPlayerReceipts, type CallReceiptData } from "@/lib/solana/calledit-client";
import { receiptHref } from "@/lib/solana/receipt-link";

export function YourReceipts({
  calls,
  props,
  match,
}: {
  calls: Call[];
  props: Prop[];
  match?: MatchInfo;
}) {
  const mine = calls.filter((c) => c.playerId === "you").slice().reverse();
  const propById = new Map(props.map((p) => [p.id, p]));
  const { publicKey } = useWallet();

  return (
    <div className="space-y-4">
      {/* keyed on the wallet so switching/disconnecting starts the on-chain
          read fresh instead of reactively resetting state inside an effect */}
      <Career key={publicKey?.toBase58() ?? "disconnected"} publicKey={publicKey} />

      <div className="rounded-2xl border border-border bg-surface/60 p-4">
        <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
          <span>📜</span> Your receipts — this session
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
              const href = receiptHref(c, prop, match);
              return (
                <li
                  key={c.id}
                  className="flex items-center gap-3 rounded-xl bg-bg/40 px-3 py-2"
                >
                  <span
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-bold ${
                      yes ? "bg-yes/15 text-yes" : "bg-no/15 text-no"
                    }`}
                  >
                    {c.side}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-fg/90">{prop?.label ?? "Call"}</p>
                    <p className="text-[11px] text-muted">
                      {settled ? (
                        c.correct ? (
                          <span className="text-yes">Called it · +{c.points} pts</span>
                        ) : (
                          <span className="text-muted">Missed</span>
                        )
                      ) : (
                        <span className="text-market">Live</span>
                      )}
                    </p>
                  </div>
                  {href ? (
                    <Link
                      href={href}
                      className="font-mono text-[11px] text-brand hover:underline"
                      title="View your CALLED IT receipt"
                    >
                      ↗
                    </Link>
                  ) : (
                    <span className="h-1.5 w-1.5 animate-live rounded-full bg-market" />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * "No database — your record IS the chain." Reads every CallReceipt this
 * wallet has ever minted straight off devnet (getPlayerReceipts), so it's
 * exactly as accurate right after a page refresh as it was before one — the
 * in-memory `calls` list above resets on refresh, this doesn't.
 */
function Career({ publicKey }: { publicKey: PublicKey | null }) {
  const { connection } = useConnection();
  const [receipts, setReceipts] = useState<CallReceiptData[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!publicKey) return;
    let active = true;
    getPlayerReceipts(publicKey, connection)
      .then((r) => {
        if (active) setReceipts(r);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [publicKey, connection]);

  if (!publicKey) {
    return (
      <div className="rounded-2xl border border-border bg-surface/60 p-4">
        <h3 className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
          <span>🏅</span> Career
        </h3>
        <p className="text-sm text-muted">Connect a wallet to see your lifetime on-chain record.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-border bg-surface/60 p-4">
        <h3 className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
          <span>🏅</span> Career
        </h3>
        <p className="text-sm text-muted">Couldn&apos;t reach devnet just now — refresh to retry.</p>
      </div>
    );
  }

  if (receipts === null) {
    return (
      <div className="rounded-2xl border border-border bg-surface/60 p-4">
        <h3 className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
          <span>🏅</span> Career
        </h3>
        <p className="flex items-center gap-2 text-sm text-muted">
          <span className="h-1.5 w-1.5 animate-live rounded-full bg-market" /> Reading your record off
          devnet…
        </p>
      </div>
    );
  }

  const settled = receipts.filter((r) => r.settled);
  const correct = settled.filter((r) => r.outcome === 1);
  const hitRate = settled.length ? Math.round((correct.length / settled.length) * 100) : null;
  const totalPoints = receipts.reduce((sum, r) => sum + r.points, 0);
  const bestLongshot = correct
    .map((r) => ({ r, sideProbPct: (r.side === "YES" ? r.marketPct : 10_000 - r.marketPct) / 100 }))
    .sort((a, b) => a.sideProbPct - b.sideProbPct)[0];

  return (
    <div className="rounded-2xl border border-border bg-surface/60 p-4">
      <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
        <span>🏅</span> Career
        <span className="ml-auto font-normal normal-case tracking-normal text-muted/80">
          on-chain · no database
        </span>
      </h3>

      {receipts.length === 0 ? (
        <p className="text-sm text-muted">
          No receipts minted yet on this wallet — your first call writes one.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Stat label="Lifetime calls" value={receipts.length.toLocaleString()} />
            <Stat label="Hit rate" value={hitRate != null ? `${hitRate}%` : "—"} />
            <Stat label="Points" value={totalPoints.toLocaleString()} />
            <Stat
              label="Best longshot"
              value={bestLongshot ? `${bestLongshot.sideProbPct.toFixed(0)}%` : "—"}
            />
          </div>

          <ul className="mt-3 space-y-1.5 border-t border-border pt-3">
            {receipts.slice(0, 5).map((r) => (
              <li key={r.address} className="flex items-center gap-3 rounded-xl bg-bg/40 px-3 py-2">
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-bold ${
                    r.side === "YES" ? "bg-yes/15 text-yes" : "bg-no/15 text-no"
                  }`}
                >
                  {r.side}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-fg/90">
                    Fixture #{r.matchId} · {(r.marketPct / 100).toFixed(0)}% market
                  </p>
                  <p className="text-[11px] text-muted">
                    {!r.settled ? (
                      <span className="text-market">Live</span>
                    ) : r.outcome === 1 ? (
                      <span className="text-yes">Called it · +{r.points} pts</span>
                    ) : (
                      <span className="text-muted">Missed</span>
                    )}
                  </p>
                </div>
                <Link
                  href={`/receipt/${r.address}`}
                  className="font-mono text-[11px] text-brand hover:underline"
                  title="View this CALLED IT receipt"
                >
                  ↗
                </Link>
              </li>
            ))}
          </ul>
          {receipts.length > 5 && (
            <p className="mt-2 text-center text-[11px] text-muted">
              +{receipts.length - 5} more on-chain
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-bg/40 px-3 py-2 text-center">
      <p className="font-mono tnum text-lg font-bold text-fg">{value}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted">{label}</p>
    </div>
  );
}
