import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { SolanaProvider } from "@/lib/solana/wallet-provider";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  weight: ["500", "600", "700"],
  subsets: ["latin"],
});

const title = "CalledIt — call it before the market does";
const description =
  "A live World Cup play-along game: make calls against the live betting market, prove them on-chain, and settle the group chat. Powered by TxLINE + Solana.";

export const metadata: Metadata = {
  // TODO: set NEXT_PUBLIC_SITE_URL to the production Vercel URL once deployed (FIX-02).
  // Falls back to localhost so local dev/build never breaks on a missing env var.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title,
  description,
  openGraph: {
    title,
    description,
    images: [{ url: "/og.png", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <SolanaProvider>{children}</SolanaProvider>
      </body>
    </html>
  );
}
