"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAnchorWallet, useWallet } from "@solana/wallet-adapter-react";
import { useGame } from "@/lib/game/use-game";
import { recordCall } from "@/lib/solana/calledit-client";
import type { GameState, MatchInfo, Side } from "@/lib/game/types";
import { Scoreboard } from "@/components/Scoreboard";
import { CallCard } from "@/components/CallCard";
import { Leaderboard } from "@/components/Leaderboard";
import { Ticker } from "@/components/Ticker";
import { YourReceipts } from "@/components/YourReceipts";
import { WalletButton } from "@/components/WalletButton";
import { Brand } from "@/components/Brand";
import { Toasts, type Toast } from "@/components/Toasts";

export default function RoomPage() {
  const { engine, state } = useGame();
  const { connected, publicKey } = useWallet();
  const anchorWallet = useAnchorWallet();
  const [started, setStarted] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = useCallback((t: Toast) => {
    setToasts((cur) => [t, ...cur.filter((x) => x.id !== t.id)].slice(0, 4));
    setTimeout(() => setToasts((cur) => cur.filter((x) => x.id !== t.id)), 7500);
  }, []);
  const updateToast = useCallback((id: string, patch: Partial<Toast>) => {
    setToasts((cur) => cur.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }, []);
  const dismiss = useCallback(
    (id: string) => setToasts((cur) => cur.filter((x) => x.id !== id)),
    [],
  );

  useEffect(() => {
    if (publicKey) {
      const a = publicKey.toBase58();
      engine.setYouIdentity(`${a.slice(0, 4)}…${a.slice(-4)}`);
    }
  }, [publicKey, engine]);

  useEffect(() => {
    engine.onYouSettled = (call, prop) => {
      if (call.correct) {
        pushToast({
          id: `s-${call.id}`,
          kind: "called-it",
          title: `CALLED IT · +${call.points?.toLocaleString()} pts`,
          body: prop.resolveLabel ?? prop.label,
          sig: call.receiptSig,
        });
      } else {
        pushToast({
          id: `s-${call.id}`,
          kind: "missed",
          title: "Missed that one",
          body: prop.resolveLabel ?? prop.label,
        });
      }
    };
    return () => {
      engine.onYouSettled = undefined;
    };
  }, [engine, pushToast]);

  const handleCall = useCallback(
    async (side: Side) => {
      const prop = state.activeProp;
      if (!prop) return;
      const call = engine.placeCall(prop.id, side);
      if (!call) return;
      if (!anchorWallet) {
        pushToast({
          id: `nc-${call.id}`,
          kind: "failed",
          title: "Connect a wallet to mint the receipt",
          body: prop.label,
        });
        return;
      }
      const tId = `tx-${call.id}`;
      pushToast({ id: tId, kind: "pending", title: `Locking ${side} on devnet…`, body: prop.label });
      try {
        const { sig } = await recordCall(anchorWallet, {
          matchId: state.match.fixtureId,
          propId: prop.id,
          side,
          yesPct: prop.yesPct,
        });
        engine.attachReceipt(call.id, sig);
        updateToast(tId, { kind: "confirmed", title: "Receipt minted on-chain", sig });
      } catch (e) {
        updateToast(tId, {
          kind: "failed",
          title: "Receipt failed",
          body: (e as Error)?.message?.slice(0, 90) ?? "Try again",
        });
      }
    },
    [state.activeProp, state.match.fixtureId, anchorWallet, engine, pushToast, updateToast],
  );

  const kickOff = () => {
    engine.start();
    setStarted(true);
  };

  const yourCall = state.activeProp
    ? state.calls.find((c) => c.playerId === "you" && c.propId === state.activeProp!.id)
    : undefined;

  return (
    <main className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" className="cursor-pointer">
            <Brand />
          </Link>
          <WalletButton />
        </div>
      </header>

      {!started ? (
        <Pregame match={state.match} connected={connected} onKickOff={kickOff} />
      ) : (
        <div className="mx-auto max-w-6xl px-4 py-6">
          <Scoreboard state={state} />
          <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
            <div className="space-y-5">
              <CallCard
                prop={state.activeProp}
                yourCall={yourCall}
                canCall={connected}
                onCall={handleCall}
              />
              {state.status === "fulltime" && <FullTime state={state} />}
              <YourReceipts calls={state.calls} props={state.props} />
            </div>
            <div className="space-y-5">
              <Leaderboard rows={state.leaderboard} />
              <Ticker ticker={state.ticker} />
            </div>
          </div>
        </div>
      )}

      <Toasts toasts={toasts} onDismiss={dismiss} />
    </main>
  );
}

function Pregame({
  match,
  connected,
  onKickOff,
}: {
  match: MatchInfo;
  connected: boolean;
  onKickOff: () => void;
}) {
  return (
    <div className="mx-auto grid min-h-[70vh] max-w-xl place-items-center px-4">
      <div className="w-full rounded-3xl border border-border bg-surface/60 p-8 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">{match.competition}</p>
        <div className="mt-5 flex items-center justify-center gap-5">
          <Side flag={match.home.flag} short={match.home.short} color={match.home.color} />
          <span className="font-display text-2xl text-muted">vs</span>
          <Side flag={match.away.flag} short={match.away.short} color={match.away.color} />
        </div>
        <p className="mt-6 text-sm text-muted">
          Replaying a live TxLINE feed. Make your calls against the market before each window
          closes — every call gets a Solana receipt.
        </p>
        <div className="mt-6 space-y-3">
          {connected ? (
            <button
              onClick={onKickOff}
              className="w-full rounded-full bg-brand px-6 py-3 font-display font-bold text-bg transition hover:brightness-110 cursor-pointer glow-brand"
            >
              Kick off ⚽
            </button>
          ) : (
            <>
              <p className="text-sm text-market">
                Connect your wallet (top right) to play — calls get a Solana receipt.
              </p>
              <button
                onClick={onKickOff}
                className="w-full rounded-full border border-border bg-surface-2 px-6 py-3 font-display font-semibold text-fg transition hover:border-brand/50 cursor-pointer"
              >
                Watch as spectator →
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Side({ flag, short, color }: { flag: string; short: string; color: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-5xl">{flag}</span>
      <span className="font-display text-lg font-bold" style={{ color }}>
        {short}
      </span>
    </div>
  );
}

function FullTime({ state }: { state: GameState }) {
  const you = state.leaderboard.find((r) => r.isYou);
  const top = state.leaderboard[0];
  const won = you && top && you.id === top.id;
  return (
    <div className="animate-pop rounded-3xl border border-brand/40 bg-surface/70 p-6 text-center">
      <p className="text-xs uppercase tracking-[0.2em] text-muted">Full time</p>
      <h2 className="mt-2 font-display text-2xl font-bold text-fg">
        {won ? "You read the game best 🏆" : `You finished #${you?.rank ?? "—"}`}
      </h2>
      <p className="mt-1 font-mono tnum text-sm text-muted">
        {you?.points.toLocaleString()} pts · {you?.correctCalls}/{you?.totalCalls} called right
      </p>
      <p className="mt-3 text-sm text-muted">
        The receipts are on-chain — no take-backs, no hindsight. Settle the group chat.
      </p>
    </div>
  );
}
