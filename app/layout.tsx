import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
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
      <head>
        <link rel="icon" href="/favicon.png" type="image/png" />
        <link rel="apple-touch-icon" href="/favicon.png" />
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-PFR2X0QFJ2"></script>
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
      <body className={inter.className}>
        {children}
      </body>
    </html>
  );
}
