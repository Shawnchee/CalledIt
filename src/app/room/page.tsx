"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAnchorWallet, useWallet } from "@solana/wallet-adapter-react";
import { useGame } from "@/lib/game/use-game";
import type { GameMode } from "@/lib/game/engine";
import { recordCall } from "@/lib/solana/calledit-client";
import { receiptHref } from "@/lib/solana/receipt-link";
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
  // Suspense boundary required by Next 16 for useSearchParams (reads ?crew=, ?feed=, …)
  return (
    <Suspense fallback={null}>
      <RoomView />
    </Suspense>
  );
}

/**
 * Decides replay vs live before mounting the game. `?feed=live` only engages the
 * live path when the status endpoint confirms creds are actually set — so
 * without creds (or with a bad param) the app falls back to the recorded replay
 * and behaves exactly like the default demo. The status probe also lets the
 * default replay auto-suggest live when creds ARE present.
 */
function RoomView() {
  const searchParams = useSearchParams();
  const crew = searchParams.get("crew") || "Demo crew";
  const wantLive = searchParams.get("feed") === "live";
  const fixtureId = Number(searchParams.get("fixtureId")) || undefined;
  const windowSec = Number(searchParams.get("window")) || undefined;

  const [liveAvailable, setLiveAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    fetch("/api/txline/status")
      .then((r) => r.json())
      .then((d: { live?: boolean }) => {
        if (active) setLiveAvailable(Boolean(d.live));
      })
      .catch(() => {
        if (active) setLiveAvailable(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Only block on the probe when live was explicitly requested; the default
  // replay renders immediately (unchanged behaviour) and picks up the hint later.
  if (wantLive && liveAvailable === null) {
    return <FeedGate />;
  }

  const mode: GameMode = wantLive && liveAvailable ? "live" : "replay";
  return (
    <RoomGame
      mode={mode}
      fixtureId={fixtureId}
      windowSec={windowSec}
      crew={crew}
      liveAvailable={liveAvailable === true}
    />
  );
}

function FeedGate() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="text-center">
        <div className="mx-auto mb-3 h-2 w-2 animate-live rounded-full bg-brand" />
        <p className="font-display text-lg text-fg">Checking for a live TxLINE feed…</p>
        <p className="mt-1 text-sm text-muted">Falls back to the recorded replay if none is configured.</p>
      </div>
    </main>
  );
}

function RoomGame({
  mode,
  fixtureId,
  windowSec,
  crew,
  liveAvailable,
}: {
  mode: GameMode;
  fixtureId?: number;
  windowSec?: number;
  crew: string;
  liveAvailable: boolean;
}) {
  const { engine, state } = useGame(mode, { fixtureId, windowSec });
  const { connected, publicKey } = useWallet();
  const anchorWallet = useAnchorWallet();
  const [started, setStarted] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  // FIX-01: one salt base per room session. matchId stays the real TxLINE fixture id (provenance),
  // but propId is salted so replaying with the same wallet mints fresh CallReceipt PDAs instead of
  // colliding on ["call", player, matchId, propId]. ~1.78e11, safely < 2^53; prop.id stays the low digits.
  const [sessionBase] = useState(() => Math.floor(Date.now() / 1000) * 100);

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
    engine.setYouSettledHandler((call, prop) => {
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
    });
    return () => {
      engine.setYouSettledHandler(undefined);
    };
  }, [engine, pushToast]);

  const handleCall = useCallback(
    async (side: Side) => {
      const prop = state.activeProp;
      if (!prop) return;
      const call = engine.placeCall(prop.id, side);
      if (!call) {
        // FIX-12.4: window locked between render and tap — surface it instead of a dead button
        pushToast({ id: `late-${prop.id}`, kind: "failed", title: "Too late — window closed", body: prop.label });
        return;
      }
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
        const { sig, receipt } = await recordCall(anchorWallet, {
          matchId: state.match.fixtureId,
          propId: sessionBase + prop.id, // salted per session (FIX-01); prop.id remains the low digits
          side,
          yesPct: prop.yesPct,
          windowEndsAt: prop.windowEndsAt,
        });
        engine.attachReceipt(call.id, sig, receipt);
        updateToast(tId, { kind: "confirmed", title: "Receipt minted on-chain", sig });
      } catch (e) {
        updateToast(tId, {
          kind: "failed",
          title: "Receipt failed",
          body: (e as Error)?.message?.slice(0, 90) ?? "Try again",
        });
      }
    },
    [state.activeProp, state.match.fixtureId, sessionBase, anchorWallet, engine, pushToast, updateToast],
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
          <span className="hidden font-mono text-xs text-muted sm:block">
            Crew: <span className="font-semibold text-fg">{crew}</span>
          </span>
          <WalletButton />
        </div>
      </header>

      {!started ? (
        <Pregame
          match={state.match}
          connected={connected}
          mode={mode}
          suggestLive={mode === "replay" && liveAvailable}
          onKickOff={kickOff}
        />
      ) : (
        <div className="mx-auto max-w-6xl px-4 py-6">
          <Scoreboard state={state} mode={mode} />
          <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
            <div className="space-y-5">
              <CallCard
                prop={state.activeProp}
                yourCall={yourCall}
                canCall={connected}
                onCall={handleCall}
                match={state.match}
              />
              {state.status === "fulltime" && <FullTime state={state} crew={crew} />}
              <YourReceipts calls={state.calls} props={state.props} match={state.match} />
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
  mode,
  suggestLive,
  onKickOff,
}: {
  match: MatchInfo;
  connected: boolean;
  mode: GameMode;
  suggestLive: boolean;
  onKickOff: () => void;
}) {
  const live = mode === "live";
  return (
    <div className="mx-auto grid min-h-[70vh] max-w-xl place-items-center px-4">
      <div className="w-full rounded-3xl border border-border bg-surface/60 p-8 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">{match.competition}</p>
        <div className="mt-5 flex items-center justify-center gap-5">
          <Side flag={match.home.flag} short={match.home.short} />
          <span className="font-display text-2xl text-muted">vs</span>
          <Side flag={match.away.flag} short={match.away.short} />
        </div>
        <p className="mt-6 text-sm text-muted">
          {live
            ? "Streaming the live TxLINE feed. Calls open as the market moves — tap in before each window closes; every call gets a Solana receipt."
            : "Replaying a recorded TxLINE timeline. Make your calls against the market before each window closes — every call gets a Solana receipt."}
        </p>
        <div className="mt-6 space-y-3">
          {connected ? (
            <button
              onClick={onKickOff}
              className="w-full rounded-full bg-brand px-6 py-3 font-display font-bold text-bg transition hover:brightness-110 cursor-pointer glow-brand"
            >
              {live ? "Go live ⚽" : "Kick off ⚽"}
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
          {suggestLive && (
            <p className="text-xs text-muted">
              ⚡ A live TxLINE feed is configured —{" "}
              <Link href="/room?feed=live" className="font-semibold text-brand hover:underline">
                play it live
              </Link>
              .
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Side({ flag, short }: { flag: string; short: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-5xl">{flag}</span>
      <span className="font-display text-lg font-bold text-fg">{short}</span>
    </div>
  );
}

function FullTime({ state, crew }: { state: GameState; crew: string }) {
  const [copied, setCopied] = useState(false);
  const you = state.leaderboard.find((r) => r.isYou);
  const top = state.leaderboard[0];
  const won = you && top && you.id === top.id;

  const matchLabel = `${state.match.home.short} ${state.homeScore}–${state.awayScore} ${state.match.away.short}`;
  // best call = highest-points settled-correct call that has a branded receipt to link to
  const best = state.calls
    .filter((c) => c.playerId === "you" && c.correct && c.points != null && c.receiptAddress)
    .sort((a, b) => (b.points ?? 0) - (a.points ?? 0))[0];
  const bestProp = best ? state.props.find((p) => p.id === best.propId) : undefined;

  const shareReceipts = async () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const href = best ? receiptHref(best, bestProp, state.match) : undefined;
    const receiptUrl = href ? `${origin}${href}` : undefined;
    const marketPct = best
      ? Math.round((best.side === "YES" ? best.marketYesPct : 1 - best.marketYesPct) * 100)
      : 0;
    const lines = [
      `CalledIt — ${matchLabel} FT`,
      `🏆 #${you?.rank ?? "—"} · ${you?.points.toLocaleString()} pts · ${you?.correctCalls}/${you?.totalCalls} called right`,
      best && bestProp
        ? `Best call: ${bestProp.resolveLabel ?? bestProp.label} — market said ${marketPct}%, I called it.`
        : null,
      receiptUrl ?? origin,
    ].filter(Boolean);
    const text = lines.join("\n");

    // Prefer the native share sheet (great on-camera moment on mobile); fall back to clipboard.
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: "CalledIt — I called it", text, url: receiptUrl ?? origin });
        return;
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return; // user dismissed the share sheet — respect it
        // otherwise fall through to the clipboard path below
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked (insecure context) — no-op; the button just won't confirm
    }
  };

  const runItBack = () => {
    const q = crew && crew !== "Demo crew" ? `?crew=${encodeURIComponent(crew)}` : "";
    window.location.href = `/room${q}`;
  };

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
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <button
          onClick={shareReceipts}
          className="rounded-full bg-brand px-5 py-2.5 font-display font-semibold text-bg transition hover:brightness-110 cursor-pointer glow-brand"
        >
          {copied ? "Copied ✓" : "Share the receipts"}
        </button>
        <button
          onClick={runItBack}
          className="rounded-full border border-border bg-surface-2 px-5 py-2.5 font-display font-semibold text-fg transition hover:border-brand/50 cursor-pointer"
        >
          Run it back ↻
        </button>
      </div>
    </div>
  );
}
