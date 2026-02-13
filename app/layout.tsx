import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import GoogleAnalytics from "./components/GoogleAnalytics";
import TrackingPixels from "./components/TrackingPixels";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://teaser.piilk.com"),
  title: "PIILK - Nothing after. Period.",
  description: "Clean protein, no compromise. NYC 2026",
  icons: {
    icon: "/favicon-v2.png",
    apple: "/favicon-v2.png",
  },
  openGraph: {
    title: "PIILK - Nothing after. Period.",
    description: "Clean protein, no compromise. NYC 2026",
    url: "https://teaser.piilk.com",
    siteName: "PIILK",
    type: "website",
    images: [
      {
        url: "https://teaser.piilk.com/og-image-v2.png",
        width: 1200,
        height: 630,
        alt: "PIILK",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PIILK - Nothing after. Period.",
    description: "Clean protein, no compromise. NYC 2026",
    images: ["https://teaser.piilk.com/og-image-v2.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <GoogleAnalytics />
        <TrackingPixels />
        {children}
      </body>
    </html>
  );
}
