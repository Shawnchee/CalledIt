import Link from "next/link";
import { Brand } from "@/components/Brand";
import { WalletButton } from "@/components/WalletButton";
import { payoutMultiple, potentialPoints } from "@/lib/game/scoring";

export default function Landing() {
  return (
    <main className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Brand />
          <div className="flex items-center gap-3">
            <Link
              href="/room"
              className="hidden text-sm font-medium text-muted transition hover:text-fg sm:block"
            >
              Enter the room
            </Link>
            <WalletButton />
          </div>
        </div>
      </header>

      {/* hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 lg:grid-cols-[1.1fr_0.9fr] lg:py-20">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1 text-xs text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-live animate-live" /> World Cup 2026 · Track B
          </span>
          <h1 className="mt-5 font-display text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
            Call it before the <span className="text-market">market</span> does.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted">
            A live play-along for every match: call what happens next{" "}
            <span className="text-fg">against the live betting market</span>, and your crew gets a
            provable, on-chain leaderboard of who actually reads the game.
          </p>
          <p className="mt-3 max-w-xl text-base text-fg/80">
            Everyone&apos;s a genius after the goal.{" "}
            <span className="font-semibold text-brand">CalledIt keeps the receipts.</span>
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <WalletButton size="lg" />
            <Link
              href="/room"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-6 py-3 font-display font-semibold text-fg transition hover:border-brand/50 cursor-pointer"
            >
              Enter the match →
            </Link>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-5 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-market" /> Live odds via TxLINE
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" /> Receipts on Solana
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-fg/50" /> Free to play · no wager
            </span>
          </div>
        </div>

        <PreviewCard />
      </section>

      {/* how it works */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-muted">
          How it works
        </h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <Step
            n="01"
            title="Call against the market"
            body="Each window, TxLINE's live odds set the line. Calling what the market doubts pays more — your payout is its fair odds."
          />
          <Step
            n="02"
            title="It's stamped on-chain"
            body="The moment you tap in, your call is written to Solana — side, market %, block-time — before the outcome. Provable, not a boast."
          />
          <Step
            n="03"
            title="Settle the group chat"
            body="TxLINE resolves it live. The crew leaderboard moves with the pitch and crowns whoever actually reads the game."
          />
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-4 py-12 text-sm text-muted">
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
          <Brand />
          <p>Powered by TxLINE live odds + Solana · devnet</p>
        </div>
      </footer>
    </main>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface/50 p-5">
      <span className="font-mono tnum text-sm text-brand">{n}</span>
      <h3 className="mt-2 font-display text-lg font-bold text-fg">{title}</h3>
      <p className="mt-1.5 text-sm text-muted">{body}</p>
    </div>
  );
}

/** Market split shown in the static preview — kept in sync with the engine's math below. */
const PREVIEW_YES_PCT = 0.27;

/** Static product preview — sells the mechanic at a glance. */
function PreviewCard() {
  const yesPts = potentialPoints("YES", PREVIEW_YES_PCT);
  const yesMult = payoutMultiple("YES", PREVIEW_YES_PCT);
  const noPts = potentialPoints("NO", PREVIEW_YES_PCT);
  const noMult = payoutMultiple("NO", PREVIEW_YES_PCT);

  return (
    <div className="relative">
      <div className="absolute -inset-3 -z-10 rounded-[2.4rem] bg-brand/10 blur-3xl sm:-inset-6" />
      <div className="device-frame">
        <div className="rounded-[1.4rem] border border-border bg-surface/85 p-6 backdrop-blur">
        <div className="mb-4 flex items-center justify-between">
          <span className="rounded-full border border-border bg-bg/60 px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-market">
            NEXT GOAL · 24&apos;
          </span>
          <span className="grid h-12 w-12 place-items-center rounded-full border-2 border-yes font-mono tnum text-lg font-semibold text-yes">
            9
          </span>
        </div>
        <h3 className="font-display text-2xl font-bold leading-snug">
          Argentina to score in the next 10 minutes?
        </h3>
        <div className="mt-4">
          <div className="mb-1.5 flex justify-between text-[11px] uppercase tracking-wider text-muted">
            <span>Market says YES 27%</span>
            <span>NO 73%</span>
          </div>
          <div className="flex h-2 overflow-hidden rounded-full bg-bg">
            <div className="bg-yes/70" style={{ width: "27%" }} />
            <div className="bg-no/60" style={{ width: "73%" }} />
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="flex min-h-[84px] flex-col items-center justify-center rounded-2xl border border-yes/40 bg-yes/10 font-display font-bold text-yes">
            <span className="text-2xl">YES</span>
            <span className="font-mono tnum text-xs opacity-90">
              +{yesPts} pts · {yesMult.toFixed(1)}×
            </span>
          </div>
          <div className="flex min-h-[84px] flex-col items-center justify-center rounded-2xl border border-no/40 bg-no/10 font-display font-bold text-no">
            <span className="text-2xl">NO</span>
            <span className="font-mono tnum text-xs opacity-90">
              +{noPts} pts · {noMult.toFixed(1)}×
            </span>
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-muted">
          Call the longshot the market doubts → bank the big points.
        </p>
        </div>
      </div>
    </div>
  );
}
