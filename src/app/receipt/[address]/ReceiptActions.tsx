"use client";

import { useState } from "react";

/** Share/copy the receipt's own permalink — the native share sheet on mobile
 * (great on-camera), clipboard everywhere else. Never throws on a blocked
 * clipboard (insecure context) or a dismissed share sheet. */
export function ReceiptActions({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = `${window.location.origin}/receipt/${address}`;
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: "CalledIt — I called it", url });
        return;
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return; // user dismissed — respect it
        // otherwise fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked — no-op; the button just won't confirm
    }
  };

  return (
    <button
      onClick={share}
      className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-display font-semibold text-bg transition hover:brightness-110 cursor-pointer glow-brand"
    >
      {copied ? "Link copied ✓" : "Share this receipt"}
    </button>
  );
}
