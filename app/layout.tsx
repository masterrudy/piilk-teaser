import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import GoogleAnalytics from "./components/GoogleAnalytics";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PIILK - Nothing after. Period.",
  description: "Clean protein, no compromise. NYC 2026",
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
  openGraph: {
    title: "PIILK - Nothing after. Period.",
    description: "Clean protein, no compromise. NYC 2026",
    url: "https://teaser.piilk.com",
    siteName: "PIILK",
    images: [
      {
        url: "https://teaser.piilk.com/og-image.png",
        width: 1200,
        height: 630,
        alt: "PIILK",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PIILK - Nothing after. Period.",
    description: "Clean protein, no compromise. NYC 2026",
    images: ["https://teaser.piilk.com/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <GoogleAnalytics />
        {children}
      </body>
    </html>
  );
}
