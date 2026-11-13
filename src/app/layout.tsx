import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { appUrl } from "@/lib/env";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(appUrl()),
  title: {
    default: "AI Radar — the AI news that matters to your business",
    template: "%s · AI Radar",
  },
  description:
    "AI Radar tracks hundreds of sources across the AI ecosystem and delivers the announcements that matter to you — model releases, pricing changes, regulation and more. By North Labs.",
  openGraph: { siteName: "AI Radar by North Labs", type: "website" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
