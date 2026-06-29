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

export const metadata: Metadata = {
  title: "CalledIt — call it before the market does",
  description:
    "A live World Cup play-along game: make calls against the live betting market, prove them on-chain, and settle the group chat. Powered by TxLINE + Solana.",
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
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute inset-0 bg-grid" />
          <div className="absolute left-1/2 top-[-18%] h-[62vh] w-[78vw] -translate-x-1/2 animate-glow rounded-full bg-brand/12 blur-[130px]" />
          <div className="absolute bottom-[-22%] right-[-8%] h-[48vh] w-[46vw] rounded-full bg-mint/10 blur-[130px]" />
          <div className="absolute inset-0 [box-shadow:inset_0_0_240px_60px_rgba(0,0,0,0.7)]" />
        </div>
        <SolanaProvider>{children}</SolanaProvider>
      </body>
    </html>
  );
}
