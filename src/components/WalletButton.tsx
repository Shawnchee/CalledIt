"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { useEffect, useMemo, useRef, useState } from "react";

/** Custom connect button — no default wallet-adapter UI, on-brand. */
export function WalletButton({ size = "md" }: { size?: "md" | "lg" }) {
  const { wallets, wallet, select, connect, disconnect, connected, connecting, publicKey } =
    useWallet();
  const [open, setOpen] = useState(false);
  const wantConnect = useRef(false);

  const list = useMemo(() => {
    const installed = wallets.filter((w) => w.readyState === WalletReadyState.Installed);
    return installed.length ? installed : wallets;
  }, [wallets]);

  // connect once a wallet is selected
  useEffect(() => {
    if (wallet && wantConnect.current && !connected && !connecting) {
      wantConnect.current = false;
      connect().catch(() => {});
    }
  }, [wallet, connected, connecting, connect]);

  // a11y: close the wallet dropdown on Escape (overlay click alone isn't keyboard-reachable)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const pad = size === "lg" ? "px-6 py-3 text-base" : "px-4 py-2 text-sm";

  if (connected && publicKey) {
    const a = publicKey.toBase58();
    return (
      <button
        onClick={() => disconnect()}
        className={`group inline-flex items-center gap-2 rounded-full border border-border bg-surface ${pad} font-mono tnum font-medium text-fg transition hover:border-no/60 cursor-pointer`}
        title="Disconnect"
      >
        <span className="h-2 w-2 rounded-full bg-brand" />
        {a.slice(0, 4)}…{a.slice(-4)}
        <span className="text-xs text-muted transition group-hover:text-no">Disconnect</span>
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={connecting}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`inline-flex items-center gap-2 rounded-full bg-brand ${pad} font-semibold text-bg transition hover:brightness-110 disabled:opacity-60 cursor-pointer glow-brand`}
      >
        <span className="h-2 w-2 rounded-full bg-bg/80" />
        {connecting ? "Connecting…" : "Connect Wallet"}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-64 animate-pop rounded-2xl border border-border bg-surface-2 p-2 shadow-2xl">
            <p className="px-3 py-2 text-xs uppercase tracking-wider text-muted">
              Sign up with Solana
            </p>
            {list.map((w) => (
              <button
                key={w.adapter.name}
                onClick={() => {
                  wantConnect.current = true;
                  select(w.adapter.name);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-fg transition hover:bg-surface cursor-pointer"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={w.adapter.icon} alt="" className="h-5 w-5 rounded" />
                {w.adapter.name}
                {w.readyState !== WalletReadyState.Installed && (
                  <span className="ml-auto text-xs text-muted">Not detected</span>
                )}
              </button>
            ))}
            {list.length === 0 && (
              <p className="px-3 py-2 text-sm text-muted">
                No Solana wallet found. Install Phantom to play.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
