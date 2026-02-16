import type { Metadata } from "next";
import "./b-styles.css";

export const metadata: Metadata = {
  title: "The After-feel Project | PIILK™",
  description: "Find your after-feel type. 30 seconds.",
  openGraph: {
    title: "I'm a Brick Stomach. What's yours?",
    description: "Find your after-feel type in 30 seconds.",
    url: "https://teaser.piilk.com/type",
    siteName: "PIILK™ by Armored Fresh",
  },
  twitter: {
    card: "summary_large_image",
    title: "I'm a Brick Stomach. What's yours?",
    description: "Find your after-feel type in 30 seconds.",
  },
};

export default function TypeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossOrigin="anonymous"
      />
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=JetBrains+Mono:wght@400;500&display=swap"
        rel="stylesheet"
      />
      {children}
    </>
  );
}
