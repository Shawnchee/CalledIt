"use client";

import { explorerTx } from "@/lib/solana/config";

export type Toast = {
  id: string;
  kind: "pending" | "confirmed" | "failed" | "called-it" | "missed";
  title: string;
  body?: string;
  sig?: string;
};

export function Toasts({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  return (
    // FIX-13: below `sm`, the CallCard's YES/NO buttons can sit low enough in the viewport
    // that 2+ stacked bottom-right toasts cover them; anchor to the top (clear of the sticky
    // header) on phones and keep the original bottom-right placement from `sm` up.
    <div className="pointer-events-none fixed right-4 top-20 z-50 flex w-[min(92vw,380px)] flex-col gap-2 sm:top-auto sm:bottom-4">
      {toasts.map((t) => (
        <ToastCard key={t.id} t={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastCard({ t, onDismiss }: { t: Toast; onDismiss: (id: string) => void }) {
  const styles: Record<Toast["kind"], string> = {
    pending: "border-border bg-surface-2",
    confirmed: "border-brand/40 bg-surface-2",
    failed: "border-no/50 bg-surface-2",
    "called-it": "border-brand/60 bg-surface-2 glow-brand",
    missed: "border-border bg-surface-2",
  };
  return (
    <div
      className={`pointer-events-auto animate-pop rounded-2xl border p-4 shadow-2xl ${styles[t.kind]}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <Badge kind={t.kind} />
        <div className="min-w-0 flex-1">
          <p
            className={`font-display text-sm font-bold ${
              t.kind === "called-it" ? "text-brand" : t.kind === "failed" ? "text-no" : "text-fg"
            }`}
          >
            {t.title}
          </p>
          {t.body && <p className="mt-0.5 truncate text-xs text-muted">{t.body}</p>}
          {t.sig && (
            <a
              href={explorerTx(t.sig)}
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 inline-block font-mono text-xs text-brand hover:underline"
            >
              view receipt ↗
            </a>
          )}
        </div>
        <button
          onClick={() => onDismiss(t.id)}
          className="text-muted hover:text-fg cursor-pointer"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function Badge({ kind }: { kind: Toast["kind"] }) {
  if (kind === "pending")
    return <span className="mt-0.5 h-4 w-4 animate-live rounded-full bg-market" />;
  const map: Record<string, { ch: string; cls: string }> = {
    confirmed: { ch: "✓", cls: "bg-brand/20 text-brand" },
    "called-it": { ch: "✓", cls: "bg-brand/20 text-brand" },
    failed: { ch: "!", cls: "bg-no/20 text-no" },
    missed: { ch: "✕", cls: "bg-bg text-muted" },
  };
  const s = map[kind] ?? map.confirmed;
  return (
    <span
      className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs font-bold ${s.cls}`}
    >
      {s.ch}
    </span>
  );
}
