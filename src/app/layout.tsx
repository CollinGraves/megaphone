import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { appUrl } from "@/lib/env";
import "./globals.css";
import { BRAND } from "@/lib/brand";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(appUrl()),
  title: {
    default: `${BRAND}: AI news that affects your company`,
    template: `%s · ${BRAND}`,
  },
  description:
    `AI news filtered to your industry and the tools your company runs. Model releases, price changes, retirements and regulation. Free, from North Labs.`,
  openGraph: { siteName: `${BRAND} by North Labs`, type: "website" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
