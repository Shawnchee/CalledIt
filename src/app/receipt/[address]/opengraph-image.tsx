import { ImageResponse } from "next/og";
import { fetchReceipt } from "@/lib/solana/calledit-client";
import { beatWindowBySec, marketToneLine, outcomeCopy, pctLabel, sideProbBps } from "./copy";

export const alt = "CalledIt receipt — a timestamped call, proved on Solana";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// Receipts change over time (unsettled → settled, points land) — never cache a stale card.
export const dynamic = "force-dynamic";

const COLORS = {
  bg: "#f3f4f6",
  surface: "#ffffff",
  border: "#e3e6eb",
  fg: "#0e1116",
  muted: "#5b6573",
  brand: "#1b53f0",
  market: "#b26a00",
  yes: "#12925a",
  no: "#e23a2e",
};

/**
 * Best-effort Space Grotesk loader for the "Broadsheet" brand headline.
 * Never throws and never blocks the card on a slow/offline font fetch — a
 * missing font just falls back to the system sans, still on-brand via color.
 */
async function loadHeadlineFont(): Promise<ArrayBuffer | null> {
  try {
    const cssRes = await fetch("https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@700", {
      headers: {
        // Google serves woff2 by default (unsupported by satori) — an older
        // Chrome UA gets ttf, which ImageResponse can actually parse.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(3000),
    });
    const css = await cssRes.text();
    const match = css.match(/src: url\(([^)]+)\) format\('(?:truetype|opentype)'\)/);
    if (!match) return null;
    const fontRes = await fetch(match[1], { signal: AbortSignal.timeout(3000) });
    if (!fontRes.ok) return null;
    return await fontRes.arrayBuffer();
  } catch {
    return null;
  }
}

export default async function Image({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const [receipt, fontData] = await Promise.all([fetchReceipt(address), loadHeadlineFont()]);
  // NOTE: `next/og` only falls back to its bundled default font when
  // `options.fonts` is `undefined` (`options.fonts || defaultFonts`) — an
  // explicit empty array is truthy and short-circuits that fallback, which
  // throws "No fonts are loaded". So: `undefined`, never `[]`, on the miss path.
  const fonts = fontData
    ? [{ name: "Space Grotesk", data: fontData, weight: 700 as const, style: "normal" as const }]
    : undefined;
  // Next's bundled default font registers itself under the family name "geist".
  const fontFamily = fontData ? "Space Grotesk" : "geist";

  if (!receipt) {
    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "100%",
            height: "100%",
            background: COLORS.bg,
            fontFamily,
            padding: "72px 84px",
          }}
        >
          <Wordmark fontFamily={fontFamily} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 60, fontWeight: 700, color: COLORS.fg }}>Receipt not found</div>
            <div style={{ marginTop: 18, fontSize: 28, color: COLORS.muted, maxWidth: 820 }}>
              This link doesn&apos;t point at a CalledIt receipt on devnet.
            </div>
          </div>
          <div style={{ fontSize: 20, color: COLORS.muted }}>
            Called it before the market does — calledit.app
          </div>
        </div>
      ),
      { ...size, fonts },
    );
  }

  const pct = pctLabel(sideProbBps(receipt));
  const outcome = outcomeCopy(receipt);
  const tone =
    outcome.tone === "correct" ? COLORS.yes : outcome.tone === "incorrect" ? COLORS.no : COLORS.market;
  const beatBy = beatWindowBySec(receipt);
  const stamped = new Date(receipt.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          background: COLORS.bg,
          fontFamily,
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 28,
            left: 28,
            right: 28,
            bottom: 28,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 24,
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "100%",
            height: "100%",
            padding: "72px 84px 56px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Wordmark fontFamily={fontFamily} />
            <div
              style={{
                display: "flex",
                fontSize: 22,
                fontWeight: 700,
                color: tone,
                border: `2px solid ${tone}`,
                borderRadius: 999,
                padding: "10px 24px",
                letterSpacing: 2,
                textTransform: "uppercase",
              }}
            >
              {outcome.stamp}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                fontSize: 26,
                color: COLORS.muted,
                textTransform: "uppercase",
                letterSpacing: 3,
              }}
            >
              Fixture #{receipt.matchId} · Prop #{receipt.propId}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 20, marginTop: 16 }}>
              <div style={{ display: "flex", fontSize: 116, fontWeight: 700, color: COLORS.fg, letterSpacing: -2 }}>
                {receipt.side}
              </div>
              <div style={{ display: "flex", fontSize: 60, color: COLORS.muted }}>@</div>
              <div style={{ display: "flex", fontSize: 116, fontWeight: 700, color: COLORS.fg, letterSpacing: -2 }}>
                {pct}
              </div>
            </div>
            <div style={{ display: "flex", fontSize: 32, color: COLORS.muted, marginTop: 8 }}>
              {marketToneLine(receipt)} — {outcome.detail}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderTop: `1px solid ${COLORS.border}`,
              paddingTop: 28,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 18, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 2 }}>
                Stamped on Solana
              </div>
              <div style={{ display: "flex", fontSize: 25, color: COLORS.fg, marginTop: 6 }}>
                {stamped}
                {beatBy >= 0 ? ` · ${beatBy}s before the window closed` : ""}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 18,
                fontWeight: 600,
                color: COLORS.brand,
                border: `1px solid ${COLORS.border}`,
                background: COLORS.surface,
                borderRadius: 999,
                padding: "10px 22px",
              }}
            >
              devnet · on-chain receipt
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}

function Wordmark({ fontFamily }: { fontFamily: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div
        style={{
          display: "flex",
          width: 56,
          height: 56,
          borderRadius: 14,
          background: COLORS.brand,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width="30"
          height="30"
          fill="none"
          stroke="#ffffff"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <div style={{ display: "flex", fontFamily, fontWeight: 700, fontSize: 30, color: COLORS.fg }}>
        Called<span style={{ color: COLORS.brand }}>It</span>
      </div>
    </div>
  );
}
