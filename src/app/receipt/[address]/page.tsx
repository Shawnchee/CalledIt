import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { Brand } from "@/components/Brand";
import { fetchReceipt } from "@/lib/solana/calledit-client";
import { explorerAddress } from "@/lib/solana/config";
import { isStablePrice } from "@/lib/txline/mapping";
import {
  beatWindowBySec,
  formatTimestamp,
  marketToneLine,
  outcomeCopy,
  pctLabel,
  sideProbBps,
  type OutcomeCopy,
} from "./copy";
import { ReceiptActions } from "./ReceiptActions";

type Params = Promise<{ address: string }>;
type Search = Promise<{ [key: string]: string | string[] | undefined }>;

// Shared across generateMetadata + the page's own render for this request —
// React's cache() dedupes the identical fetchReceipt(address) call so a
// single page load only hits devnet once.
const getReceipt = cache(fetchReceipt);

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { address } = await params;
  const receipt = await getReceipt(address);

  if (!receipt) {
    return { title: "Receipt not found — CalledIt" };
  }

  const pct = pctLabel(sideProbBps(receipt));
  const { stamp } = outcomeCopy(receipt);
  const title = `${receipt.side} @ ${pct} — ${stamp} · CalledIt`;
  const description = `Called ${receipt.side} at ${pct} — ${marketToneLine(receipt)}. Stamped on Solana before the window closed.`;

  return {
    title,
    description,
    // Next replaces (not merges) the parent's openGraph/twitter objects, so
    // `type`/`card` have to be restated here or the rich "large image" card
    // the root layout sets up quietly degrades to a small "summary" card.
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { address } = await params;
  const [receipt, sp] = await Promise.all([getReceipt(address), searchParams]);

  if (!receipt) {
    return <NotFoundCard address={address} />;
  }

  const matchLabel = firstParam(sp.match);
  const propLabel = firstParam(sp.prop);
  const ts = firstParam(sp.ts);
  const mid = firstParam(sp.mid);

  const pctBps = sideProbBps(receipt);
  const outcome = outcomeCopy(receipt);
  const beatBy = beatWindowBySec(receipt);

  return (
    <main className="min-h-dvh">
      <header className="border-b border-border bg-bg/80 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Link href="/" className="cursor-pointer">
            <Brand />
          </Link>
          <Link
            href="/room"
            className="rounded-full border border-border bg-surface px-4 py-1.5 text-sm font-semibold text-fg transition hover:border-brand/50"
          >
            Play CalledIt →
          </Link>
        </div>
      </header>

      <div className="relative mx-auto max-w-2xl px-4 py-10 sm:py-14">
        <div className="absolute inset-x-6 top-10 -z-10 h-40 rounded-[2.4rem] bg-brand/10 blur-3xl sm:inset-x-10" />
        <div className="animate-pop overflow-hidden rounded-3xl border border-border bg-surface/80 shadow-2xl">
          {/* the stamp */}
          <div className={`flex items-center justify-between px-6 py-4 sm:px-8 ${toneBg(outcome.tone)}`}>
            <span
              className={`font-display text-sm font-bold uppercase tracking-[0.15em] ${toneText(outcome.tone)}`}
            >
              {outcome.stamp}
            </span>
            <span className="font-mono tnum text-xs text-muted">{outcome.detail}</span>
          </div>

          <div className="p-6 sm:p-8">
            <p className="text-xs uppercase tracking-[0.2em] text-muted">
              {matchLabel ?? `Fixture #${receipt.matchId}`}
            </p>
            <h1 className="mt-2 font-display text-4xl font-bold leading-tight text-fg sm:text-5xl">
              {receipt.side} <span className="text-muted">@</span> {pctLabel(pctBps)}
            </h1>
            <p className="mt-2 text-lg text-muted">
              {propLabel ?? `Prop #${receipt.propId}`} — <span className="text-fg">{marketToneLine(receipt)}</span>.
            </p>

            {/* market split, same visual language as the live CallCard */}
            <div className="mt-5">
              <div className="mb-1.5 flex justify-between text-[11px] uppercase tracking-wider text-muted">
                <span>Market said YES {pctLabel(receipt.marketPct)}</span>
                <span>NO {pctLabel(10_000 - receipt.marketPct)}</span>
              </div>
              <div className="flex h-2 overflow-hidden rounded-full bg-bg">
                <div className="bg-yes/70" style={{ width: `${receipt.marketPct / 100}%` }} />
                <div className="bg-no/60" style={{ width: `${(10_000 - receipt.marketPct) / 100}%` }} />
              </div>
            </div>

            {/* the on-chain timestamp proof — the anti-hindsight mechanism, made visible */}
            <div className="mt-6 rounded-2xl border border-border bg-bg/40 p-4">
              <p className="text-xs uppercase tracking-wider text-muted">Stamped on Solana</p>
              <p className="mt-1 font-mono tnum text-sm text-fg">{formatTimestamp(receipt.createdAt)}</p>
              <p className="mt-1 text-xs text-muted">
                {beatBy >= 0
                  ? `Called ${beatBy}s before the window closed — before the outcome, not after.`
                  : "Window timing unavailable for this receipt."}
              </p>
            </div>

            <ProvenanceChip ts={ts} mid={mid} />

            <div className="mt-6 flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate font-mono text-[11px] text-muted">{receipt.address}</p>
                <a
                  href={explorerAddress(receipt.address)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-brand hover:underline"
                >
                  View raw account on Solana Explorer ↗
                </a>
              </div>
              <ReceiptActions address={receipt.address} />
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted">
          Free-to-play, points only — this is a receipt for a call, not a payout.
        </p>
      </div>
    </main>
  );
}

function ProvenanceChip({ ts, mid }: { ts?: string; mid?: string }) {
  const stable = mid ? isStablePrice(mid) : undefined;
  const hasContext = Boolean(ts || mid);
  return (
    <div className="mt-4 rounded-2xl border border-border bg-bg/30 p-3">
      <p className="text-xs font-medium text-fg">
        {hasContext
          ? "Market price sourced from TxLINE — odds anchored on-chain (txoracle)."
          : "Market price captured at call time — app-attested today, oracle-verifiable next."}
      </p>
      {hasContext && (
        <p className="mt-1 font-mono text-[10px] text-muted">
          {ts && `Ts ${ts}`}
          {ts && mid && "  ·  "}
          {mid && `MessageId ${mid}`}
          {stable != null && `  ·  StablePrice ${stable ? "✓" : "—"}`}
        </p>
      )}
    </div>
  );
}

function NotFoundCard({ address }: { address: string }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-md rounded-3xl border border-border bg-surface/70 p-8 text-center">
        <div className="flex justify-center">
          <Brand />
        </div>
        <p className="mt-6 font-display text-xl font-bold text-fg">No receipt at that address</p>
        <p className="mt-2 break-all text-sm text-muted">
          <span className="font-mono text-xs">{address}</span>
        </p>
        <p className="mt-2 text-sm text-muted">
          That&apos;s not a CalledIt CallReceipt on devnet — check the link, or it may not exist.
        </p>
        <Link
          href="/room"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 font-display font-semibold text-bg transition hover:brightness-110 glow-brand"
        >
          Play CalledIt →
        </Link>
      </div>
    </main>
  );
}

function toneBg(tone: OutcomeCopy["tone"]): string {
  if (tone === "correct") return "bg-yes/10";
  if (tone === "incorrect") return "bg-no/5";
  return "bg-market/10";
}

function toneText(tone: OutcomeCopy["tone"]): string {
  if (tone === "correct") return "text-yes";
  if (tone === "incorrect") return "text-no";
  return "text-market";
}
