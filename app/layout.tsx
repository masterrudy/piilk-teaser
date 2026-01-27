import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { GoogleAnalytics } from './components/GoogleAnalytics';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'PIILK - Nothing after. Period.',
  description: 'Clean protein, no compromise. NYC 2026.',
  icons: {
    icon: '/Piilk_icon.png',
  },
  openGraph: {
    title: 'PIILK - Nothing after. Period.',
    description: 'Clean protein, no compromise. NYC 2026.',
    images: ['/og-image.png'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <GoogleAnalytics />
        {children}
      </body>
    </html>
  );
}
