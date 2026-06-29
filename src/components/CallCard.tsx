"use client";

import { useEffect, useState } from "react";
import type { Call, Prop, Side } from "@/lib/game/types";
import { formatPct, payoutMultiple, potentialPoints } from "@/lib/game/scoring";
import { explorerTx } from "@/lib/solana/config";
import { CountdownRing } from "./CountdownRing";

export function CallCard({
  prop,
  yourCall,
  canCall,
  onCall,
}: {
  prop?: Prop;
  yourCall?: Call;
  canCall: boolean;
  onCall: (side: Side) => void;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!prop || prop.status !== "open") return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [prop]);

  if (!prop) {
    return (
      <div className="grid min-h-[320px] place-items-center rounded-3xl border border-border bg-surface/50 p-8 text-center">
        <div>
          <div className="mx-auto mb-3 h-2 w-2 animate-live rounded-full bg-brand" />
          <p className="font-display text-lg text-fg">Reading the game…</p>
          <p className="mt-1 text-sm text-muted">Next call drops as the match develops.</p>
        </div>
      </div>
    );
  }

  const total = Math.max(1, prop.windowEndsAt - prop.openedAt);
  const remaining = Math.max(0, prop.windowEndsAt - now);
  const progress = remaining / total;
  const seconds = Math.ceil(remaining / 1000);
  const open = prop.status === "open";
  const yesPctLabel = formatPct(prop.yesPct);
  const noPctLabel = formatPct(1 - prop.yesPct);

  return (
    <div className="animate-pop rounded-3xl border border-border bg-surface/70 p-6 backdrop-blur sm:p-8">
      {/* provenance + clock */}
      <div className="mb-4 flex items-center justify-between">
        <span className="rounded-full border border-border bg-bg/60 px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-market">
          {prop.superOddsType.replace(/_/g, " ")} · {prop.minute}&apos;
        </span>
        {open ? (
          <CountdownRing progress={progress} seconds={seconds} size={68} />
        ) : (
          <span className="rounded-full border border-no/40 bg-no/10 px-3 py-1 text-xs font-semibold text-no">
            LOCKED
          </span>
        )}
      </div>

      <h2 className="font-display text-2xl font-bold leading-snug text-fg sm:text-3xl">
        {prop.label}
      </h2>
      {prop.detail && <p className="mt-2 text-sm text-muted">{prop.detail}</p>}

      {/* the market — your opponent */}
      <div className="mt-5">
        <div className="mb-1.5 flex justify-between text-[11px] uppercase tracking-wider text-muted">
          <span>Market says YES {yesPctLabel}</span>
          <span>NO {noPctLabel}</span>
        </div>
        <div className="flex h-2 overflow-hidden rounded-full bg-bg">
          <div className="bg-yes/70" style={{ width: `${prop.yesPct * 100}%` }} />
          <div className="bg-no/60" style={{ width: `${(1 - prop.yesPct) * 100}%` }} />
        </div>
      </div>

      {/* your call / the buttons */}
      {yourCall ? (
        <YourCall call={yourCall} />
      ) : open ? (
        <div className="mt-6 grid grid-cols-2 gap-3">
          <CallButton
            side="YES"
            disabled={!canCall}
            points={potentialPoints("YES", prop.yesPct)}
            multiple={payoutMultiple("YES", prop.yesPct)}
            onClick={() => onCall("YES")}
          />
          <CallButton
            side="NO"
            disabled={!canCall}
            points={potentialPoints("NO", prop.yesPct)}
            multiple={payoutMultiple("NO", prop.yesPct)}
            onClick={() => onCall("NO")}
          />
        </div>
      ) : (
        <p className="mt-6 rounded-2xl border border-border bg-bg/40 px-4 py-3 text-center text-sm text-muted">
          Window closed — settling live from the pitch…
        </p>
      )}

      {!canCall && !yourCall && open && (
        <p className="mt-3 text-center text-xs text-market">
          Connect your wallet to lock a call (and mint the receipt).
        </p>
      )}
    </div>
  );
}

function CallButton({
  side,
  points,
  multiple,
  disabled,
  onClick,
}: {
  side: Side;
  points: number;
  multiple: number;
  disabled: boolean;
  onClick: () => void;
}) {
  const yes = side === "YES";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`group flex min-h-[84px] flex-col items-center justify-center gap-1 rounded-2xl border px-4 py-4 font-display font-bold transition active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100 cursor-pointer ${
        yes
          ? "border-yes/40 bg-yes/10 text-yes hover:bg-yes/20"
          : "border-no/40 bg-no/10 text-no hover:bg-no/20"
      }`}
    >
      <span className="text-2xl tracking-wide">{side}</span>
      <span className="font-mono tnum text-xs font-medium opacity-90">
        +{points.toLocaleString()} pts · {multiple.toFixed(1)}×
      </span>
    </button>
  );
}

function YourCall({ call }: { call: Call }) {
  const yes = call.side === "YES";
  return (
    <div className="mt-6 rounded-2xl border border-border bg-bg/50 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted">You called</span>
        <span
          className={`font-display text-xl font-bold ${yes ? "text-brand" : "text-no"}`}
        >
          {call.side}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-xs">
        {call.receiptSig ? (
          <a
            href={explorerTx(call.receiptSig)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 font-medium text-brand hover:underline"
          >
            <span>📜</span> Receipt on-chain — view on Solana Explorer ↗
          </a>
        ) : (
          <span className="inline-flex items-center gap-2 text-muted">
            <span className="h-1.5 w-1.5 animate-live rounded-full bg-market" />
            Writing receipt to devnet…
          </span>
        )}
      </div>
    </div>
  );
}
