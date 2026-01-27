import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

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
    images: [
      {
        url: "/pillk-logo.png",
        alt: "PIILK Logo",
      },
    ],
    type: "website",
  },

  twitter: {
    card: "summary_large_image",
    title: "PIILK - Nothing after. Period.",
    description: "Clean protein, no compromise. NYC 2026",
    images: ["/pillk-logo.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-PFR2X0QFJ2"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'G-PFR2X0QFJ2');
            `,
          }}
        />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
